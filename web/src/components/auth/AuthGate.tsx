import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AuthSessionUser } from '@sdd-telemetry/api';
import { ApiRequestError, AUTH_UNAUTHORIZED_EVENT, requestData } from '@/api/client';
import { AuthContext } from './useAuth';

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthGate() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: () => requestData<AuthSessionUser>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [queryClient]);

  if (query.isPending) {
    return (
      <div className="grid h-screen place-items-center text-[13px] text-[var(--color-muted)]">
        正在验证登录状态…
      </div>
    );
  }

  if (query.error instanceof ApiRequestError && query.error.status === 401) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!query.data) {
    return (
      <div className="grid h-screen place-items-center text-[13px] text-[var(--color-bad-text)]">
        登录状态验证失败，请刷新重试
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: query.data }}>
      <Outlet />
    </AuthContext.Provider>
  );
}
