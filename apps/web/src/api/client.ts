const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
  requestId: string;
  timestamp: string;
}

export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const url = BASE ? new URL(path, BASE).toString() : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body.data;
}
