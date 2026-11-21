import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { assignmentAge, assignmentExpired } from '../src/runtime/assignment-policy.js'
import type { Task } from '../src/domain/types.js'

const task: Task = {
  id: 'task-1', workflow: 'job@1', type: 'extract-keywords', owner: 'willow',
  input: { report: 'report' }, allowedTools: ['extract_keywords'], status: 'pending', attempt: 1,
  history: [{ at: '2026-01-01T00:00:00.000Z', event: 'created', peer: 'willow' }]
}

describe('assignment policy', () => {
  test('expires pending work at the configured deadline', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    assert.equal(assignmentAge(task, start + 29_999), 29_999)
    assert.equal(assignmentExpired(task, 30_000, start + 29_999), false)
    assert.equal(assignmentExpired(task, 30_000, start + 30_000), true)
  })
})
