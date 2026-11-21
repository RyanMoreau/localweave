import { arg } from '../shared/args.js'
import { enqueue } from '../shared/control-plane.js'
import { LocalWeaveConfig } from '../runtime/config.js'

const peer = (await LocalWeaveConfig.load()).get(arg('peer')).id
const task = arg('task')
await enqueue(peer, { type: 'retry', task })
console.log(`retry queued for ${task} (this creates attempt N+1; it does not replay history)`)
