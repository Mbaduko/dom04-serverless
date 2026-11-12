import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import '@aws-amplify/ui-react/styles.css'
import './index.css'
import App from './App.jsx'
import { setApiUrl } from './api'

const config = await fetch('/config.json').then((res) => res.json())

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
    },
  },
})

setApiUrl(config.apiUrl)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
