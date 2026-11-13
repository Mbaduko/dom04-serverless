import { useState } from 'react'
import {
  Alert, Badge, Button, Card, Flex, Heading, SelectField, Table, TableBody, TableCell, TableHead, TableRow, Text, TextField,
} from '@aws-amplify/ui-react'
import { api } from '../api'
import { formatDate } from '../format'

const NOTIFICATION_BADGES = {
  CONFIRMED: { label: 'Confirmed', variation: 'success' },
  PENDING: { label: 'Pending confirmation', variation: 'warning' },
  NOT_SUBSCRIBED: { label: 'Not subscribed', variation: 'error' },
}

export default function TeamPanel({ users, onCreated, onUpdated }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'TeamMember' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const user = await api.createUser({ ...form, name: form.name || undefined })
      onCreated(user)
      setMessage({
        type: 'success',
        text: `Invitation sent to ${user.email}. They must also confirm the "AWS Notification - Subscription Confirmation" email to receive task updates.`,
      })
      setForm({ email: '', name: '', role: 'TeamMember' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const subscribe = async (user) => {
    setBusyId(user.userId)
    setMessage(null)
    try {
      const result = await api.subscribeUser(user.userId)
      onUpdated({ ...user, notifications: result.notifications })
      setMessage({ type: 'success', text: `Confirmation email sent to ${user.email}` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Flex direction="column" gap="medium">
      <Card variation="outlined">
        <form onSubmit={submit}>
          <Flex direction="column" gap="small">
            <Heading level={5}>Add team member</Heading>
            <Text fontSize="small" color="font.secondary">
              They receive an email with a temporary password and set their own on first login.
            </Text>
            <Flex wrap="wrap" gap="small" alignItems="flex-end">
              <TextField label="Email" type="email" value={form.email} onChange={update('email')} isRequired />
              <TextField label="Name" value={form.name} onChange={update('name')} />
              <SelectField label="Role" value={form.role} onChange={update('role')}>
                <option value="TeamMember">Team member</option>
                <option value="Admin">Admin</option>
              </SelectField>
              <Button type="submit" variation="primary" isLoading={saving}>Send invitation</Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      {message && (
        <Alert variation={message.type} isDismissible onDismiss={() => setMessage(null)}>{message.text}</Alert>
      )}

      <Heading level={4}>Team</Heading>
      <div className="table-scroll">
        <Table size="small" variation="striped">
          <TableHead>
            <TableRow>
              <TableCell as="th">Name</TableCell>
              <TableCell as="th">Email</TableCell>
              <TableCell as="th">Role</TableCell>
              <TableCell as="th">Notifications</TableCell>
              <TableCell as="th">Added</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userId}>
                <TableCell>{user.name ?? '—'}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variation={user.role === 'Admin' ? 'info' : undefined}>
                    {user.role === 'Admin' ? 'Admin' : 'Team member'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Flex gap="xs" alignItems="center" wrap="wrap">
                    <Badge variation={NOTIFICATION_BADGES[user.notifications]?.variation}>
                      {NOTIFICATION_BADGES[user.notifications]?.label ?? 'Unknown'}
                    </Badge>
                    {user.notifications !== 'CONFIRMED' && (
                      <Button size="small" isLoading={busyId === user.userId} onClick={() => subscribe(user)}>
                        Send confirmation
                      </Button>
                    )}
                  </Flex>
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Flex>
  )
}
