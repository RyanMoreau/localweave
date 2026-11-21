import type { Task } from '../../domain/types.js'
import { emptyToolArgs } from '../contracts.js'
import { z } from 'zod'

export const keywordToolResultSchema = z.object({ keywords: z.array(z.string()) })

/** Builds the QVAC-compatible deterministic keyword tool for one bound task. */
export function createKeywordTool(
  task: Task,
  extract: (report: string) => string[]
) {
  return {
    name: 'extract_keywords',
    description: 'Extract deterministic normalized maintenance keywords from the current task report. Takes no arguments.',
    parameters: emptyToolArgs,
    handler: async (raw: Record<string, unknown>) => {
      if (!task.allowedTools.includes('extract_keywords')) throw new Error('Tool is not allowed for this task')
      emptyToolArgs.parse(raw)
      const keywords = extract(task.input.report)
      return { keywords }
    }
  }
}
