import type { Task } from '../domain/types.js'
import { type AgentLog, type ChatMessage, type Completion } from './contracts.js'
import { createKeywordTool, keywordToolResultSchema } from './tools/keyword-tool.js'
import { runToolLoop } from './tool-loop.js'

const FALLBACK_EVENT = 'agent-final-fallback'

function extractKeywords(report: string) {
  const stop = new Set(['the', 'and', 'is', 'are', 'a', 'an', 'to', 'of', 'in', 'on', 'with'])
  const words = report.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []
  const counts = new Map<string, number>()
  for (const word of words) {
    if (!stop.has(word) && word.length > 2) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word)
}

export class KeywordAgent {
  async execute(task: Task, modelId: string, completion: Completion, log: AgentLog = () => {}) {
    const history: ChatMessage[] = [
      { role: 'system', content: 'You process maintenance reports. Always call the supplied tool, then briefly summarize its result.' },
      { role: 'user', content: `Extract keywords from this report: ${task.input.report}` }
    ]
    const { toolResult, answer } = await runToolLoop({
      modelId, completion, history, log,
      tool: createKeywordTool(task, extractKeywords),
      selectingMessage: 'asking agent to select a tool',
      completedMessage: 'tool completed; asking agent for final response'
    })
    const { keywords } = keywordToolResultSchema.parse(toolResult)
    let summary = answer
    if (!summary) {
      summary = `Extracted maintenance keywords: ${keywords.join(', ')}.`
      log(FALLBACK_EVENT, 'agent returned no usable final prose; using deterministic tool-result summary')
    }
    return { keywords, summary }
  }
}
