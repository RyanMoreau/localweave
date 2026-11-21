import type { AgentRuntime } from '../domain/contracts.js'
import { QvacInferenceAdapter } from './qvac-inference-adapter.js'

type RuntimeOptions = { model?: string }
type RuntimeFactory = (options: RuntimeOptions) => AgentRuntime

const adapters: Record<string, RuntimeFactory> = {
  qvac: options => new QvacInferenceAdapter(undefined, options.model)
}

export const registeredRuntimeIds = () => Object.keys(adapters)
export const isRuntimeRegistered = (id: string) => id in adapters

/** Creates the inference adapter declared by a specialist in localweave.yaml. */
export function createAgentRuntime(id: string, options: RuntimeOptions = {}): AgentRuntime {
  const factory = adapters[id]
  if (!factory) throw new Error(`Unknown inference adapter ${id}. Registered: ${registeredRuntimeIds().join(', ')}`)
  return factory(options)
}
