import Hyperswarm from 'hyperswarm'
import { join } from 'node:path'
import { access, writeFile } from 'node:fs/promises'
import { TaskStore } from '../p2p/task-store.js'
import { consumeCommands, ensureDir, peerDir, publishResponse, readNetwork, writeNetwork } from '../shared/control-plane.js'
import { createAgentRuntime } from '../ai/runtime-factory.js'
import { peerCommandSchema, type AgentManifest, type PeerCommand, type Task } from '../domain/types.js'
import { peerLogger } from '../presentation/logger.js'
import { selectAgent } from '../domain/routing.js'
import { delay, PollBackoff } from '../shared/async.js'
import { TaskExecutor } from './task-executor.js'
import { WorkflowCoordinator } from './workflow-coordinator.js'
import type { ConfiguredSpecialist, JobDefinition } from './config.js'
import { assignmentAge, assignmentExpired } from './assignment-policy.js'

const now = () => new Date().toISOString()

export class LocalWeavePeer {
  db!: TaskStore
  swarm!: Hyperswarm
  private stopped = false
  private readonly log
  private manifest!: AgentManifest
  private lastManifestAttempt = 0
  private manifestPublishedLogged = false
  private readonly seenNetworkPeers = new Set<string>()
  private readonly respondedTasks = new Set<string>()
  private readonly waitingTasks = new Set<string>()
  private lastNetworkView: string | undefined
  private readonly pollBackoff = new PollBackoff()
  private lastSnapshot = ''
  private readonly agentRuntime
  private executor!: TaskExecutor
  private incidents!: WorkflowCoordinator

  constructor(
    private readonly agent: ConfiguredSpecialist,
    private readonly workflows: JobDefinition[],
    private readonly assignmentTimeoutMs: number
  ) {
    this.log = peerLogger(agent.id, agent.name)
    this.agentRuntime = createAgentRuntime(agent.runtime, { model: agent.model })
  }

  private get name() { return this.agent.id }
  private get agentName() { return this.agent.name }
  private get ownsNetwork() { return this.agent.role === 'dispatcher' }

  async start() {
    const dir = peerDir(this.name)
    await ensureDir(dir)
    const bootstrapKey = await this.bootstrapKey()
    this.db = new TaskStore(join(dir, 'corestore'), bootstrapKey)
    await this.db.ready()
    this.executor = new TaskExecutor(this.name, this.db.writerKey, this.db, this.agentRuntime, this.log)
    this.incidents = new WorkflowCoordinator(this.name, this.agentName, this.db, this.log, this.workflows)
    if (this.ownsNetwork) await writeNetwork(this.db.key)

    const keyPair = await this.db.store.createKeyPair('hyperswarm-identity')
    await this.connectSwarm(keyPair)
    await this.prepareAgent()
    this.log.info({
      event: 'peer-ready',
      identity: keyPair.publicKey.toString('hex').slice(0, 12),
      writer: this.db.writerKey.slice(0, 12),
      profile: this.agent.role,
      skills: this.manifest.skills
    }, 'peer ready')
    void this.loop()
  }

  private async bootstrapKey() {
    if (this.ownsNetwork) return undefined
    for (;;) {
      try { return (await readNetwork()).bootstrapKey }
      catch {
        this.log.info({ event: 'bootstrap-wait' }, 'waiting for the dispatcher network config')
        await delay(500)
      }
    }
  }

  private async connectSwarm(keyPair: { publicKey: Buffer; secretKey: Buffer }) {
    this.swarm = new Hyperswarm({ keyPair })
    this.swarm.on('connection', (connection, info) => {
      const remote = info.publicKey.toString('hex')
      if (!this.seenNetworkPeers.has(remote)) {
        this.seenNetworkPeers.add(remote)
        this.log.debug({ event: 'peer-connected', remote: remote.slice(0, 12) }, 'peer connected')
      } else {
        this.log.debug({ event: 'peer-reconnected', remote: remote.slice(0, 12) }, 'peer connection refreshed')
      }
      this.db.replicate(connection)
    })
    const discovery = this.swarm.join(this.db.discoveryKey, { client: true, server: true })
    await discovery.flushed()
  }

  private async prepareAgent() {
    if (this.agent.knowledge) {
      await this.agentRuntime.initializeKnowledge((event, message, fields = {}) => this.log.info({ event, ...fields }, message))
    }
    this.manifest = {
      writerKey: this.db.writerKey,
      peer: this.name,
      name: this.agentName,
      description: this.agent.description,
      skills: [...this.agent.skills],
      tools: [...this.agent.tools],
      model: this.agent.model,
      status: 'available',
      updatedAt: now()
    }
    await this.db.register(this.name, this.manifest)
  }

  private async loop() {
    while (!this.stopped) {
      try { await this.tick() }
      catch (error) { this.log.error({ event: 'loop-error', err: error }, 'peer loop failed') }
      await delay(this.pollBackoff.next())
    }
  }

  private async tick() {
    const commands = await consumeCommands(this.name, peerCommandSchema,
      command => this.command(command),
      (error, command) => this.rejectCommand(error, command))
    const agents = await this.db.listAgents()
    await this.maintainManifest(agents)
    this.observeNetworkView(agents)
    const tasks = await this.db.list()
    const snapshot = this.snapshot(agents, tasks)
    if (commands || snapshot !== this.lastSnapshot) this.pollBackoff.reset()
    this.lastSnapshot = snapshot
    for (const task of tasks) await this.handleTask(task, agents)
  }

  private async rejectCommand(error: unknown, command?: PeerCommand) {
    this.log.error({ event: 'command-rejected', commandType: command?.type, err: error }, 'local command rejected')
    if (command?.type === 'ask') {
      await publishResponse(this.name, command.id, {
        agent: this.agentName, incidentId: command.id, status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async maintainManifest(agents: AgentManifest[]) {
    const published = agents.some(agent => agent.writerKey === this.db.writerKey)
    if (published && !this.manifestPublishedLogged) {
      this.manifestPublishedLogged = true
      this.log.debug({ event: 'agent-published', profile: this.agent.role,
        skills: this.manifest.skills }, 'capabilities are live')
    }
    if (!published && Date.now() - this.lastManifestAttempt > 2_000) {
      this.lastManifestAttempt = Date.now()
      await this.db.putAgent({ ...this.manifest, status: 'available', updatedAt: now() })
    }
  }

  private observeNetworkView(agents: AgentManifest[]) {
    const available = agents
      .filter(agent => agent.status === 'available' && agent.writerKey !== this.db.writerKey)
      .sort((a, b) => a.name.localeCompare(b.name))
    const fingerprint = available
      .map(agent => `${agent.writerKey}:${agent.name}:${agent.skills.join(',')}:${agent.tools.join(',')}`)
      .join('|')
    if (fingerprint === this.lastNetworkView) return
    const initialized = this.lastNetworkView !== undefined
    this.lastNetworkView = fingerprint
    if (!available.length && !initialized) return
    this.log.info({
      event: 'network-view',
      agents: available.map(agent => agent.name),
      capabilities: available.map(agent => `${agent.name}:${agent.skills.join('+') || 'dispatcher'}`)
    }, 'network view updated')
  }

  private snapshot(agents: AgentManifest[], tasks: Task[]) {
    return JSON.stringify({
      agents: agents.map(agent => [agent.writerKey, agent.status, agent.updatedAt]),
      tasks: tasks.map(task => [task.id, task.status, task.attempt, task.assigneeWriter, task.history.length])
    })
  }

  private async handleTask(task: Task, agents: AgentManifest[]) {
    if (await this.incidents.handle(task)) return
    if (task.owner === this.name && task.status === 'pending' && !task.assignee && !task.assigneeWriter) {
      await this.assign(task, agents)
      return
    }
    if (task.owner === this.name && task.status === 'completed') await this.publishCompletedTask(task)
    if (task.owner === this.name && task.status === 'failed') await this.publishFailedTask(task)
    if (this.executor.accepts(task)) void this.executor.execute(task)
  }

  private async publishCompletedTask(task: Task) {
    const marker = join(peerDir(this.name), `shown-${task.id}-${task.attempt}`)
    const exists = await access(marker).then(() => true, () => false)
    if (!exists) {
      this.log.info({ event: 'result-received', taskId: task.id, attempt: task.attempt,
        keywords: task.result?.keywords, summary: task.result?.summary }, 'task result received')
      await writeFile(marker, '')
    }
    await this.publishTaskResponse(task, { result: task.result })
  }

  private publishFailedTask(task: Task) {
    return this.publishTaskResponse(task, { error: task.error })
  }

  private async publishTaskResponse(task: Task, outcome: { result?: Task['result']; error?: string }) {
    const responseKey = `${task.id}:${task.attempt}:${task.status}`
    if (this.respondedTasks.has(responseKey)) return
    this.respondedTasks.add(responseKey)
    await publishResponse(this.name, task.id, {
      agent: this.agentName, taskId: task.id, status: task.status, attempt: task.attempt, ...outcome
    })
  }

  private async command(command: PeerCommand) {
    if (command.type === 'ask') {
      const workflow = command.job
        ? this.workflows.find(candidate => candidate.id === command.job)
        : this.workflows[0]
      if (!workflow) throw new Error(`Unknown job ${command.job ?? '(default)'}`)
      const stage = workflow.stages[0]!
      const task: Task = {
        id: `${command.id}-triage`, incidentId: command.id,
        workflow: `${workflow.id}@${workflow.version}`, stageId: stage.id,
        type: stage.type, owner: this.name,
        input: { report: command.question, question: command.question },
        allowedTools: [stage.tool], requiredSkills: stage.requires,
        status: 'pending', attempt: 1,
        history: [{ at: now(), event: 'created', peer: this.name, detail: `incident ${command.id}` }]
      }
      await this.db.put(task)
      this.log.info({ event: 'incident-opened', incidentId: command.id, taskId: task.id,
        stage: stage.id }, 'new workflow request; starting the first configured stage')
      return
    }
    if (command.type === 'retry') {
      const task = await this.db.get(command.task)
      if (!task) throw new Error(`Unknown task ${command.task}`)
      if (task.owner !== this.name) throw new Error(`Only owner ${task.owner} may retry this task`)
      if (task.status !== 'failed') throw new Error(`Only failed tasks may be retried; status=${task.status}`)
      await this.db.put({ ...task, status: 'pending', attempt: task.attempt + 1, error: undefined, result: undefined,
        history: [...task.history, { at: now(), event: 'retried', peer: this.name, detail: `attempt ${task.attempt + 1}` }] })
      this.log.info({ event: 'task-retried', taskId: task.id, attempt: task.attempt + 1 }, 'task retried')
    }
  }

  private async assign(task: Task, agents: AgentManifest[]) {
    const required = task.requiredSkills ?? []
    const selected = selectAgent(agents, required)
    if (!selected) {
      if (assignmentExpired(task, this.assignmentTimeoutMs)) {
        this.waitingTasks.delete(task.id)
        const error = `No capable agent became available within ${this.assignmentTimeoutMs}ms`
        await this.db.put({ ...task, status: 'failed', error, history: [
          ...task.history, { at: now(), event: 'failed', peer: this.name, detail: error }
        ] })
        this.log.error({ event: 'task-assignment-timeout', taskId: task.id,
          requiredSkills: required, waitedMs: assignmentAge(task) }, 'task failed because no capable agent became available')
      } else if (!this.waitingTasks.has(task.id)) {
        this.waitingTasks.add(task.id)
        this.log.warn({ event: 'task-waiting', taskId: task.id, requiredSkills: required,
          timeoutMs: this.assignmentTimeoutMs }, 'waiting for a capable agent')
      }
      return
    }
    this.waitingTasks.delete(task.id)
    const assigned: Task = {
      ...task,
      assignee: selected.name,
      assigneeWriter: selected.writerKey,
      history: [...task.history, {
        at: now(), event: 'assigned', peer: this.name,
        detail: `${selected.name} provides ${required.join(', ')}`
      }]
    }
    await this.db.put(assigned)
    this.log.info({
      event: 'task-assigned', taskId: task.id, attempt: task.attempt,
      assignee: selected.name, assigneeWriter: selected.writerKey.slice(0, 12), requiredSkills: required
    }, `handing this one to ${selected.name}`)
  }

  async close() {
    this.stopped = true
    if (this.manifest) await this.db.putAgent({ ...this.manifest, status: 'offline', updatedAt: now() })
    await this.swarm.destroy()
    for (const error of await this.agentRuntime.close()) {
      this.log.warn({ event: 'model-shutdown-warning', err: error }, 'model was already unavailable during shutdown')
    }
    await this.db.close()
  }
}
