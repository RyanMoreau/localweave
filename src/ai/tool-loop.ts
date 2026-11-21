import {
  cleanAnswer,
  requestSingleToolCall,
  type AgentLog,
  type AgentTool,
  type ChatMessage,
  type Completion
} from './contracts.js'

type ToolLoopOptions = {
  modelId: string
  completion: Completion
  history: ChatMessage[]
  tool: AgentTool
  log: AgentLog
  selectingMessage: string
  completedMessage: string
}

/** Runs one validated tool turn followed by one prose-response turn. */
export async function runToolLoop(options: ToolLoopOptions) {
  const { modelId, completion, history, tool, log } = options
  const tools = [tool]
  log('agent-tool-selection', options.selectingMessage)

  const selection = await requestSingleToolCall(completion, {
    modelId, history, tools, stream: true, captureThinking: true, tool_choice: tool.name
  }, tool.name, log)
  const call = selection.toolCalls[0]
  if (!call || call.name !== tool.name || !call.invoke) {
    throw new Error(`Agent selected disallowed tool: ${call?.name ?? 'none'}`)
  }

  log('tool-selected', 'tool selected', { tool: call.name })
  const toolResult = await call.invoke()
  log('tool-completed', options.completedMessage, { tool: call.name })

  const finalHistory: ChatMessage[] = [
    ...history,
    { role: 'assistant', content: selection.raw.fullText },
    { role: 'tool', content: JSON.stringify(toolResult) }
  ]
  const final = await completion({
    modelId, history: finalHistory, tools, stream: false, captureThinking: true, tool_choice: 'none'
  }).final
  return { toolResult, answer: cleanAnswer(final.contentText) || cleanAnswer(final.raw.fullText) }
}
