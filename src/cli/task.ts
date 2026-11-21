import { enqueue, waitForResponse } from '../shared/control-plane.js'
import { incidentResponseSchema } from '../domain/types.js'
import { renderIncident } from '../presentation/incident-renderer.js'
import { LocalWeaveConfig } from '../runtime/config.js'
import { optionalArg } from '../shared/args.js'

const config = await LocalWeaveConfig.load()
const workflow = config.job(optionalArg('job'))
const owner = config.get(workflow.owner)
const id = crypto.randomUUID()
await enqueue(owner.id, { type: 'ask', id, question: workflow.demo, job: workflow.id })
console.log(`submitted incident ${id}; Willow is triaging it…`)
const response = incidentResponseSchema.parse(
  await waitForResponse(owner.id, id, Number(process.env.TASK_TIMEOUT_MS ?? 10 * 60_000))
)
if (response.status === 'failed') {
  console.error(`\n[${response.agent}] workflow failed: ${response.error}`)
  process.exitCode = 1
} else {
  console.log(`\n${renderIncident(response.agent, response.answer, response.citations, false)}`)
}
