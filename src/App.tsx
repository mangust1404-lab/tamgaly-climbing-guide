import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/ui/Layout'
import { HomePage } from './pages/HomePage'
import { SectorPage } from './pages/SectorPage'
import { RoutePage } from './pages/RoutePage'

// Lazy-load heavy pages (maplibre, openseadragon)
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const AdminTopoPage = lazy(() => import('./pages/admin/AdminTopoPage').then(m => ({ default: m.AdminTopoPage })))

function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
      Загрузка...
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/sector/:sectorId" element={<SectorPage />} />
          <Route path="/route/:routeId" element={<RoutePage />} />
          <Route path="/map" element={<Suspense fallback={<Loading />}><MapPage /></Suspense>} />
          <Route path="/leaderboard" element={<Suspense fallback={<Loading />}><LeaderboardPage /></Suspense>} />
          <Route path="/profile" element={<Suspense fallback={<Loading />}><ProfilePage /></Suspense>} />
          <Route path="/admin/topo" element={<Suspense fallback={<Loading />}><AdminTopoPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
