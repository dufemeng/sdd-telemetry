import type { ApiResponse } from '@sdd-monitor/api';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const url = BASE ? new URL(path, BASE).toString() : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    const message = !body.success && body.error?.message ? body.error.message : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body.data;
}
