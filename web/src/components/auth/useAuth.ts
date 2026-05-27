import { createContext, useContext } from 'react';
import type { AuthSessionUser } from '@sdd-telemetry/api';

interface AuthContextValue {
  user: AuthSessionUser;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthGate');
  }
  return context;
}
