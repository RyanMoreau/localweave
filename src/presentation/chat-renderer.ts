import { writeSync } from 'node:fs'

type LogRecord = Record<string, unknown> & {
  level?: number
  time?: number
  agent?: string
  msg?: string
  err?: { message?: string }
}

const colors = [36, 35, 34, 33, 32]
const namedColors = { cyan: 36, magenta: 35, blue: 34, yellow: 33, green: 32 } as const
const paint = (code: number, value: string) => process.env.NO_COLOR ? value : `\u001b[${code}m${value}\u001b[0m`
const agentColor = (name: string) => colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]!
const short = (key: string, value: unknown) =>
  ['taskId', 'writer', 'identity', 'remote', 'assigneeWriter'].includes(key) && typeof value === 'string' && value.length > 12
    ? value.slice(0, 8)
    : value

export function renderChatLine(line: string, configuredColors: Record<string, keyof typeof namedColors> = {}) {
  let record: LogRecord
  try { record = JSON.parse(line) }
  catch {
    process.stderr.write(`${line}\n`)
    return
  }

  const name = record.agent ?? record.peer?.toString() ?? 'system'
  const stamp = new Date(record.time ?? Date.now()).toLocaleTimeString('en-CA', { hour12: false })
  const level = record.level ?? 30
  const message = level >= 50 ? paint(31, record.msg ?? 'error') : record.msg ?? 'event'
  const ignored = new Set(['level', 'time', 'pid', 'hostname', 'peer', 'agent', 'msg', 'event', 'err'])
  const details = Object.entries(record)
    .filter(([key]) => !ignored.has(key))
    .filter(([, value]) => !(Array.isArray(value) && value.length === 0))
    .filter(([key]) => !(record.event === 'audit-passed' && (key === 'expected' || key === 'actual')))
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}=${value.join(',')}`
      return `${key}=${short(key, value)}`
    })
  if (record.err?.message) details.push(`error=${record.err.message}`)

  const color = configuredColors[name] ? namedColors[configuredColors[name]!] : agentColor(name)
  writeSync(1,
    `${paint(90, stamp)}  ${paint(color, `[${name}]`)} ${message}` +
    `${details.length ? paint(90, ` · ${details.join(' · ')}`) : ''}\n`
  )
}
