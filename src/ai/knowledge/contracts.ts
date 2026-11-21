export type KnowledgeLog = (event: string, message: string, fields?: Record<string, unknown>) => void
export type Citation = { id: string; content: string; score: number }

/** Replaceable local retrieval boundary. Backends return source-bearing passages. */
export interface KnowledgeBackend {
  initialize(log: KnowledgeLog): Promise<void>
  search(question: string, log: KnowledgeLog): Promise<Citation[]>
  close(): Promise<Error[]>
}
