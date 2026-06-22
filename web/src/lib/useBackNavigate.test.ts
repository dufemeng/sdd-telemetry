// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// 直接 mock react-router-dom，控制 navigate 行为和 location.key
const navigateMock = vi.fn();
let locationKey = 'default';
let referrerValue = '';
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ key: locationKey }),
}));

const { useBackNavigate } = await import('./useBackNavigate');

describe('useBackNavigate', () => {
  afterEach(() => {
    navigateMock.mockClear();
    locationKey = 'default';
    referrerValue = '';
    vi.restoreAllMocks();
  });

  it('navigate(-1) when app history exists', () => {
    locationKey = 'abc123';
    const { result } = renderHook(() => useBackNavigate('/fallback'));
    result.current();
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('falls back to given path when no app history and no same-origin referrer', () => {
    locationKey = 'default';
    referrerValue = '';
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    const { result } = renderHook(() => useBackNavigate('/sdd/work-items'));
    result.current();
    expect(navigateMock).toHaveBeenCalledWith('/sdd/work-items');
  });

  it('navigate(-1) when same-origin referrer exists even without app history', () => {
    locationKey = 'default';
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(window.location.origin + '/sdd/users');
    const { result } = renderHook(() => useBackNavigate('/fallback'));
    result.current();
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('falls back when referrer is cross-origin', () => {
    locationKey = 'default';
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://evil.example.com/x');
    const { result } = renderHook(() => useBackNavigate('/sdd/work-items'));
    result.current();
    expect(navigateMock).toHaveBeenCalledWith('/sdd/work-items');
  });
});
