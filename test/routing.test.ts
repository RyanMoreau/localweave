import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { selectAgent } from '../src/domain/routing.js'
import type { AgentManifest } from '../src/domain/types.js'

const specialist = (name: string, overrides: Partial<AgentManifest> = {}): AgentManifest => ({
  writerKey: name.toLowerCase().padEnd(64, '0'), peer: name, name,
  description: `${name} specialist`, skills: ['extract-keywords'], tools: ['extract_keywords'],
  model: 'QWEN3_1_7B_INST_Q4', status: 'available', updatedAt: new Date().toISOString(), ...overrides
})

describe('specialist capability routing', () => {
  test('selects an available specialist that advertises every required skill', () => {
    const selected = selectAgent([
      specialist('Offline Technician', { status: 'offline' }),
      specialist('Maverick')
    ], ['extract-keywords'])
    assert.equal(selected?.name, 'Maverick')
  })

  test('returns no assignment when no specialist has the required skill', () => {
    assert.equal(selectAgent([specialist('Willow', { skills: [], tools: [], model: undefined })], ['extract-keywords']), undefined)
  })

  test('uses deterministic name/key ordering when several specialists match', () => {
    assert.equal(selectAgent([specialist('Beta Technician'), specialist('Alpha Technician')], ['extract-keywords'])?.name, 'Alpha Technician')
  })
})
