import { enqueue, waitForResponse } from '../shared/control-plane.js'
import { incidentResponseSchema } from '../domain/types.js'
import { renderIncident } from '../presentation/incident-renderer.js'
import { LocalWeaveConfig } from '../runtime/config.js'
import { parseAskArguments } from '../shared/args.js'

const { question, job: requestedJob, showEvidence } = parseAskArguments(process.argv.slice(2))
if (!question) throw new Error('Usage: npm run ask -- "Why is Pump 7 overheating?"')

const id = crypto.randomUUID()
const config = await LocalWeaveConfig.load()
const job = config.job(requestedJob)
const owner = config.get(job.owner)
await enqueue(owner.id, { type: 'ask', id, question, job: job.id })
console.log(`submitted incident ${id}; Willow is triaging it…`)
const response = incidentResponseSchema.parse(
  await waitForResponse(owner.id, id, Number(process.env.TASK_TIMEOUT_MS ?? 10 * 60_000))
)
if (response.status === 'failed') {
  console.error(`\n[${response.agent}] workflow failed: ${response.error}`)
  process.exitCode = 1
} else {
  console.log(`\n${renderIncident(response.agent, response.answer, response.citations, showEvidence)}`)
}
