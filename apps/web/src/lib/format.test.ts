import { describe, it, expect } from 'vitest';
import {
  formatInteger,
  formatPercent,
  formatBytes,
  formatTime,
  formatDateTime,
  truncate,
  statusVariant,
} from './format';

describe('formatInteger', () => {
  it('formats zero', () => expect(formatInteger(0)).toBe('0'));
  it('formats null as 0', () => expect(formatInteger(null)).toBe('0'));
  it('formats thousands', () => expect(formatInteger(1234)).toMatch(/1.234/));
});

describe('formatPercent', () => {
  it('formats null as unknown', () => expect(formatPercent(null)).toBe('unknown'));
  it('formats 0.8 as 80%', () => expect(formatPercent(0.8)).toMatch(/80/));
});

describe('formatBytes', () => {
  it('formats bytes', () => expect(formatBytes(512)).toBe('512 B'));
  it('formats KiB', () => expect(formatBytes(2048)).toBe('2.0 KiB'));
  it('formats MiB', () => expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MiB'));
  it('handles null', () => expect(formatBytes(null)).toBe('0 B'));
});

describe('truncate', () => {
  it('returns unknown for null', () => expect(truncate(null)).toBe('unknown'));
  it('truncates long string', () => expect(truncate('a'.repeat(200), 10)).toBe('aaaaaaaaaa...'));
  it('returns string unchanged if short', () => expect(truncate('hi', 10)).toBe('hi'));
});

describe('statusVariant', () => {
  it('maps parsed to good', () => expect(statusVariant('parsed')).toBe('good'));
  it('maps failed_retryable to bad', () => expect(statusVariant('failed_retryable')).toBe('bad'));
  it('maps processing to warn', () => expect(statusVariant('processing')).toBe('warn'));
  it('maps unknown to neutral', () => expect(statusVariant('unknown')).toBe('neutral'));
});
