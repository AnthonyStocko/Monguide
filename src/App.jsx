import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import AppLayout from './components/layout/AppLayout.jsx';
import UpdateRequiredScreen from './components/layout/UpdateRequiredScreen.jsx';
import { useConfig } from './hooks/useConfig.js';
import AboutPage from './pages/AboutPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import CreatePage from './pages/CreatePage.jsx';
import DebugPage from './pages/DebugPage.jsx';
import FavoritesPage from './pages/FavoritesPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MapPage from './pages/MapPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { initNotifications } from './services/notifications.js';

/** Notifications : un appui ouvre l'onglet Planning sur le bon jour et le bon créneau. */
function NotificationsBridge() {
  const navigate = useNavigate();
  useEffect(() => initNotifications({ onOpen: (url) => navigate(url) }), [navigate]);
  return null;
}

export default function App() {
  const { updateRequired } = useConfig();
  if (updateRequired) return <UpdateRequiredScreen />;

  return (
    <>
      <NotificationsBridge />
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
          <Route path="account" element={<AccountPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
