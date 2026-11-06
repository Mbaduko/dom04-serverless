import { Authenticator } from '@aws-amplify/ui-react'

export default function App() {
  return (
    <Authenticator hideSignUp>
      {({ signOut, user }) => (
        <main className="dashboard">
          <h1>Task Manager</h1>
          <p>Signed in as {user?.signInDetails?.loginId}</p>
          <button onClick={signOut}>Sign out</button>
        </main>
      )}
    </Authenticator>
  )
}
