import { describe, expect, it } from 'vitest';

import { getSafeRedirectPath } from './safe-redirect';

describe('getSafeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    expect(getSafeRedirectPath('/week?date=2026-07-06&panel=review')).toBe(
      '/week?date=2026-07-06&panel=review',
    );
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(getSafeRedirectPath('https://evil.example')).toBe('/week');
    expect(getSafeRedirectPath('//evil.example/path')).toBe('/week');
    expect(getSafeRedirectPath('/%2F%2Fevil.example/path')).toBe('/week');
  });

  it('rejects raw and encoded backslash redirects', () => {
    expect(getSafeRedirectPath('/\\evil.example/path')).toBe('/week');
    expect(getSafeRedirectPath('/%5C%5Cevil.example/path')).toBe('/week');
    expect(getSafeRedirectPath('/%5cevil.example/path')).toBe('/week');
  });

  it('rejects decoded scheme payloads', () => {
    expect(getSafeRedirectPath('/https%3A%2F%2Fevil.example')).toBe('/week');
  });
});
