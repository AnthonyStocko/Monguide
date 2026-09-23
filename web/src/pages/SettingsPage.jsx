import { useState } from 'react';
import { SlidersHorizontal, UserRound, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import DeleteAccountForm from '../components/DeleteAccountForm.jsx';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <SlidersHorizontal size={20} className="text-indigo-600" />
        Réglages
      </h1>

      <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
        <span className="bg-indigo-100 text-indigo-600 rounded-full p-2.5 shrink-0">
          <UserRound size={20} />
        </span>
        <div>
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <p className="font-semibold flex items-center gap-2">
          <Trash2 size={18} className="text-red-600" />
          Supprimer mon compte
        </p>
        <p className="text-sm text-slate-600">Supprime définitivement le compte et toutes ses données.</p>
        {showDelete ? (
          // Compte supprimé : on déconnecte, ProtectedRoute renvoie vers la connexion.
          <DeleteAccountForm email={user?.email} onDeleted={logout} />
        ) : (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="rounded-md px-4 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
          >
            Supprimer mon compte…
          </button>
        )}
      </div>
    </div>
  );
}
