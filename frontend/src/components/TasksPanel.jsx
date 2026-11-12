import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, Heading, Loader, SelectField } from '@aws-amplify/ui-react'
import { api } from '../api'
import { STATUS_LABELS, STATUSES } from '../format'
import TaskForm from './TaskForm'
import TaskTable from './TaskTable'

export default function TasksPanel({ isAdmin, members = [] }) {
  const [tasks, setTasks] = useState([])
  const [nextToken, setNextToken] = useState()
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(null)

  const load = useCallback(async (token) => {
    setLoading(true)
    try {
      const page = await api.listTasks({ status, nextToken: token })
      setTasks((current) => (token ? [...current, ...page.items] : page.items))
      setNextToken(page.nextToken)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  const replace = (updated) =>
    setTasks((current) => current.map((t) => (t.taskId === updated.taskId ? updated : t)))

  const run = async (task, action, success) => {
    setBusyId(task?.taskId ?? 'form')
    setMessage(null)
    try {
      const result = await action()
      if (success) setMessage({ type: 'success', text: success(result) })
      return result
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
      throw error
    } finally {
      setBusyId(null)
    }
  }

  const actions = {
    edit: (task) => setEditing(task),
    setStatus: (task, value) =>
      run(task, () => api.updateTask(task.taskId, { status: value }), () => 'Status updated').then(replace).catch(() => {}),
    assign: (task, userId) =>
      run(task, () => api.assignTask(task.taskId, userId), (t) => `Assigned to ${t.assigneeEmail}`).then(replace).catch(() => {}),
    notify: (task) =>
      run(task, () => api.notifyTask(task.taskId), (r) => `Reminder queued for ${r.recipient}`).catch(() => {}),
    remove: (task) => {
      if (!window.confirm(`Delete "${task.title}"?`)) return
      run(task, () => api.deleteTask(task.taskId), () => 'Task deleted')
        .then(() => setTasks((current) => current.filter((t) => t.taskId !== task.taskId)))
        .catch(() => {})
    },
  }

  const saveForm = async (payload) => {
    if (editing && editing !== 'new') {
      const updated = await run(editing, () => api.updateTask(editing.taskId, payload), () => 'Task saved')
      replace(updated)
    } else {
      const created = await run(null, () => api.createTask(payload), (t) => `Created "${t.title}"`)
      setTasks((current) => [created, ...current])
    }
    setEditing(null)
  }

  return (
    <Flex direction="column" gap="medium">
      <Flex justifyContent="space-between" alignItems="flex-end" wrap="wrap" gap="small">
        <Heading level={4}>{isAdmin ? 'All tasks' : 'My tasks'}</Heading>
        <Flex gap="small" alignItems="flex-end">
          <SelectField label="Filter by status" size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </SelectField>
          <Button size="small" onClick={() => load()}>Refresh</Button>
          {isAdmin && !editing && (
            <Button size="small" variation="primary" onClick={() => setEditing('new')}>New task</Button>
          )}
        </Flex>
      </Flex>

      {message && (
        <Alert variation={message.type} isDismissible onDismiss={() => setMessage(null)}>{message.text}</Alert>
      )}

      {isAdmin && editing && (
        <TaskForm
          key={editing === 'new' ? 'new' : editing.taskId}
          task={editing === 'new' ? null : editing}
          onSubmit={(payload) => saveForm(payload).catch(() => {})}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading && tasks.length === 0 ? (
        <Loader variation="linear" />
      ) : (
        <TaskTable tasks={tasks} isAdmin={isAdmin} members={members} busyId={busyId} actions={actions} />
      )}

      {nextToken && (
        <Button onClick={() => load(nextToken)} isLoading={loading}>Load more</Button>
      )}
    </Flex>
  )
}
