import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestData } from './client';

beforeEach(() => { vi.restoreAllMocks(); });

describe('requestData', () => {
  it('returns data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { count: 3 }, requestId: 'r1', timestamp: 't' }),
    }));
    const result = await requestData<{ count: number }>('/api/test');
    expect(result).toEqual({ count: 3 });
  });

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { code: 'BAD_REQUEST', message: 'invalid' }, requestId: 'r1', timestamp: 't' }),
    }));
    await expect(requestData('/api/test')).rejects.toThrow('invalid');
  });

  it('throws HTTP status when no error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, requestId: 'r1', timestamp: 't' }),
    }));
    await expect(requestData('/api/test')).rejects.toThrow('HTTP 500');
  });
});
