import { Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Page d'accueil (coquille vide) : c'est ici que démarre le contenu de l'appli.
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Bonjour {user?.name} !</h1>
      <div className="flex flex-col items-center gap-3 text-center bg-white rounded-xl shadow p-8 text-slate-500">
        <Compass size={40} className="text-indigo-200" />
        <p>Rien ici pour l'instant.</p>
      </div>
    </div>
  );
}
