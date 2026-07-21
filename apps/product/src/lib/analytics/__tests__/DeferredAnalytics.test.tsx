import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BROWSER_TELEMETRY_CONSENT_EVENT,
  BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
} from '@dayopt/observability';

const dynamicState = vi.hoisted(() => ({ callCount: 0 }));

vi.mock('next/dynamic', () => ({
  default: () => {
    const testId = dynamicState.callCount++ === 0 ? 'analytics' : 'speed-insights';
    return function MockDynamicComponent() {
      return <div data-testid={testId} />;
    };
  },
}));

import { DeferredAnalytics } from '../DeferredAnalytics';

function consentDetail(analytics: boolean) {
  return { necessary: true, analytics, marketing: false, timestamp: 1 } as const;
}

function persistAndNotify(analytics: boolean): void {
  const consent = consentDetail(analytics);
  localStorage.setItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: consent }));
}

describe('DeferredAnalytics consent gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
  });

  it('loads only after consent, unloads on revoke, and ignores malformed events', async () => {
    render(<DeferredAnalytics />);

    await vi.runAllTimersAsync();
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('speed-insights')).not.toBeInTheDocument();

    await act(async () => {
      persistAndNotify(true);
      await vi.runAllTimersAsync();
    });
    expect(screen.getByTestId('analytics')).toBeInTheDocument();
    expect(screen.getByTestId('speed-insights')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: { analytics: false } }),
      );
    });
    expect(screen.getByTestId('analytics')).toBeInTheDocument();

    act(() => {
      persistAndNotify(false);
    });
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();

    localStorage.setItem(
      BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
      JSON.stringify(consentDetail(true)),
    );
  });

  it('unmounts analytics when consent is reset', async () => {
    render(<DeferredAnalytics />);

    await act(async () => {
      persistAndNotify(true);
      await vi.runAllTimersAsync();
    });
    expect(screen.getByTestId('analytics')).toBeInTheDocument();

    act(() => {
      localStorage.removeItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: null }));
    });
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();
  });

  it('unmounts analytics after another tab refuses consent', async () => {
    render(<DeferredAnalytics />);

    await act(async () => {
      persistAndNotify(true);
      await vi.runAllTimersAsync();
    });
    expect(screen.getByTestId('analytics')).toBeInTheDocument();

    act(() => {
      localStorage.setItem(
        BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
        JSON.stringify(consentDetail(false)),
      );
      window.dispatchEvent(
        new StorageEvent('storage', { key: BROWSER_TELEMETRY_CONSENT_STORAGE_KEY }),
      );
    });
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();
  });

  it('treats inaccessible browser storage as no consent', async () => {
    const storageSpy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    render(<DeferredAnalytics />);
    await vi.runAllTimersAsync();

    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();
    storageSpy.mockRestore();
  });

  it('does not load in Preview even with stored consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    localStorage.setItem(
      BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
      JSON.stringify(consentDetail(true)),
    );

    render(<DeferredAnalytics />);
    await vi.runAllTimersAsync();

    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('speed-insights')).not.toBeInTheDocument();
  });
});
