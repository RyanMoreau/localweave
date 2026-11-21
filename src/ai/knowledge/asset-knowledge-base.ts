import type { KnowledgeBackend, KnowledgeLog } from './contracts.js'
import { LocalTextKnowledgeBackend } from './local-text-backend.js'
import { QvacRagKnowledgeBackend } from './qvac-rag-backend.js'

/** Owns the configured asset-retrieval backend and its process-local lifecycle. */
export class AssetKnowledgeBase {
  constructor(private readonly backend: KnowledgeBackend) {}

  static fromEnvironment() {
    const asset = process.env.LOCALWEAVE_KNOWLEDGE_ASSET ?? 'configured asset'
    const backend = process.env.LOCALWEAVE_KNOWLEDGE_BACKEND === 'qvac-rag'
      ? new QvacRagKnowledgeBackend(asset)
      : new LocalTextKnowledgeBackend(asset)
    return new AssetKnowledgeBase(backend)
  }

  initialize(log: KnowledgeLog) { return this.backend.initialize(log) }
  search(question: string, log: KnowledgeLog) { return this.backend.search(question, log) }
  close() { return this.backend.close() }
}
