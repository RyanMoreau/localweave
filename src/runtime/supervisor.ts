import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { ConfiguredSpecialist } from './config.js'
import { renderChatLine } from '../presentation/chat-renderer.js'

export class LocalWeave {
  private readonly children: ChildProcess[] = []
  private stopping = false

  constructor(private readonly specialists: ConfiguredSpecialist[]) {
    if (!specialists.length) throw new Error('No LocalWeave specialists selected')
  }

  async start() {
    const colors = Object.fromEntries(this.specialists.map(specialist => [specialist.name, specialist.color]))
    const ordered = [...this.specialists].sort((a, b) => Number(b.role === 'dispatcher') - Number(a.role === 'dispatcher'))
    for (const specialist of ordered) {
      const child = spawn(process.execPath, [
        '--import', 'tsx', resolve('src/cli/peer.ts'),
        '--name', specialist.id
      ], { stdio: ['inherit', 'pipe', 'pipe'], env: {
        ...process.env,
        LOG_FORMAT: 'json',
        ...(specialist.knowledge ? {
          LOCALWEAVE_KNOWLEDGE_ASSET: specialist.knowledge.asset,
          LOCALWEAVE_KNOWLEDGE_BACKEND: specialist.knowledge.backend,
          LOCALWEAVE_KNOWLEDGE_SOURCE: specialist.knowledge.source
        } : {})
      } })
      this.children.push(child)
      createInterface({ input: child.stdout! }).on('line', line => renderChatLine(line, colors))
      createInterface({ input: child.stderr! }).on('line', line => process.stderr.write(`${specialist.name}: ${line}\n`))
      child.on('exit', (code, signal) => {
        if (!this.stopping && (code !== 0 || signal)) {
          console.error(`Specialist ${specialist.name} exited unexpectedly with code ${code}${signal ? ` (${signal})` : ''}`)
          process.exitCode = 1
          this.stop('SIGTERM')
        }
      })
      if (specialist.role === 'dispatcher') await new Promise(resolveDelay => setTimeout(resolveDelay, 300))
    }
    process.on('SIGINT', () => this.stop('SIGINT'))
    process.on('SIGTERM', () => this.stop('SIGTERM'))
    await Promise.all(this.children.map(child => new Promise<void>(resolveChild => child.once('exit', () => resolveChild()))))
  }

  stop(signal: NodeJS.Signals = 'SIGTERM') {
    if (this.stopping) return
    this.stopping = true
    for (const child of this.children) if (!child.killed) child.kill(signal)
  }
}
