import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startSimulation } from './app/state'
import './styles.css'

startSimulation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
