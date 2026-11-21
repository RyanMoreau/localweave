import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { isRuntimeRegistered, registeredRuntimeIds } from '../ai/runtime-factory.js'

const slugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Expected a lowercase slug')
const toolIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Expected a lowercase tool ID')

const specialistSchema = z.object({
  id: slugSchema,
  name: z.string().min(1).max(40),
  runtime: slugSchema.default('qvac'),
  role: z.enum(['dispatcher', 'specialist']),
  description: z.string(),
  skills: z.array(slugSchema),
  tools: z.array(toolIdSchema),
  model: z.string().optional(),
  color: z.enum(['cyan', 'magenta', 'blue', 'yellow', 'green']),
  enabled: z.boolean().default(true),
  knowledge: z.object({
    asset: z.string().min(1),
    backend: z.enum(['local-text', 'qvac-rag']),
    source: z.string().min(1)
  }).optional()
})

const configSchema = z.object({
  defaultJob: z.string(),
  assignmentTimeoutMs: z.number().int().positive().default(30_000),
  agents: z.array(specialistSchema).min(1),
  jobs: z.record(z.string(), z.object({
    version: z.number().int().positive(), owner: z.string(),
    stages: z.array(z.object({
      id: slugSchema, type: slugSchema,
      after: slugSchema.optional(), requires: z.array(slugSchema).min(1),
      tool: toolIdSchema
    })).min(1),
    demo: z.string().min(1)
  }))
}).superRefine((config, context) => {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  config.agents.forEach((agent, index) => {
    if (seenIds.has(agent.id)) {
      context.addIssue({ code: 'custom', path: ['agents', index, 'id'], message: `Duplicate agent ID: ${agent.id}` })
    }
    seenIds.add(agent.id)

    const name = agent.name.toLowerCase()
    if (seenNames.has(name)) {
      context.addIssue({ code: 'custom', path: ['agents', index, 'name'], message: `Duplicate agent name: ${agent.name}` })
    }
    seenNames.add(name)
  })

  const dispatchers = config.agents.filter(agent => agent.enabled && agent.role === 'dispatcher')
  if (dispatchers.length !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['agents'],
      message: `Exactly one enabled dispatcher is required; found ${dispatchers.length}`
    })
  }
})

export type ConfiguredSpecialist = z.infer<typeof specialistSchema>
export type JobDefinition = z.infer<typeof configSchema>['jobs'][string] & { id: string }

export class LocalWeaveConfig {
  private constructor(
    readonly specialists: ConfiguredSpecialist[],
    readonly jobs: JobDefinition[],
    readonly defaultJob: string,
    readonly assignmentTimeoutMs: number
  ) {}

  static async load(path = resolve(process.env.LOCALWEAVE_CONFIG ?? 'examples/maintenance-helpdesk/localweave.yaml')) {
    const config = configSchema.parse(parse(await readFile(path, 'utf8')))
    const specialists = config.agents
    const jobs = Object.entries(config.jobs).map(([id, job]) => ({ id, ...job }))
    const result = new LocalWeaveConfig(specialists, jobs, config.defaultJob, config.assignmentTimeoutMs)
    result.validate()
    return result
  }

  private validate() {
    this.job(this.defaultJob)
    for (const specialist of this.specialists) {
      if (!isRuntimeRegistered(specialist.runtime)) {
        throw new Error(`Unknown inference adapter ${specialist.runtime}. Registered: ${registeredRuntimeIds().join(', ')}`)
      }
    }
    for (const job of this.jobs) {
      this.getById(job.owner)
      job.stages.forEach((stage, index) => {
        const previous = job.stages[index - 1]
        if (index > 0 && stage.after !== previous?.id) {
          throw new Error(`Job ${job.id} stage ${stage.id} must follow ${previous?.id}`)
        }
        const capable = this.specialists.some(agent => agent.enabled &&
          stage.requires.every(skill => agent.skills.includes(skill)) && agent.tools.includes(stage.tool))
        if (!capable) throw new Error(`Job ${job.id} stage ${stage.id} has no configured capable agent`)
      })
    }
  }

  enabled() { return this.specialists.filter(specialist => specialist.enabled) }

  get(reference: string) {
    const normalized = reference.toLowerCase()
    const specialist = this.specialists.find(candidate =>
      candidate.id.toLowerCase() === normalized || candidate.name.toLowerCase() === normalized)
    if (!specialist) {
      throw new Error(`Unknown specialist ${reference}. Available: ${this.specialists.map(candidate => `${candidate.id} (${candidate.name})`).join(', ')}`)
    }
    return specialist
  }

  getById(id: string) {
    const specialist = this.specialists.find(candidate => candidate.id === id)
    if (!specialist) throw new Error(`Unknown specialist ID ${id}`)
    return specialist
  }

  job(id = this.defaultJob) {
    const job = this.jobs.find(candidate => candidate.id === id)
    if (!job) throw new Error(`Unknown job ${id}. Available: ${this.jobs.map(candidate => candidate.id).join(', ')}`)
    return job
  }

  select(ids: string[]) { return ids.map(id => this.get(id)) }
}
