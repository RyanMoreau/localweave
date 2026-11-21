import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function readManualSections() {
  const manual = await readFile(resolve(process.env.LOCALWEAVE_KNOWLEDGE_SOURCE ??
    'examples/maintenance-helpdesk/knowledge/pump-7-manual.md'), 'utf8')
  return manual.split(/\n(?=## )/).map((section, index) => {
    const content = section.trim()
    const heading = content.match(/^##\s+(.+)$/m)?.[1]
    return { id: heading?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? `section-${index + 1}`, content, score: 0 }
  }).filter(section => section.content)
}
