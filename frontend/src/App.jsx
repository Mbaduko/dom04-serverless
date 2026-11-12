import { Authenticator } from '@aws-amplify/ui-react'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <Authenticator hideSignUp>
      {({ signOut }) => <Dashboard signOut={signOut} />}
    </Authenticator>
  )
}
