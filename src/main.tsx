import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedDemoData, updateGpsCoordinates, restoreToposFromTags, loadTopoDataFromFile } from './lib/db/seed'

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
  console.log('Data init complete (build 2025-03-19b)')
}
initData()
