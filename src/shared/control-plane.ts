import { mkdir, readFile, writeFile, readdir, unlink, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { z } from 'zod'

export const rootDir = resolve(process.env.LOCALWEAVE_DATA_DIR ?? '.localweave')
export const peerDir = (name: string) => join(rootDir, 'peers', name)
export const networkFile = join(rootDir, 'network.json')

export async function ensureDir(path: string) { await mkdir(path, { recursive: true }) }
export async function readNetwork() { return JSON.parse(await readFile(networkFile, 'utf8')) as { bootstrapKey: string } }
export async function writeNetwork(bootstrapKey: string) {
  await ensureDir(rootDir)
  await writeFile(networkFile, JSON.stringify({ bootstrapKey }, null, 2))
}
export async function enqueue(peer: string, command: unknown) {
  const dir = join(peerDir(peer), 'commands')
  await ensureDir(dir)
  await writeFile(join(dir, `${Date.now()}-${crypto.randomUUID()}.json`), JSON.stringify(command))
}
export async function consumeCommands<T>(
  peer: string,
  schema: z.ZodType<T>,
  handle: (command: T) => Promise<void>,
  reject: (error: unknown, command?: T) => Promise<void>
) {
  const dir = join(peerDir(peer), 'commands')
  const rejectedDir = join(peerDir(peer), 'rejected-commands')
  await ensureDir(dir)
  let consumed = 0
  for (const file of (await readdir(dir)).sort()) {
    const path = join(dir, file)
    let command: T | undefined
    try {
      command = schema.parse(JSON.parse(await readFile(path, 'utf8')))
      await handle(command)
      await unlink(path)
      consumed++
    } catch (error) {
      await ensureDir(rejectedDir)
      await rename(path, join(rejectedDir, file)).catch(() => undefined)
      await reject(error, command).catch(() => undefined)
    }
  }
  return consumed
}

export async function publishResponse(peer: string, taskId: string, response: unknown) {
  const dir = join(peerDir(peer), 'responses')
  await ensureDir(dir)
  const path = join(dir, `${taskId}.json`)
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(response))
  await rename(temporary, path)
}

export async function readResponse(peer: string, taskId: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(join(peerDir(peer), 'responses', `${taskId}.json`), 'utf8')) }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function waitForResponse<T = unknown>(peer: string, taskId: string, timeoutMs = 10 * 60_000): Promise<T> {
  const path = join(peerDir(peer), 'responses', `${taskId}.json`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, 'utf8')) as T }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for task ${taskId}`)
}
