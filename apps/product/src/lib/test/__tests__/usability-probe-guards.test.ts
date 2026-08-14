import { describe, expect, it } from 'vitest';

import { resolveBaseUrlTarget } from '../usability-probe-guards';

describe('resolveBaseUrlTarget', () => {
  it('production app host は opt-in があっても拒否する', () => {
    const result = resolveBaseUrlTarget('https://app.dayopt.app', {
      USABILITY_PROBE_ALLOW_NONLOCAL: '1',
    });
    expect(result.safe).toBe(false);
  });

  it('localhost は既定で許可する', () => {
    expect(resolveBaseUrlTarget('http://localhost:3000', {}).safe).toBe(true);
  });

  it('127.0.0.1 は既定で許可する', () => {
    expect(resolveBaseUrlTarget('http://127.0.0.1:3000', {}).safe).toBe(true);
  });

  it('Vercel preview host は既定で許可する', () => {
    expect(
      resolveBaseUrlTarget('https://product-git-claude-feature-dayopt.vercel.app', {}).safe,
    ).toBe(true);
  });

  it('allowlist に無い host は opt-in 無しで拒否する', () => {
    const result = resolveBaseUrlTarget('https://example.com', {});
    expect(result.safe).toBe(false);
  });

  it('allowlist に無い host も USABILITY_PROBE_ALLOW_NONLOCAL=1 で許可する', () => {
    const result = resolveBaseUrlTarget('https://example.com', {
      USABILITY_PROBE_ALLOW_NONLOCAL: '1',
    });
    expect(result.safe).toBe(true);
  });

  it('不正な URL は拒否する', () => {
    const result = resolveBaseUrlTarget('not-a-url', {});
    expect(result.safe).toBe(false);
  });
});
