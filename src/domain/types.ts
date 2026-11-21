import { z } from 'zod'

export const taskInputSchema = z.object({
  report: z.string().min(1).max(2_000),
  question: z.string().min(1).max(2_000).optional(),
  keywords: z.array(z.string()).optional()
}).catchall(z.unknown())

const taskResultSchema = z.object({
  keywords: z.array(z.string()).optional(),
  summary: z.string(),
  answer: z.string().optional(),
  citations: z.array(z.object({ id: z.string(), content: z.string(), score: z.number() })).optional()
}).catchall(z.unknown())

/** Durable materialized state for one owned task attempt. */
export const taskSchema = z.object({
  id: z.string(),
  workflow: z.string(),
  incidentId: z.string().optional(),
  stageId: z.string().optional(),
  type: z.string().min(1),
  owner: z.string(),
  assignee: z.string().optional(),
  assigneeWriter: z.string().optional(),
  requiredSkills: z.array(z.string().min(1)).optional(),
  input: taskInputSchema,
  allowedTools: z.array(z.string().min(1)).min(1),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  attempt: z.number().int().positive(),
  result: taskResultSchema.optional(),
  error: z.string().optional(),
  history: z.array(z.object({
    at: z.string(),
    event: z.enum(['created', 'assigned', 'started', 'tool-called', 'completed', 'failed', 'retried']),
    peer: z.string(),
    detail: z.string().optional()
  }))
}).superRefine((task, context) => {
  if (task.status === 'completed' && !task.result) {
    context.addIssue({ code: 'custom', path: ['result'], message: 'Completed tasks require a result' })
  }
  if (task.status === 'failed' && !task.error) {
    context.addIssue({ code: 'custom', path: ['error'], message: 'Failed tasks require an error' })
  }
  if (task.status !== 'completed' && task.result) {
    context.addIssue({ code: 'custom', path: ['result'], message: 'Only completed tasks may contain a result' })
  }
})

/**
 * Replicated task projection. `history` records execution transitions, while
 * retry increments `attempt`; completed attempts are never executed again.
 */
export type Task = z.infer<typeof taskSchema>

/** Capability advertisement published by each writable specialist peer. */
export const agentManifestSchema = z.object({
  writerKey: z.string().length(64),
  peer: z.string().min(1),
  name: z.string().min(1).max(40),
  description: z.string().max(200),
  skills: z.array(z.string().min(1)),
  tools: z.array(z.string().min(1)),
  model: z.string().optional(),
  status: z.enum(['available', 'offline']),
  updatedAt: z.string()
})

/** Replicated routing metadata keyed by the specialist's stable writer key. */
export type AgentManifest = z.infer<typeof agentManifestSchema>

/** Deterministic operations accepted by the Autobee materialized view. */
export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), writerKey: z.string(), peer: z.string() }),
  z.object({ type: z.literal('put-task'), task: taskSchema }),
  z.object({ type: z.literal('put-agent'), agent: agentManifestSchema })
])

export type Operation = z.infer<typeof operationSchema>

/** Commands accepted by a peer's durable local inbox. */
export const peerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ask'), id: z.uuid(), question: z.string().min(1).max(2_000), job: z.string().optional() }),
  z.object({ type: z.literal('retry'), task: z.string().min(1) })
])
export type PeerCommand = z.infer<typeof peerCommandSchema>

export const taskResponseSchema = z.discriminatedUnion('status', [
  z.object({ agent: z.string(), taskId: z.string(), status: z.literal('completed'), attempt: z.number(),
    result: taskResultSchema }),
  z.object({ agent: z.string(), taskId: z.string(), status: z.literal('failed'), attempt: z.number(),
    error: z.string().optional() })
])

export const incidentResponseSchema = z.discriminatedUnion('status', [
  z.object({ agent: z.string(), incidentId: z.string(), status: z.literal('completed'), answer: z.string(),
    citations: z.array(z.object({ id: z.string(), content: z.string(), score: z.number() })) }),
  z.object({ agent: z.string(), incidentId: z.string(), status: z.literal('failed'), error: z.string().optional() })
])
