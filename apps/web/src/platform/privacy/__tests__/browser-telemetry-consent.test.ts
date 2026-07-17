import { BROWSER_TELEMETRY_CONSENT_STORAGE_KEY } from '@dayopt/observability';
import { describe, expect, it, vi } from 'vitest';

import {
  needsBrowserTelemetryConsent,
  persistBrowserTelemetryConsent,
} from '../browser-telemetry-consent';

describe('browser telemetry consent', () => {
  it('persists analytics consent with the existing storage shape and notifies listeners', () => {
    const stored = new Map<string, string>();
    const notify = vi.fn();

    persistBrowserTelemetryConsent(true, {
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
      now: () => 1234,
      notify,
    });

    const value = stored.get(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
    expect(value).toBeDefined();
    expect(JSON.parse(value!)).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
      timestamp: 1234,
    });
    expect(notify).toHaveBeenCalledWith({
      necessary: true,
      analytics: true,
      marketing: false,
      timestamp: 1234,
    });
  });

  it('treats a necessary-only choice as a completed decision', () => {
    const value = JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: 1234,
    });

    expect(needsBrowserTelemetryConsent({ getItem: () => value })).toBe(false);
  });

  it('asks again when the stored value is missing or invalid', () => {
    expect(needsBrowserTelemetryConsent({ getItem: () => null })).toBe(true);
    expect(needsBrowserTelemetryConsent({ getItem: () => '{invalid' })).toBe(true);
  });
});
