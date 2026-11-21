import Autobee from 'autobee'
import Corestore from 'corestore'
import { agentManifestSchema, operationSchema, type AgentManifest, type Operation, taskSchema, type Task } from '../domain/types.js'
import { parseJson } from '../shared/json.js'
import type { TaskRepository } from '../domain/contracts.js'

const enc = (value: unknown) => Buffer.from(JSON.stringify(value))

export function decodeOperation(value: Buffer): Operation | null {
  const json = parseJson(value.toString())
  const parsed = operationSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

async function apply(nodes: Array<{ value: Buffer }>, view: any, host: any) {
  for (const node of nodes) {
    const op = decodeOperation(node.value)
    if (!op) continue
    if (op.type === 'join') {
      host.addWriter(op.writerKey)
      continue
    }
    const batch = view.write()
    if (op.type === 'put-task') batch.tryPut(Buffer.from(`task/${op.task.id}`), enc(op.task))
    if (op.type === 'put-agent') batch.tryPut(Buffer.from(`agent/${op.agent.writerKey}`), enc(op.agent))
    await batch.flush()
  }
}

/** Autobee-backed replicated task repository. One instance owns one local writer. */
export class TaskStore implements TaskRepository {
  readonly store: Corestore
  readonly db: Autobee

  constructor(storage: string, bootstrapKey?: string) {
    this.store = new Corestore(storage)
    this.db = new Autobee(this.store, bootstrapKey ? Buffer.from(bootstrapKey, 'hex') : null, {
      apply,
      optimistic: true
    })
  }

  async ready() { await this.db.ready() }
  get key() { return this.db.key.toString('hex') }
  get discoveryKey() { return this.db.discoveryKey as Buffer }
  get writerKey() { return this.db.local.key.toString('hex') }
  get writable() { return this.db.writable as boolean }

  async join(peer: string) {
    if (this.writable) return
    const op: Operation = { type: 'join', writerKey: this.writerKey, peer }
    await this.db.append(enc(op), { optimistic: true })
  }

  async register(peer: string, agent: AgentManifest) {
    agentManifestSchema.parse(agent)
    if (this.writable) {
      await this.putAgent(agent)
      return
    }
    const operations: Operation[] = [
      { type: 'join', writerKey: this.writerKey, peer },
      { type: 'put-agent', agent }
    ]
    await this.db.append(operations.map(enc), { optimistic: true })
  }

  async put(task: Task) {
    taskSchema.parse(task)
    await this.db.append(enc({ type: 'put-task', task } satisfies Operation), { optimistic: !this.writable })
  }

  async putAgent(agent: AgentManifest) {
    agentManifestSchema.parse(agent)
    await this.db.append(enc({ type: 'put-agent', agent } satisfies Operation), { optimistic: !this.writable })
  }

  async get(id: string): Promise<Task | null> {
    await this.db.update()
    const node = await this.db.view.get(Buffer.from(`task/${id}`))
    return node ? taskSchema.parse(JSON.parse(node.value.toString())) : null
  }

  async list(): Promise<Task[]> {
    await this.db.update()
    const tasks: Task[] = []
    for await (const node of this.db.view.createReadStream({ gte: Buffer.from('task/'), lt: Buffer.from('task0') })) {
      tasks.push(taskSchema.parse(JSON.parse(node.value.toString())))
    }
    return tasks
  }

  async listAgents(): Promise<AgentManifest[]> {
    await this.db.update()
    const agents: AgentManifest[] = []
    for await (const node of this.db.view.createReadStream({ gte: Buffer.from('agent/'), lt: Buffer.from('agent0') })) {
      // A persisted store can outlive a capability rename. Ignore legacy
      // manifests during discovery; every newly published manifest is still
      // strictly validated by putAgent/register and the Autobee apply path.
      const parsed = agentManifestSchema.safeParse(parseJson(node.value.toString()))
      if (parsed.success) agents.push(parsed.data)
    }
    return agents
  }

  // Autobee wraps Corestore replication with its writer-wakeup protocol.
  // Calling Corestore directly transfers already-known cores but can miss
  // newly-added writer heads (such as a specialist's completion operation).
  replicate(connection: any) { return this.db.replicate(connection) }
  async close() { await this.db.close() }
}
