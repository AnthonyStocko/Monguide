import { Link, Outlet } from 'react-router-dom';
import { Settings, LogOut, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
          <span className="bg-white/15 rounded-full p-1.5">
            <Compass size={20} />
          </span>
          Mon guide
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/15 transition-colors"
          >
            <Settings size={18} />
            <span className="hidden sm:inline">Réglages</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/15 transition-colors"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </nav>
      </header>
      <main className="flex-1 max-w-2xl w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
