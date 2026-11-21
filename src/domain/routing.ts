import type { AgentManifest } from './types.js'

export function selectAgent(
  agents: AgentManifest[],
  requiredSkills: AgentManifest['skills']
): AgentManifest | undefined {
  return agents
    .filter(agent => agent.status === 'available')
    .filter(agent => requiredSkills.every(skill => agent.skills.includes(skill)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.writerKey.localeCompare(b.writerKey))[0]
}
