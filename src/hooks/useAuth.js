import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

/**
 * Session (null en mode invité), e-mail du compte, état de synchronisation.
 * @returns {{ session: object | null | undefined, email: string | null, loading: boolean, syncStatus: string }}
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return value;
}
