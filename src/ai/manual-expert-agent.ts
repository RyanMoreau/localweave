import type { Task } from '../domain/types.js'
import type { Citation } from './knowledge/contracts.js'
import { type AgentLog, type ChatMessage, type Completion } from './contracts.js'
import { createManualSearchTool, manualSearchResultSchema } from './tools/manual-search-tool.js'
import { runToolLoop } from './tool-loop.js'

export class ManualExpertAgent {
  constructor(private readonly search: (question: string, log: AgentLog) => Promise<Citation[]>) {}

  async execute(task: Task, modelId: string, completion: Completion, log: AgentLog = () => {}) {
    const symptoms = task.input.keywords?.join(', ') || 'not yet classified'
    const history: ChatMessage[] = [
      { role: 'system', content: 'You are a maintenance manual expert. Search the supplied local manual, then answer only from retrieved evidence. Answer in at most 120 words with concise, safe next steps. Do not speculate that continued operation or restart is safe unless the evidence explicitly permits it. Mention material uncertainty.' },
      { role: 'user', content: `Question: ${task.input.question ?? task.input.report}\nTriaged symptoms: ${symptoms}` }
    ]
    const { toolResult, answer } = await runToolLoop({
      modelId, completion, history, log,
      tool: createManualSearchTool(task, this.search, log),
      selectingMessage: 'asking the agent to search the local asset manual',
      completedMessage: 'manual evidence retrieved; drafting cited answer'
    })
    const evidence = manualSearchResultSchema.parse(toolResult).passages
    if (!evidence.length) throw new Error('Local manual search returned no evidence')
    const finalAnswer = answer || `The local manual recommends: ${evidence[0]!.content}`
    if (!answer) log('agent-final-fallback', 'agent returned no usable final prose; using the top retrieved passage')
    return { summary: finalAnswer, answer: finalAnswer, citations: evidence }
  }
}
