import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { incidentResponseSchema } from '../domain/types.js'
import { peerDir } from '../shared/control-plane.js'
import { parseJson } from '../shared/json.js'
import { renderIncident } from '../presentation/incident-renderer.js'
import { cleanAnswer } from '../ai/contracts.js'
import { LocalWeaveConfig } from '../runtime/config.js'

const requestedId = process.argv.slice(2).find(value => value !== '--' && value !== '--evidence')
const showEvidence = process.argv.includes('--evidence')
const config = await LocalWeaveConfig.load()
const owner = config.get(config.job().owner)
const responseDir = join(peerDir(owner.id), 'responses')

async function readIncident(file: string) {
  const parsed = incidentResponseSchema.safeParse(parseJson(await readFile(join(responseDir, file), 'utf8')))
  return parsed.success ? parsed.data : null
}

if (requestedId) {
  if (!/^[a-f0-9-]{36}$/i.test(requestedId)) throw new Error('Incident ID must be a UUID')
  const response = await readIncident(`${requestedId}.json`).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  })
  if (!response) throw new Error(`No completed incident response found for ${requestedId}`)
  if (response.status === 'failed') {
    console.error(`[${response.agent}] workflow failed: ${response.error ?? 'unknown error'}`)
    process.exitCode = 1
  } else {
    console.log(renderIncident(response.agent, response.answer, response.citations, showEvidence))
  }
} else {
  const files = await readdir(responseDir).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })
  const incidents = []
  for (const file of files.filter(file => file.endsWith('.json')).sort().reverse()) {
    const response = await readIncident(file)
    if (response) incidents.push({ id: basename(file, '.json'), response })
  }
  if (!incidents.length) console.log('No persisted incident responses yet.')
  for (const { id, response } of incidents) {
    const detail = response.status === 'completed'
      ? cleanAnswer(response.answer).replace(/\s+/g, ' ').replace(/[*_]/g, '').slice(0, 90)
      : response.error ?? 'unknown error'
    console.log(`${id}  ${response.status.padEnd(9)}  ${detail}${detail.length === 90 ? '…' : ''}`)
  }
}
