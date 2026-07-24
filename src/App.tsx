import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DataProvider } from './context/DataContext'
import { PreferencesProvider } from './context/PreferencesContext'
import { AddressPage } from './pages/AddressPage'
import { BuildingPage } from './pages/BuildingPage'
import { ComparePage } from './pages/ComparePage'
import { HomePage } from './pages/HomePage'
import { RankingsPage } from './pages/RankingsPage'
import { SavedPage } from './pages/SavedPage'
import { ScoringPage } from './pages/ScoringPage'

export default function App() {
  return (
    <DataProvider>
      <PreferencesProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="address/:id" element={<AddressPage />} />
              <Route path="building/:id" element={<BuildingPage />} />
              <Route path="rankings" element={<RankingsPage />} />
              <Route path="scoring" element={<ScoringPage />} />
              <Route path="saved" element={<SavedPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PreferencesProvider>
    </DataProvider>
  )
}
