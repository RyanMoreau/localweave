import { LocalWeaveConfig } from '../runtime/config.js'
import { LocalWeave } from '../runtime/supervisor.js'

const config = await LocalWeaveConfig.load()
await new LocalWeave(config.enabled()).start()
