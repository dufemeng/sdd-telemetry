const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4318';

export async function requestJson<TData>(path: string): Promise<TData> {
  const response = await fetch(new URL(path, API_BASE_URL));

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return (await response.json()) as TData;
}
