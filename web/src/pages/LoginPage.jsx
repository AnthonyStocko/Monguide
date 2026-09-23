import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import IconField from '../components/IconField.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-indigo-50 to-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <span className="bg-indigo-100 text-indigo-600 rounded-full p-3">
            <Sparkles size={28} />
          </span>
          <h1 className="text-xl font-semibold">Connexion</h1>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

        <IconField
          icon={Mail}
          id="email"
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <IconField
          icon={Lock}
          id="password"
          label="Mot de passe"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-md py-2.5 font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <LogIn size={18} />
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="text-sm text-center text-slate-600">
          Pas de compte ? <Link to="/register" className="text-indigo-600 font-medium underline">Créer un compte</Link>
        </p>
      </form>
    </div>
  );
}
