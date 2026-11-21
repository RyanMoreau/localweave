import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskStore } from '../src/p2p/task-store.js'
import type { Task } from '../src/domain/types.js'

const waitFor = async (fn: () => Promise<boolean>, timeout = 8_000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)) }
  throw new Error('timed out')
}

describe('replication and recovery', () => {
  let dir = ''
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

  test('replicates completion and recovers it after restart', { timeout: 15_000 }, async () => {
    dir = await mkdtemp(join(tmpdir(), 'localweave-test-'))
    const a = new TaskStore(join(dir, 'a')); await a.ready()
    await a.register('willow', {
      writerKey: a.writerKey, peer: 'willow', name: 'Willow', description: 'Help desk dispatcher',
      skills: [], tools: [], status: 'available', updatedAt: new Date().toISOString()
    })
    const b = new TaskStore(join(dir, 'b'), a.key); await b.ready()
    const left = a.db.replicate(true); const right = b.db.replicate(false)
    left.pipe(right).pipe(left)
    await waitFor(async () => (await b.listAgents()).some(specialist => specialist.name === 'Willow'))
    await b.putAgent({
      writerKey: b.writerKey, peer: 'maverick', name: 'Maverick', description: 'Maintenance specialist',
      skills: ['extract-keywords'], tools: ['extract_keywords'], model: 'QWEN3_1_7B_INST_Q4',
      status: 'available', updatedAt: new Date().toISOString()
    })
    await waitFor(async () => (await a.listAgents()).some(specialist => specialist.name === 'Maverick'))

    const task: Task = {
      id: 'task-1', workflow: 'maintenance-keywords@1', type: 'extract-keywords', owner: 'willow', assignee: 'maverick',
      input: { report: 'pump bearing hot' }, allowedTools: ['extract_keywords'], status: 'pending', attempt: 1,
      history: [{ at: new Date().toISOString(), event: 'created', peer: 'willow' }]
    }
    await a.put(task)
    await waitFor(async () => (await b.get(task.id))?.status === 'pending')
    const copy = (await b.get(task.id))!
    await b.put({ ...copy, status: 'completed', result: { keywords: ['bearing', 'pump'], summary: 'done' },
      history: [...copy.history, { at: new Date().toISOString(), event: 'completed', peer: 'maverick' }] })
    await waitFor(async () => (await a.get(task.id))?.status === 'completed')
    left.destroy(); await a.close(); await b.close()

    const restarted = new TaskStore(join(dir, 'a')); await restarted.ready()
    assert.deepEqual((await restarted.get(task.id))?.result?.keywords, ['bearing', 'pump'])
    await restarted.close()
  })

  test('ignores malformed replicated operations and continues applying valid state', async () => {
    dir = await mkdtemp(join(tmpdir(), 'localweave-malformed-test-'))
    const db = new TaskStore(join(dir, 'peer')); await db.ready()
    await db.db.append(Buffer.from('{ definitely not json'))

    const task: Task = {
      id: 'after-malformed', workflow: 'maintenance-keywords@1', type: 'extract-keywords', owner: 'willow',
      input: { report: 'pump bearing hot' }, allowedTools: ['extract_keywords'], status: 'pending', attempt: 1,
      history: [{ at: new Date().toISOString(), event: 'created', peer: 'willow' }]
    }
    await db.put(task)

    assert.equal((await db.get(task.id))?.status, 'pending')
    await db.close()
  })
})
