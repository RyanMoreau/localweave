import type { Citation, KnowledgeBackend, KnowledgeLog } from './contracts.js'
import { readManualSections } from './manual.js'

export class LocalTextKnowledgeBackend implements KnowledgeBackend {
  private sections: Citation[] = []

  constructor(private readonly asset: string) {}

  async initialize(log: KnowledgeLog) {
    this.sections = await readManualSections()
    log('knowledge-ready', 'asset manual text index is ready', {
      asset: this.asset, backend: 'local-text', sections: this.sections.length,
      note: 'Set LOCALWEAVE_KNOWLEDGE_BACKEND=qvac-rag when the QVAC embedding worker is available'
    })
  }

  async search(question: string) {
    if (!this.sections.length) this.sections = await readManualSections()
    const query = new Set(question.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? [])
    return this.sections.map(section => {
      const words = new Set(section.content.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? [])
      const overlap = [...query].filter(word => words.has(word)).length
      return { ...section, score: query.size ? overlap / query.size : 0 }
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3)
  }

  async close() {
    this.sections = []
    return []
  }
}
