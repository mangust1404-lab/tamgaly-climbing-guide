import { lazy, Suspense, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from './lib/i18n'
import { Layout } from './components/ui/Layout'
import { HomePage } from './pages/HomePage'
import { AboutPage } from './pages/AboutPage'
import { SectorPage } from './pages/SectorPage'
import { RoutePage } from './pages/RoutePage'

// Lazy-load heavy pages (maplibre, openseadragon)
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const AdminTopoPage = lazy(() => import('./pages/admin/AdminTopoPage').then(m => ({ default: m.AdminTopoPage })))
const AdminPhotoTagger = lazy(() => import('./pages/admin/AdminPhotoTagger').then(m => ({ default: m.AdminPhotoTagger })))

function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
      Загрузка...
    </div>
  )
}

// Error boundary to show errors on screen instead of white page
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace', fontSize: 14 }}>
          <h2>Error:</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#666' }}>
            {this.state.error.stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            style={{ marginTop: 10, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/sector/:sectorId" element={<SectorPage />} />
            <Route path="/route/:routeId" element={<RoutePage />} />
            <Route path="/map" element={<Suspense fallback={<Loading />}><MapPage /></Suspense>} />
            <Route path="/leaderboard" element={<Suspense fallback={<Loading />}><LeaderboardPage /></Suspense>} />
            <Route path="/profile" element={<Suspense fallback={<Loading />}><ProfilePage /></Suspense>} />
            <Route path="/admin/topo" element={<Suspense fallback={<Loading />}><AdminTopoPage /></Suspense>} />
            <Route path="/admin/photos" element={<Suspense fallback={<Loading />}><AdminPhotoTagger /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
      </I18nProvider>
    </ErrorBoundary>
  )
}

export default App
