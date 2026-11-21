import type { Task } from '../domain/types.js'
import type { TaskRepository } from '../domain/contracts.js'
import { publishResponse, readResponse } from '../shared/control-plane.js'
import { incidentResponseSchema } from '../domain/types.js'
import type { Logger } from 'pino'
import type { JobDefinition } from './config.js'

const now = () => new Date().toISOString()

/** Advances the two-stage maintenance incident after observing replicated task changes. */
export class WorkflowCoordinator {
  private readonly responded = new Set<string>()

  constructor(
    private readonly peerName: string,
    private readonly displayName: string,
    private readonly store: TaskRepository,
    private readonly log: Logger,
    private readonly workflows: JobDefinition[]
  ) {}

  async handle(task: Task) {
    const workflow = this.workflows.find(candidate => task.workflow === `${candidate.id}@${candidate.version}`)
    if (task.owner !== this.peerName || !workflow) return false
    if (task.status === 'failed') await this.fail(task)
    else if (task.status === 'completed') await this.advance(task, workflow)
    else return false
    return true
  }

  private async fail(task: Task) {
    if (!task.incidentId) return
    const key = `${task.incidentId}:${task.attempt}:failed`
    if (this.responded.has(key)) return
    const persisted = incidentResponseSchema.safeParse(await readResponse(this.peerName, task.incidentId))
    if (persisted.success && persisted.data.status === 'failed') {
      this.responded.add(key)
      return
    }
    this.responded.add(key)
    this.log.error({ event: 'incident-failed', incidentId: task.incidentId, taskId: task.id, error: task.error },
      'a workflow specialist failed; returning the request to the operator')
    await publishResponse(this.peerName, task.incidentId, {
      agent: this.displayName, status: 'failed', incidentId: task.incidentId, error: task.error
    })
  }

  private async advance(task: Task, workflow: JobDefinition) {
    if (!task.incidentId) return
    const current = workflow.stages.findIndex(stage => stage.id === task.stageId)
    if (current >= 0 && current < workflow.stages.length - 1) return this.requestNextStage(task, workflow, current + 1)
    const key = `${task.incidentId}:${task.attempt}:answered`
    if (this.responded.has(key)) return
    const persisted = incidentResponseSchema.safeParse(await readResponse(this.peerName, task.incidentId))
    if (persisted.success && persisted.data.status === 'completed') {
      this.responded.add(key)
      return
    }
    this.responded.add(key)
    this.log.info({ event: 'incident-answered', incidentId: task.incidentId, taskId: task.id,
      citations: task.result?.citations?.length }, 'final job stage completed; closing the workflow request')
    await publishResponse(this.peerName, task.incidentId, {
      agent: this.displayName, status: 'completed', incidentId: task.incidentId,
      answer: task.result?.answer ?? task.result?.summary, citations: task.result?.citations ?? []
    })
  }

  private async requestNextStage(task: Task, workflow: JobDefinition, index: number) {
    const stage = workflow.stages[index]!
    const incidentId = task.incidentId!
    const id = `${incidentId}-${stage.id}`
    if (await this.store.get(id)) return
    const research: Task = {
      id, incidentId, workflow: task.workflow, stageId: stage.id, type: stage.type, owner: this.peerName,
      input: { report: task.input.report, question: task.input.question ?? task.input.report,
        keywords: task.result?.keywords ?? [] },
      allowedTools: [stage.tool], requiredSkills: stage.requires, status: 'pending', attempt: 1,
      history: [{ at: now(), event: 'created', peer: this.peerName, detail: `triaged from ${task.id}` }]
    }
    await this.store.put(research)
    this.log.info({ event: 'incident-advanced', incidentId, taskId: id, stage: stage.id },
      'job stage completed; starting the next configured stage')
  }
}
