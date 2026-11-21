import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentRuntime, registeredRuntimeIds } from '../src/ai/runtime-factory.js'

describe('inference adapter registry', () => {
  test('advertises the included QVAC adapter', () => {
    assert.deepEqual(registeredRuntimeIds(), ['qvac'])
  })

  test('rejects an unregistered adapter explicitly', () => {
    assert.throws(() => createAgentRuntime('missing'), /Unknown inference adapter missing\. Registered: qvac/)
  })
})
