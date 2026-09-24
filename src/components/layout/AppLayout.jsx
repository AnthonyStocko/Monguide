import { Outlet } from 'react-router';
import BottomNav from './BottomNav.jsx';
import TopBar from './TopBar.jsx';

export default function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="flex flex-1 flex-col pb-nav">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
