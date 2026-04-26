import { lazy, Suspense, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { I18nProvider } from './lib/i18n'
import { UserProvider } from './lib/userContext'
import { Layout } from './components/ui/Layout'
import { HomePage } from './pages/HomePage'
import { AboutPage } from './pages/AboutPage'
import { SectorPage } from './pages/SectorPage'
import { RoutePage } from './pages/RoutePage'
import { AdminGuard } from './components/admin/AdminGuard'

// Lazy-load heavy pages (maplibre, openseadragon)
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const AdminTopoPage = lazy(() => import('./pages/admin/AdminTopoPage').then(m => ({ default: m.AdminTopoPage })))
const AdminPhotoTagger = lazy(() => import('./pages/admin/AdminPhotoTagger').then(m => ({ default: m.AdminPhotoTagger })))
const ModerationPage = lazy(() => import('./pages/admin/ModerationPage').then(m => ({ default: m.ModerationPage })))
const AdminSectorsPage = lazy(() => import('./pages/admin/AdminSectorsPage').then(m => ({ default: m.AdminSectorsPage })))
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })))
const BoardPage = lazy(() => import('./pages/BoardPage').then(m => ({ default: m.BoardPage })))

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
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 400, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>:(</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Что-то пошло не так</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>Попробуйте перезагрузить страницу</p>
          <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            style={{ padding: '10px 24px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
            На главную
          </button>
          <details style={{ marginTop: 24, textAlign: 'left' }}>
            <summary style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}>Подробности для разработчика</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, color: '#999', marginTop: 8, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
              {this.state.error.message}
            </pre>
          </details>
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
      <UserProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/sector/:sectorId" element={<SectorPage />} />
            <Route path="/route/:routeId" element={<RoutePage />} />
            <Route path="/map" element={<Suspense fallback={<Loading />}><MapPage /></Suspense>} />
            <Route path="/leaderboard" element={<Suspense fallback={<Loading />}><LeaderboardPage /></Suspense>} />
            <Route path="/activity" element={<Suspense fallback={<Loading />}><ActivityPage /></Suspense>} />
            <Route path="/profile" element={<Suspense fallback={<Loading />}><ProfilePage /></Suspense>} />
            <Route path="/user/:userId" element={<Suspense fallback={<Loading />}><PublicProfilePage /></Suspense>} />
            <Route path="/board" element={<Suspense fallback={<Loading />}><BoardPage /></Suspense>} />
            <Route path="/admin/topo" element={<AdminGuard><Suspense fallback={<Loading />}><AdminTopoPage /></Suspense></AdminGuard>} />
            <Route path="/admin/photos" element={<AdminGuard><Suspense fallback={<Loading />}><AdminPhotoTagger /></Suspense></AdminGuard>} />
            <Route path="/admin/moderation" element={<AdminGuard><Suspense fallback={<Loading />}><ModerationPage /></Suspense></AdminGuard>} />
            <Route path="/admin/sectors" element={<AdminGuard><Suspense fallback={<Loading />}><AdminSectorsPage /></Suspense></AdminGuard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </UserProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}

export default App
