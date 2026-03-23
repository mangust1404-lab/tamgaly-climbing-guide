import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedDemoData, updateGpsCoordinates, restoreToposFromTags, loadTopoDataFromFile, fixRouteArrayFields } from './lib/db/seed'

// Auto-reload when new service worker takes control
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
  // Check for SW updates every 60 seconds
  navigator.serviceWorker.ready.then(reg => {
    setInterval(() => reg.update(), 60_000)
  })
}

// Render app immediately
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Seed data in background — useLiveQuery will pick it up reactively
async function initData() {
  try { await seedDemoData() } catch (e) { console.error('seedDemoData failed:', e) }
  try { await updateGpsCoordinates() } catch (e) { console.error('updateGpsCoordinates failed:', e) }
  try { await loadTopoDataFromFile() } catch (e) { console.error('loadTopoDataFromFile failed:', e) }
  try { await restoreToposFromTags() } catch (e) { console.error('restoreToposFromTags failed:', e) }
  try { await fixRouteArrayFields() } catch (e) { console.error('fixRouteArrayFields failed:', e) }
  console.log('Data init complete (build 2026-03-23c)')
}
initData()

// Re-check topo data when app becomes visible (tab switch, screen unlock)
let lastTopoCheck = Date.now()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastTopoCheck > 60_000) {
    lastTopoCheck = Date.now()
    loadTopoDataFromFile().catch(e => console.error('Topo re-check failed:', e))
  }
})
