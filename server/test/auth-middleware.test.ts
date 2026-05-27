import { describe, expect, it } from 'vitest';
import {
  requiresAuthentication,
  requiresSuperAdmin,
} from '../src/common/auth/auth.middleware';

describe('auth route policy', () => {
  it('keeps login, liveness and OTLP ingestion public', () => {
    expect(requiresAuthentication('POST', '/api/auth/login')).toBe(false);
    expect(requiresAuthentication('GET', '/api/healthz')).toBe(false);
    expect(requiresAuthentication('POST', '/api/ingest/otlp-logs')).toBe(false);
  });

  it('requires login and administrator privileges for sensitive paths', () => {
    expect(requiresAuthentication('GET', '/api/sdd/users')).toBe(true);
    expect(requiresSuperAdmin('GET', '/api/ops/tables')).toBe(true);
    expect(requiresSuperAdmin('POST', '/api/sdd/semantics')).toBe(true);
    expect(requiresSuperAdmin('GET', '/api/sdd/semantics')).toBe(false);
  });
});
