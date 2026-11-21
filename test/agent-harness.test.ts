import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { KeywordAgent } from '../src/ai/keyword-agent.js'
import { ManualExpertAgent } from '../src/ai/manual-expert-agent.js'
import type { Task } from '../src/domain/types.js'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', workflow: 'maintenance-keywords@1', type: 'extract-keywords', owner: 'willow', assignee: 'maverick',
  input: { report: 'Pump bearing is overheating and lubricant pressure is low.' },
  allowedTools: ['extract_keywords'], status: 'running', attempt: 1, history: [], ...overrides
})

type FirstTurn = {
  calls?: Array<{ name: string; args?: unknown; invokable?: boolean }>
  raw?: string
}

function scriptedCompletion(first: FirstTurn, summary = 'Maintenance keywords extracted.') {
  let turn = 0
  return (options: any) => {
    turn++
    if (turn === 1) {
      const tool = options.tools[0]
      const calls = (first.calls ?? []).map(call => ({
        name: call.name,
        ...(call.invokable === false ? {} : { invoke: () => tool.handler(call.args ?? {}) })
      }))
      return { final: Promise.resolve({ contentText: '', raw: { fullText: first.raw ?? '<tool_call />' }, toolCalls: calls }) }
    }
    return { final: Promise.resolve({ contentText: summary, raw: { fullText: summary }, toolCalls: [] }) }
  }
}

describe('QVAC agent harness', () => {
  const keywordAgent = new KeywordAgent()
  test('executes one allowed tool and strips reasoning from the final answer', async () => {
    const completion = scriptedCompletion({
      calls: [{ name: 'extract_keywords', args: {} }]
    }, '<think>private reasoning</think>Found the maintenance terms.')
    const result = await keywordAgent.execute(task(), 'model-1', completion)
    assert.deepEqual(result.keywords, ['bearing', 'low', 'lubricant', 'overheating', 'pressure', 'pump'])
    assert.equal(result.summary, 'Found the maintenance terms.')
  })

  test('fails when the model does not call a tool', async () => {
    await assert.rejects(keywordAgent.execute(task(), 'model-1', scriptedCompletion({})), /exactly one tool call, got 0/i)
  })

  test('fails when the model calls multiple tools', async () => {
    await assert.rejects(keywordAgent.execute(task(), 'model-1', scriptedCompletion({ calls: [
      { name: 'extract_keywords', args: {} },
      { name: 'extract_keywords', args: {} }
    ] })), /exactly one tool call, got 2/i)
  })

  test('corrects multiple tool calls once without invoking the invalid calls', async () => {
    let turn = 0
    let invocations = 0
    const events: string[] = []
    const completion = (options: any) => {
      turn++
      const tool = options.tools[0]
      const call = { name: 'extract_keywords', invoke: async () => {
        invocations++
        return tool.handler({})
      } }
      if (turn === 1) return { final: Promise.resolve({ contentText: '', raw: { fullText: '<tool_call />' }, toolCalls: [call, call] }) }
      if (turn === 2) return { final: Promise.resolve({ contentText: '', raw: { fullText: '<tool_call />' }, toolCalls: [call] }) }
      return { final: Promise.resolve({ contentText: 'Corrected.', raw: { fullText: 'Corrected.' }, toolCalls: [] }) }
    }
    const result = await keywordAgent.execute(task(), 'model-1', completion, event => events.push(event))
    assert.equal(invocations, 1)
    assert.equal(result.summary, 'Corrected.')
    assert.ok(events.includes('agent-tool-correction'))
  })

  test('fails when the model selects an unknown tool', async () => {
    await assert.rejects(keywordAgent.execute(task(), 'model-1', scriptedCompletion({
      calls: [{ name: 'delete_everything' }]
    })), /disallowed tool: delete_everything/i)
  })

  test('fails when the SDK cannot attach a handler', async () => {
    await assert.rejects(keywordAgent.execute(task(), 'model-1', scriptedCompletion({
      calls: [{ name: 'extract_keywords', invokable: false }]
    })), /disallowed tool: extract_keywords/i)
  })

  test('rejects model-supplied report substitutions with Zod', async () => {
    await assert.rejects(keywordAgent.execute(task(), 'model-1', scriptedCompletion({
      calls: [{ name: 'extract_keywords', args: { report: 'fabricated report' } }]
    })), error => error instanceof Error && error.name === 'ZodError')
  })

  test('enforces the task tool allowlist at invocation time', async () => {
    await assert.rejects(keywordAgent.execute(task({ allowedTools: [] }), 'model-1', scriptedCompletion({
      calls: [{ name: 'extract_keywords', args: {} }]
    })), /tool is not allowed/i)
  })

  test('propagates a failed final model turn', async () => {
    let turn = 0
    const completion = (options: any) => {
      turn++
      if (turn === 1) return scriptedCompletion({
        calls: [{ name: 'extract_keywords', args: {} }]
      })(options)
      return { final: Promise.reject(new Error('inference worker crashed')) }
    }
    await assert.rejects(keywordAgent.execute(task(), 'model-1', completion), /inference worker crashed/i)
  })

  test('uses an explicit deterministic fallback for an empty final response', async () => {
    const events: string[] = []
    const result = await keywordAgent.execute(task(), 'model-1', scriptedCompletion({
      calls: [{ name: 'extract_keywords', args: {} }]
    }, '<think>only reasoning</think>'), event => events.push(event))
    assert.equal(result.summary, 'Extracted maintenance keywords: bearing, low, lubricant, overheating, pressure, pump.')
    assert.ok(events.includes('agent-final-fallback'))
  })

  test('removes an unmatched thinking tag without discarding the answer', async () => {
    const result = await keywordAgent.execute(task(), 'model-1', scriptedCompletion({
      calls: [{ name: 'extract_keywords', args: {} }]
    }, '<think>Inspect the lubrication system before restarting the pump.'))
    assert.equal(result.summary, 'Inspect the lubrication system before restarting the pump.')
  })

  test('answers a pump question only after invoking local manual search', async () => {
    const knowledgeTask = task({
      type: 'answer-asset-question',
      input: { report: 'Pump 7 is hot', question: 'Why is Pump 7 hot?', keywords: ['pump', 'hot'] },
      allowedTools: ['search_pump_manual']
    })
    let searched = ''
    const expert = new ManualExpertAgent(async question => {
        searched = question
        return [{ id: 'bearing-temperature', content: 'Low pressure can starve the bearing.', score: 0.92 }]
      })
    const result = await expert.execute(knowledgeTask, 'model-1',
      scriptedCompletion({ calls: [{ name: 'search_pump_manual', args: {} }] }, 'Low lubricant pressure may starve the bearing.'))
    assert.equal(searched, 'Why is Pump 7 hot?')
    assert.equal(result.answer, 'Low lubricant pressure may starve the bearing.')
    assert.equal(result.citations[0]?.id, 'bearing-temperature')
  })
})
