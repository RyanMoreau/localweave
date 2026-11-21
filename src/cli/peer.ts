import { arg } from '../shared/args.js'
import { LocalWeavePeer } from '../runtime/peer.js'
import { LocalWeaveConfig } from '../runtime/config.js'

const name = arg('name')
const config = await LocalWeaveConfig.load()
const agent = config.get(name)
const peer = new LocalWeavePeer(agent, config.jobs, config.assignmentTimeoutMs)
await peer.start()

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await peer.close()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
