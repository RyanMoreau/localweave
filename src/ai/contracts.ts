import type { RuntimeLog } from '../domain/contracts.js'
import { z } from 'zod'

export type AgentLog = RuntimeLog

export type CompletionFinal = {
  contentText: string
  raw: { fullText: string }
  toolCalls: Array<{ name: string; invoke?: () => Promise<unknown> }>
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export type AgentTool = {
  name: string
  description: string
  parameters: z.ZodType
  handler: (raw: Record<string, unknown>) => Promise<unknown>
}

export type CompletionOptions = {
  modelId: string
  history: ChatMessage[]
  tools: AgentTool[]
  stream: boolean
  captureThinking: boolean
  tool_choice: string
}

export type Completion = (options: CompletionOptions) => { final: Promise<CompletionFinal> }

export const emptyToolArgs = z.object({}).strict()

export const cleanAnswer = (text: string) => text
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/<\/?think>/gi, '')
  .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
  .trim()

/** Gives a small local model one correction turn without invoking malformed calls. */
export async function requestSingleToolCall(
  completion: Completion,
  options: CompletionOptions,
  expectedTool: string,
  log: AgentLog
) {
  const first = await completion(options).final
  if (first.toolCalls.length === 1) return first

  log('agent-tool-correction', 'agent returned an invalid number of tool calls; requesting one correction', {
    expectedTool,
    received: first.toolCalls.length
  })
  const retry = await completion({
    ...options,
    history: [
      ...options.history,
      { role: 'assistant', content: first.raw.fullText },
      { role: 'user', content: `Your previous response was invalid. Call ${expectedTool} exactly once and do not call any other tool.` }
    ]
  }).final
  if (retry.toolCalls.length !== 1) {
    throw new Error(`Expected exactly one tool call, got ${first.toolCalls.length}; corrective retry got ${retry.toolCalls.length}`)
  }
  return retry
}
