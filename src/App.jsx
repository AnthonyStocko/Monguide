import { Navigate, Route, Routes } from 'react-router';
import AppLayout from './components/layout/AppLayout.jsx';
import UpdateRequiredScreen from './components/layout/UpdateRequiredScreen.jsx';
import { useConfig } from './hooks/useConfig.js';
import CreatePage from './pages/CreatePage.jsx';
import DebugPage from './pages/DebugPage.jsx';
import FavoritesPage from './pages/FavoritesPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MapPage from './pages/MapPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  const { updateRequired } = useConfig();
  if (updateRequired) return <UpdateRequiredScreen />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="planning/:tripId" element={<PlanningPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="debug" element={<DebugPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
