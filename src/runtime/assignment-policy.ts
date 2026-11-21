import type { Task } from '../domain/types.js'

export function assignmentAge(task: Task, currentTime = Date.now()) {
  const created = task.history.find(entry => entry.event === 'created')
  const timestamp = created ? Date.parse(created.at) : Number.NaN
  return Number.isFinite(timestamp) ? Math.max(0, currentTime - timestamp) : 0
}

export function assignmentExpired(task: Task, timeoutMs: number, currentTime = Date.now()) {
  return assignmentAge(task, currentTime) >= timeoutMs
}
