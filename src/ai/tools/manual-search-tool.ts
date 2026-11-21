import type { Task } from '../../domain/types.js'
import type { Citation } from '../knowledge/contracts.js'
import { emptyToolArgs, type AgentLog } from '../contracts.js'
import { z } from 'zod'

export const manualSearchResultSchema = z.object({
  passages: z.array(z.object({ id: z.string(), content: z.string(), score: z.number() }))
})

/** Builds a manual-search tool bound to trusted task context and a retrieval backend. */
export function createManualSearchTool(
  task: Task,
  search: (question: string, log: AgentLog) => Promise<Citation[]>,
  log: AgentLog
) {
  const asset = process.env.LOCALWEAVE_KNOWLEDGE_ASSET ?? 'configured asset'
  return {
    name: 'search_pump_manual',
    description: `Search the private local maintenance manual for ${asset}. Takes no arguments.`,
    parameters: emptyToolArgs,
    handler: async (raw: Record<string, unknown>) => {
      if (!task.allowedTools.includes('search_pump_manual')) throw new Error('Tool is not allowed for this task')
      emptyToolArgs.parse(raw)
      const citations = await search(task.input.question ?? task.input.report, log)
      return { passages: citations }
    }
  }
}
