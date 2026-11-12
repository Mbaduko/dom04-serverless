import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Flex, Heading, Loader, Tabs, Text, View } from '@aws-amplify/ui-react'
import { api, getSessionInfo } from '../api'
import TasksPanel from './TasksPanel'
import TeamPanel from './TeamPanel'

export default function Dashboard({ signOut }) {
  const [session, setSession] = useState(null)
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    getSessionInfo()
      .then(async (info) => {
        setSession(info)
        if (info.isAdmin) {
          const page = await api.listUsers({ limit: 100 })
          setUsers(page.items)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <Alert variation="error">{error}</Alert>
  if (!session) return <Loader variation="linear" />

  const members = users.filter((u) => u.role === 'TeamMember')

  return (
    <View className="app">
      <Flex as="header" className="app-header" justifyContent="space-between" alignItems="center" wrap="wrap" gap="small">
        <Heading level={3}>Task Manager</Heading>
        <Flex alignItems="center" gap="small">
          <Text>{session.email}</Text>
          <Badge variation={session.isAdmin ? 'info' : undefined}>{session.isAdmin ? 'Admin' : 'Team member'}</Badge>
          <Button size="small" onClick={signOut}>Sign out</Button>
        </Flex>
      </Flex>

      <View as="main" className="app-main">
        {session.isAdmin ? (
          <Tabs
            defaultValue="tasks"
            items={[
              { label: 'Tasks', value: 'tasks', content: <TasksPanel isAdmin members={members} /> },
              {
                label: 'Team',
                value: 'team',
                content: <TeamPanel users={users} onCreated={(user) => setUsers((current) => [...current, user])} />,
              },
            ]}
          />
        ) : (
          <TasksPanel isAdmin={false} />
        )}
      </View>
    </View>
  )
}
