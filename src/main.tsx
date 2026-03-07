import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedDemoData } from './lib/db/seed'

// Render app immediately
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Seed data in background — useLiveQuery will pick it up reactively
seedDemoData().catch((err) => {
  console.error('Seed failed:', err)
})
