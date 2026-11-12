export const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

export const STATUS_LABELS = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' }

export const STATUS_VARIATIONS = { TODO: 'info', IN_PROGRESS: 'warning', DONE: 'success' }
export const PRIORITY_VARIATIONS = { LOW: undefined, MEDIUM: 'info', HIGH: 'error' }

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const isOverdue = (task) =>
  task.deadline && task.status !== 'DONE' && new Date(task.deadline) < new Date()

export const toLocalInput = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : undefined)
