import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';

export function AdminOnly() {
  const { user } = useAuth();
  return user.role === 'super_admin' ? <Outlet /> : <Navigate to="/" replace />;
}
