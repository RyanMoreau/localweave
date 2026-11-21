import pino from 'pino'

const level = process.env.LOG_LEVEL ?? 'info'
const format = process.env.LOG_FORMAT ?? 'pretty'

export const logger = format === 'json'
  ? pino({ level })
  : pino({ level }, pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        colorizeObjects: true,
        singleLine: false,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname,peer,agent',
        messageFormat: '{agent}\n    {msg}'
      }
    }))

export const peerLogger = (peer: string, agent: string) => logger.child({ peer, agent })
