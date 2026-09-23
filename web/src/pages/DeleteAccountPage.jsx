import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import DeleteAccountForm from '../components/DeleteAccountForm.jsx';

// Page publique (sans connexion) déclarée à Google Play comme lien de
// suppression de compte : https://monguide.alwaysdata.net/suppression-compte
// Texte à compléter quand l'appli stockera d'autres données.
export default function DeleteAccountPage() {
  const { logout } = useAuth();
  const [deleted, setDeleted] = useState(false);

  function handleDeleted() {
    logout(); // au cas où ce navigateur était connecté au compte supprimé
    setDeleted(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-indigo-50 to-white">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <span className="bg-red-100 text-red-600 rounded-full p-3">
            <Trash2 size={28} />
          </span>
          <h1 className="text-xl font-semibold text-center">Supprimer un compte Mon guide</h1>
        </div>

        {deleted ? (
          <p className="flex items-center gap-2 text-green-700 bg-green-50 rounded-md px-3 py-2">
            <CheckCircle2 size={18} className="shrink-0" />
            Le compte et toutes ses données ont été supprimés.
          </p>
        ) : (
          <>
            <div className="text-sm text-slate-600 space-y-2">
              <p>
                La suppression est immédiate et définitive. Elle efface le compte (nom, email, mot de
                passe) et toutes les données qui y sont liées.
              </p>
              <p>Aucune donnée n'est conservée après la suppression.</p>
              <p>
                Tu peux aussi le faire depuis l'application : Réglages, puis « Supprimer mon compte ».
              </p>
            </div>
            <DeleteAccountForm onDeleted={handleDeleted} />
          </>
        )}

        <p className="text-sm text-center">
          <Link to="/" className="text-indigo-600 font-medium underline">Retour à l'application</Link>
        </p>
      </div>
    </div>
  );
}
