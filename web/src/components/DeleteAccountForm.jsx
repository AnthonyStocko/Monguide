import { useState } from 'react';
import { Mail, Lock, Trash2 } from 'lucide-react';
import { deleteAccount } from '../api/auth.js';
import IconField from './IconField.jsx';

/**
 * Suppression définitive du compte parent, confirmée par le mot de passe.
 * `email` connu (parent connecté, page Réglages) → seul le mot de passe est
 * demandé ; sinon (page publique /suppression-compte) l'email aussi.
 */
export default function DeleteAccountForm({ email: knownEmail, onDeleted }) {
  const [email, setEmail] = useState(knownEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await deleteAccount(knownEmail ?? email, password);
      onDeleted?.();
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
      {!knownEmail && (
        <IconField
          icon={Mail}
          id="delete-email"
          label="Email du compte"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      <IconField
        icon={Lock}
        id="delete-password"
        label="Mot de passe"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Je comprends que le compte et toutes ses données seront supprimés définitivement.
      </label>
      <button
        type="submit"
        disabled={pending || !confirmed}
        className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
      >
        <Trash2 size={16} />
        {pending ? 'Suppression…' : 'Supprimer mon compte'}
      </button>
    </form>
  );
}
