import type { AgentManifest, Task } from './types.js'

/** Minimal durable task-state boundary used by executors and coordinators. */
export interface TaskRepository {
  put(task: Task): Promise<void>
  get(id: string): Promise<Task | null>
  list(): Promise<Task[]>
  listAgents(): Promise<AgentManifest[]>
  putAgent(agent: AgentManifest): Promise<void>
}

/**
 * Local inference boundary owned by a single specialist process.
 * Implementations must execute only tools allowed by the supplied task.
 */
export interface AgentRuntime {
  initializeKnowledge(log: RuntimeLog): Promise<void>
  execute(task: Task, log?: RuntimeLog): Promise<NonNullable<Task['result']>>
  close(): Promise<Error[]>
}

/** Structured lifecycle sink used by runtimes without coupling them to Pino. */
export type RuntimeLog = (event: string, message: string, fields?: Record<string, unknown>) => void
