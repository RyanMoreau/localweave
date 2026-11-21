import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PollBackoff } from '../src/shared/async.js'

describe('poll backoff', () => {
  test('grows to its bound and resets after activity', () => {
    const backoff = new PollBackoff(250, 1_000, 0, () => 0.5)
    assert.deepEqual([backoff.next(), backoff.next(), backoff.next(), backoff.next()], [250, 500, 1_000, 1_000])
    backoff.reset()
    assert.equal(backoff.next(), 250)
  })

  test('applies bounded jitter', () => {
    assert.equal(new PollBackoff(1_000, 4_000, 0.2, () => 0).next(), 800)
    assert.equal(new PollBackoff(1_000, 4_000, 0.2, () => 1).next(), 1_200)
  })
})
