import { useState } from 'react'
import { Button, Card, Flex, Heading, SelectField, TextAreaField, TextField } from '@aws-amplify/ui-react'
import { PRIORITIES, STATUS_LABELS, STATUSES, fromLocalInput, toLocalInput } from '../format'

export default function TaskForm({ task, onSubmit, onCancel }) {
  const editing = Boolean(task)
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'MEDIUM',
    deadline: toLocalInput(task?.deadline),
    status: task?.status ?? 'TODO',
  })
  const [saving, setSaving] = useState(false)

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        deadline: fromLocalInput(form.deadline),
      }
      if (editing) payload.status = form.status
      await onSubmit(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card variation="outlined">
      <form onSubmit={submit}>
        <Flex direction="column" gap="small">
          <Heading level={5}>{editing ? 'Edit task' : 'New task'}</Heading>
          <TextField label="Title" value={form.title} onChange={update('title')} isRequired maxLength={200} />
          <TextAreaField label="Description" value={form.description} onChange={update('description')} rows={3} maxLength={2000} />
          <Flex wrap="wrap" gap="small">
            <SelectField label="Priority" value={form.priority} onChange={update('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </SelectField>
            <TextField label="Deadline" type="datetime-local" value={form.deadline} onChange={update('deadline')} />
            {editing && (
              <SelectField label="Status" value={form.status} onChange={update('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </SelectField>
            )}
          </Flex>
          <Flex gap="small">
            <Button type="submit" variation="primary" isLoading={saving}>{editing ? 'Save changes' : 'Create task'}</Button>
            {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          </Flex>
        </Flex>
      </form>
    </Card>
  )
}
