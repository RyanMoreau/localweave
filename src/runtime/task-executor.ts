import type { Task } from '../domain/types.js'
import type { AgentRuntime, TaskRepository } from '../domain/contracts.js'
import type { Logger } from 'pino'

const now = () => new Date().toISOString()

export class TaskExecutor {
  private readonly active = new Set<string>()

  constructor(
    private readonly peerName: string,
    private readonly writerKey: string,
    private readonly store: TaskRepository,
    private readonly runtime: AgentRuntime,
    private readonly log: Logger
  ) {}

  accepts(task: Task) {
    const assignedHere = task.assigneeWriter ? task.assigneeWriter === this.writerKey : task.assignee === this.peerName
    return assignedHere && task.status === 'pending' && !this.active.has(task.id)
  }

  async execute(task: Task) {
    this.active.add(task.id)
    try {
      const current = await this.store.get(task.id)
      if (!current || current.status !== 'pending' || current.attempt !== task.attempt) return
      const running: Task = { ...current, status: 'running',
        history: [...current.history, { at: now(), event: 'started', peer: this.peerName }] }
      await this.store.put(running)
      const context = { taskId: task.id, attempt: task.attempt }
      this.log.info({ event: 'task-started', ...context }, 'task started')
      const result = await this.runtime.execute(running, (event, message, fields = {}) =>
        this.log.info({ event, ...context, ...fields }, message))
      const latest = await this.store.get(task.id)
      if (!latest || latest.status !== 'running' || latest.attempt !== task.attempt) return
      await this.store.put({ ...latest, status: 'completed', result, history: [
        ...latest.history,
        { at: now(), event: 'tool-called', peer: this.peerName, detail: running.allowedTools[0] },
        { at: now(), event: 'completed', peer: this.peerName }
      ] })
      this.log.info({ event: 'task-completed', ...context }, 'task completed and persisted')
    } catch (error) {
      try {
        const latest = await this.store.get(task.id)
        if (latest && latest.status !== 'completed' && latest.attempt === task.attempt) {
          await this.store.put({ ...latest, status: 'failed', error: error instanceof Error ? error.message : String(error),
            history: [...latest.history, { at: now(), event: 'failed', peer: this.peerName, detail: String(error) }] })
        }
      } catch (persistenceError) {
        this.log.error({ event: 'task-failure-persistence-failed', taskId: task.id,
          attempt: task.attempt, err: persistenceError }, 'could not persist failed task state')
      }
      this.log.error({ event: 'task-failed', taskId: task.id, attempt: task.attempt, err: error }, 'task failed')
    } finally { this.active.delete(task.id) }
  }
}
