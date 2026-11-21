import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAskArguments } from '../src/shared/args.js'

describe('ask arguments', () => {
  test('preserves a question when no optional flags are present', () => {
    assert.deepEqual(parseAskArguments(['Pump 7 is vibrating']), {
      question: 'Pump 7 is vibrating', job: undefined, showEvidence: false
    })
  })

  test('extracts job and evidence flags in either position', () => {
    assert.deepEqual(parseAskArguments(['--job', 'maintenance-triage', '--evidence', 'Inspect', 'the pump']), {
      question: 'Inspect the pump', job: 'maintenance-triage', showEvidence: true
    })
  })

  test('rejects a job flag without a value', () => {
    assert.throws(() => parseAskArguments(['--job']), /missing value/i)
  })
})
