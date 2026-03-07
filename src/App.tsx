import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/ui/Layout'
import { HomePage } from './pages/HomePage'
import { SectorPage } from './pages/SectorPage'
import { RoutePage } from './pages/RoutePage'
import { MapPage } from './pages/MapPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { ProfilePage } from './pages/ProfilePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/sector/:sectorId" element={<SectorPage />} />
          <Route path="/route/:routeId" element={<RoutePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
