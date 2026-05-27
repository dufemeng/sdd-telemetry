import type { ApiResponse } from '@sdd-telemetry/api';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
export const AUTH_UNAUTHORIZED_EVENT = 'sdd-auth-unauthorized';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const url = BASE ? new URL(path, BASE).toString() : path;
  const res = await fetch(url, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    const message = !body.success && body.error?.message ? body.error.message : `HTTP ${res.status}`;
    const code = !body.success && body.error?.code ? body.error.code : 'HTTP_ERROR';
    if (
      res.status === 401 &&
      path !== '/api/auth/login' &&
      path !== '/api/auth/me' &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
    throw new ApiRequestError(res.status, code, message);
  }
  return body.data;
}
