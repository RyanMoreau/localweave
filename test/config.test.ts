import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalWeaveConfig } from '../src/runtime/config.js'

describe('LocalWeave configuration', () => {
  test('loads the three configured specialists', async () => {
    const config = await LocalWeaveConfig.load()
    assert.deepEqual(config.specialists.map(specialist => [specialist.id, specialist.name, specialist.role, specialist.color, specialist.enabled]), [
      ['willow', 'Willow', 'dispatcher', 'green', true],
      ['maverick', 'Maverick', 'specialist', 'cyan', true],
      ['oscar', 'Oscar', 'specialist', 'magenta', true]
    ])
    assert.equal(config.get('WILLOW').id, 'willow')
    assert.equal(config.get('Willow').id, 'willow')
  })

  test('loads the named two-stage workflow and resolves its owner', async () => {
    const helpDesk = await LocalWeaveConfig.load()
    const workflow = helpDesk.job()
    assert.equal(helpDesk.get(workflow.owner).name, 'Willow')
    assert.equal(workflow.stages[1]?.after, 'triage')
    assert.deepEqual(workflow.stages[1]?.requires, ['asset-knowledge'])
  })

  test('loads a second YAML-only job using existing capabilities', async () => {
    const config = await LocalWeaveConfig.load()
    const job = config.job('maintenance-triage')
    assert.equal(job.stages.length, 1)
    assert.equal(job.stages[0]?.tool, 'extract_keywords')
    assert.equal(config.get(job.owner).name, 'Willow')
  })

  test('rejects duplicate agent IDs before startup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localweave-config-'))
    const path = join(directory, 'localweave.yaml')
    await writeFile(path, `
defaultJob: demo
agents:
  - id: willow
    name: Willow
    role: dispatcher
    description: Owner
    skills: []
    tools: []
    color: green
  - id: willow
    name: Other Willow
    role: specialist
    description: Duplicate
    skills: [extract-keywords]
    tools: [extract_keywords]
    color: cyan
jobs:
  demo:
    version: 1
    owner: willow
    stages:
      - id: triage
        type: extract-keywords
        requires: [extract-keywords]
        tool: extract_keywords
    demo: Test
`)
    await assert.rejects(LocalWeaveConfig.load(path), /Duplicate agent ID: willow/)
  })

  test('rejects multiple network dispatchers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localweave-config-'))
    const path = join(directory, 'localweave.yaml')
    await writeFile(path, `
defaultJob: demo
agents:
  - id: willow
    name: Willow
    role: dispatcher
    description: Owner
    skills: []
    tools: []
    color: green
  - id: rowan
    name: Rowan
    role: dispatcher
    description: Second owner
    skills: [extract-keywords]
    tools: [extract_keywords]
    color: cyan
jobs:
  demo:
    version: 1
    owner: willow
    stages:
      - id: triage
        type: extract-keywords
        requires: [extract-keywords]
        tool: extract_keywords
    demo: Test
`)
    await assert.rejects(LocalWeaveConfig.load(path), /Exactly one enabled dispatcher is required; found 2/)
  })
})
