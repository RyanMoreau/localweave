export function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

export function optionalArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export function parseAskArguments(values: string[]) {
  const question: string[] = []
  let job: string | undefined
  let showEvidence = false
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (value === '--') continue
    if (value === '--evidence') {
      showEvidence = true
      continue
    }
    if (value === '--job') {
      job = values[++index]
      if (!job || job.startsWith('--')) throw new Error('Missing value for --job')
      continue
    }
    if (value) question.push(value)
  }
  return { question: question.join(' ').trim(), job, showEvidence }
}
