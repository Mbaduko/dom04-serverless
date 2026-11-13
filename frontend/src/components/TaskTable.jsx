import {
  Badge, Button, Flex, SelectField, Table, TableBody, TableCell, TableHead, TableRow, Text,
} from '@aws-amplify/ui-react'
import {
  PRIORITY_VARIATIONS, STATUS_LABELS, STATUS_VARIATIONS, STATUSES, formatDate, isOverdue,
} from '../format'

export default function TaskTable({ tasks, isAdmin, members, busyId, actions }) {
  if (tasks.length === 0) return <Text color="font.tertiary">No tasks to show.</Text>

  return (
    <div className="table-scroll">
      <Table size="small" variation="striped" highlightOnHover>
        <TableHead>
          <TableRow>
            <TableCell as="th">Task</TableCell>
            <TableCell as="th">Status</TableCell>
            <TableCell as="th">Priority</TableCell>
            <TableCell as="th">Deadline</TableCell>
            {isAdmin && <TableCell as="th">Assigned to</TableCell>}
            <TableCell as="th">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => {
            const busy = busyId === task.taskId
            return (
              <TableRow key={task.taskId}>
                <TableCell>
                  <Text fontWeight="bold">{task.title}</Text>
                  {task.description && <Text fontSize="small" color="font.secondary">{task.description}</Text>}
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Badge variation={STATUS_VARIATIONS[task.status]}>{STATUS_LABELS[task.status]}</Badge>
                  ) : (
                    <SelectField
                      label="Status"
                      labelHidden
                      size="small"
                      value={task.status}
                      isDisabled={busy}
                      onChange={(e) => actions.setStatus(task, e.target.value)}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </SelectField>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variation={PRIORITY_VARIATIONS[task.priority]}>{task.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Text color={isOverdue(task) ? 'font.error' : undefined}>
                    {formatDate(task.deadline)}{isOverdue(task) ? ' (overdue)' : ''}
                  </Text>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <SelectField
                      label="Assign to"
                      labelHidden
                      size="small"
                      value={task.assignedTo ?? ''}
                      isDisabled={busy}
                      onChange={(e) => e.target.value && actions.assign(task, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.name ? `${m.name} (${m.email})` : m.email}</option>
                      ))}
                    </SelectField>
                  </TableCell>
                )}
                <TableCell>
                  {isAdmin ? (
                    <Flex gap="xs" wrap="wrap">
                      <Button size="small" onClick={() => actions.edit(task)} isDisabled={busy}>Edit</Button>
                      <Button size="small" onClick={() => actions.files(task)}>Files</Button>
                      <Button size="small" onClick={() => actions.notify(task)} isDisabled={busy || !task.assignedTo}>Notify</Button>
                      <Button size="small" colorTheme="error" onClick={() => actions.remove(task)} isDisabled={busy}>Delete</Button>
                    </Flex>
                  ) : (
                    <Flex direction="column" gap="xs" alignItems="flex-start">
                      <Button size="small" onClick={() => actions.files(task)}>Files</Button>
                      <Text fontSize="small" color="font.tertiary">Updated {formatDate(task.updatedAt)}</Text>
                    </Flex>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
