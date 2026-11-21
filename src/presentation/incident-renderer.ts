import type { Citation } from '../ai/knowledge/contracts.js'
import { cleanAnswer } from '../ai/contracts.js'

const label = (id: string) => id.split('-').map(word => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ')

const terminalMarkdown = (text: string) => {
  const ansi = process.stdout.isTTY && !process.env.NO_COLOR
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, ansi ? '\u001b[1m$1\u001b[22m' : '$1')
    .replace(/\*(.*?)\*/g, ansi ? '\u001b[2m$1\u001b[22m' : '$1')
}

const indentAfterFirstLine = (text: string, width: number) => {
  const padding = ' '.repeat(width)
  return text.split('\n').map((line, index) => index === 0 ? line : `${padding}${line}`).join('\n')
}

export function renderIncident(agent: string, answer: string, citations: Citation[], showEvidence: boolean) {
  const prefix = `[${agent}] `
  const lines = [indentAfterFirstLine(`${prefix}${terminalMarkdown(cleanAnswer(answer))}`, prefix.length)]
  if (!citations.length) return lines.join('\n')

  lines.push('', `Sources: ${citations.map(citation => label(citation.id)).join(' · ')}`)
  if (showEvidence) {
    lines.push('', 'Retrieved evidence:')
    for (const citation of citations) {
      const content = citation.content.replace(/^#{1,6}\s+/gm, '').trim()
      lines.push(`  ${label(citation.id)} (${citation.score.toFixed(3)})`, indentAfterFirstLine(`    ${content}`, 4))
    }
  }
  return lines.join('\n')
}
