import { describe, expect, it } from 'vitest';

import { getSafeRedirectPath } from './safe-redirect';

describe('getSafeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    expect(getSafeRedirectPath('/calendar?date=2026-07-06&view=week')).toBe(
      '/calendar?date=2026-07-06&view=week',
    );
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(getSafeRedirectPath('https://evil.example')).toBe('/calendar');
    expect(getSafeRedirectPath('//evil.example/path')).toBe('/calendar');
    expect(getSafeRedirectPath('/%2F%2Fevil.example/path')).toBe('/calendar');
  });

  it('rejects raw and encoded backslash redirects', () => {
    expect(getSafeRedirectPath('/\\evil.example/path')).toBe('/calendar');
    expect(getSafeRedirectPath('/%5C%5Cevil.example/path')).toBe('/calendar');
    expect(getSafeRedirectPath('/%5cevil.example/path')).toBe('/calendar');
  });

  it('rejects decoded scheme payloads', () => {
    expect(getSafeRedirectPath('/https%3A%2F%2Fevil.example')).toBe('/calendar');
  });
});
