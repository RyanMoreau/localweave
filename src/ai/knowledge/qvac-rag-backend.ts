import { toError } from '../../shared/errors.js'
import { qvacSdk } from '../qvac-sdk.js'
import type { KnowledgeBackend, KnowledgeLog } from './contracts.js'
import { readManualSections } from './manual.js'

const EMBEDDING_MODEL = 'GTE_LARGE_FP16'

export class QvacRagKnowledgeBackend implements KnowledgeBackend {
  private modelPromise?: Promise<string>
  private readonly workspace: string

  constructor(private readonly asset: string) {
    this.workspace = `localweave-${asset.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  }

  private async model(log: KnowledgeLog) {
    if (!this.modelPromise) this.modelPromise = this.loadModel(log).catch(error => {
      this.modelPromise = undefined
      throw error
    })
    return this.modelPromise
  }

  private async loadModel(log: KnowledgeLog) {
    const { getModelInfo, loadModel, GTE_LARGE_FP16 } = await qvacSdk()
    const info = await getModelInfo(GTE_LARGE_FP16)
    log(info.isCached ? 'embedding-cache-hit' : 'embedding-cache-miss',
      info.isCached ? 'embedding model found in local cache' : 'embedding model download required',
      { model: EMBEDDING_MODEL, expectedBytes: info.expectedSize, actualBytes: info.actualSize })
    let progressBucket = -1
    return loadModel({
      modelSrc: GTE_LARGE_FP16,
      modelConfig: { device: 'cpu', gpuLayers: 0 },
      onProgress: (progress: { percentage: number }) => {
        const bucket = Math.min(100, Math.floor(progress.percentage / 25) * 25)
        if (!info.isCached && bucket > progressBucket) {
          progressBucket = bucket
          log('embedding-download', 'embedding model download progress', { progress: bucket })
        }
      }
    })
  }

  async initialize(log: KnowledgeLog) {
    const { ragIngest, ragListWorkspaces } = await qvacSdk()
    const modelId = await this.model(log)
    const existing = await ragListWorkspaces()
    if (!existing.some((workspace: { name: string }) => workspace.name === this.workspace)) {
      const documents = (await readManualSections()).map(section => section.content)
      log('knowledge-indexing', 'building local asset manual index', {
        asset: this.asset, sections: documents.length, workspace: this.workspace
      })
      await ragIngest({ modelId, documents, workspace: this.workspace,
        onProgress: (stage: string, current: number, total: number) =>
          log('knowledge-index-progress', 'indexing asset manual', { stage, current, total }) })
    }
    log('knowledge-ready', 'QVAC asset manual embeddings are ready', {
      asset: this.asset, backend: 'qvac-rag', workspace: this.workspace, model: EMBEDDING_MODEL
    })
  }

  async search(question: string, log: KnowledgeLog) {
    const { ragSearch } = await qvacSdk()
    return ragSearch({ modelId: await this.model(log), query: question, topK: 3, workspace: this.workspace })
  }

  async close() {
    const errors: Error[] = []
    if (!this.modelPromise) return errors
    const { ragCloseWorkspace, unloadModel } = await qvacSdk()
    const modelId = await this.modelPromise.catch(() => undefined)
    this.modelPromise = undefined
    try { await ragCloseWorkspace({ workspace: this.workspace }) }
    catch (error) { errors.push(toError(error)) }
    if (modelId) {
      try { await unloadModel({ modelId, clearStorage: false }) }
      catch (error) { errors.push(toError(error)) }
    }
    return errors
  }
}
