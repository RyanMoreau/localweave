import type { Task } from '../domain/types.js'
import { toError } from '../shared/errors.js'
import type { AgentLog, Completion } from './contracts.js'
import { KeywordAgent } from './keyword-agent.js'
import { AssetKnowledgeBase } from './knowledge/asset-knowledge-base.js'
import { ManualExpertAgent } from './manual-expert-agent.js'
import type { AgentRuntime } from '../domain/contracts.js'
import { qvacSdk } from './qvac-sdk.js'

/** QVAC-backed chat runtime with process-local model reuse and graceful teardown. */
export class QvacInferenceAdapter implements AgentRuntime {
  private modelPromise?: Promise<string>
  private readonly keywordAgent = new KeywordAgent()
  private readonly manualExpert: ManualExpertAgent

  constructor(
    private readonly knowledge = AssetKnowledgeBase.fromEnvironment(),
    private readonly modelName = 'QWEN3_1_7B_INST_Q4'
  ) {
    this.manualExpert = new ManualExpertAgent((question, log) => this.knowledge.search(question, log))
  }

  initializeKnowledge(log: AgentLog) { return this.knowledge.initialize(log) }

  async execute(task: Task, log: AgentLog = () => {}) {
    const { completion } = await qvacSdk()
    const complete = completion as unknown as Completion
    const modelId = await this.model(log)
    if (task.type === 'answer-asset-question') return this.manualExpert.execute(task, modelId, complete, log)
    if (task.type === 'extract-keywords') return this.keywordAgent.execute(task, modelId, complete, log)
    throw new Error(`QVAC adapter has no handler for task type ${task.type}`)
  }

  private async model(log: AgentLog) {
    if (!this.modelPromise) this.modelPromise = this.loadModel(log).catch(error => {
      this.modelPromise = undefined
      throw error
    })
    else log('model-reused', 'reusing loaded model')
    return this.modelPromise
  }

  private async loadModel(log: AgentLog) {
    const { getModelInfo, loadModel, QWEN3_1_7B_INST_Q4 } = await qvacSdk()
    if (this.modelName !== 'QWEN3_1_7B_INST_Q4') {
      throw new Error(`QVAC adapter does not support configured model ${this.modelName}`)
    }
    const modelSource = QWEN3_1_7B_INST_Q4
    let cached = false
    try {
      const info = await getModelInfo(modelSource)
      cached = info.isCached
      log(info.isCached ? 'model-cache-hit' : 'model-cache-miss',
        info.isCached ? 'model found in local cache' : 'model not cached; download required',
        { model: this.modelName, expectedBytes: info.expectedSize, actualBytes: info.actualSize })
    } catch (error) {
      log('model-cache-unknown', 'could not inspect model cache; attempting load', { error: String(error) })
    }
    let progressBucket = -1
    const modelId = await loadModel({
      modelSrc: modelSource,
      modelConfig: { ctx_size: 4096, tools: true },
      onProgress: (progress: { percentage: number }) => {
        const bucket = Math.min(100, Math.floor(progress.percentage / 25) * 25)
        if (!cached && bucket > progressBucket) {
          progressBucket = bucket
          log('model-download', 'model download progress', { progress: bucket })
        }
      }
    })
    log('model-ready', 'model ready', { model: this.modelName, modelId })
    return modelId
  }

  async close() {
    const errors = [...await this.knowledge.close()]
    const { unloadModel, close } = await qvacSdk()
    const modelId = await this.modelPromise?.catch(() => undefined)
    this.modelPromise = undefined
    if (modelId) {
      try { await unloadModel({ modelId, clearStorage: false }) }
      catch (error) { errors.push(toError(error)) }
    }
    try { await close() }
    catch (error) { errors.push(toError(error)) }
    return errors
  }
}
