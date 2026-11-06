import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import '@aws-amplify/ui-react/styles.css'
import './index.css'
import App from './App.jsx'

const config = await fetch('/config.json').then((res) => res.json())

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App apiUrl={config.apiUrl} />
  </StrictMode>,
)
