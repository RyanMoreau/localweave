import { LocalWeaveConfig } from '../runtime/config.js'
import { LocalWeave } from '../runtime/supervisor.js'

const ids = process.argv.slice(2)
if (!ids.length) throw new Error('Usage: npm run specialist -- <name> [name...]')
const config = await LocalWeaveConfig.load()
await new LocalWeave(config.select(ids)).start()
