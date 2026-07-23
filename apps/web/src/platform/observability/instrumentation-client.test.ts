// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BROWSER_TELEMETRY_CONSENT_EVENT,
  BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
} from '@dayopt/observability';

const sentry = vi.hoisted(() => ({
  browserTracingIntegration: vi.fn(() => ({ name: 'browser-tracing' })),
  captureRouterTransitionStart: vi.fn(),
  getClient: vi.fn(() => ({ getOptions: () => sentry.clientOptions })),
  init: vi.fn(),
  clientOptions: { enabled: true },
}));

vi.mock('@sentry/nextjs', () => ({ ...sentry }));

function consentDetail(analytics: boolean) {
  return { necessary: true, analytics, marketing: false, timestamp: 1 } as const;
}

function persistAndNotify(analytics: boolean): void {
  const consent = consentDetail(analytics);
  localStorage.setItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: consent }));
}

describe('Web browser Sentry consent lifecycle', () => {
  let reloadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sentry.clientOptions.enabled = true;
    localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete window.__DAYOPT_WEB_SENTRY_SMOKE__;
    reloadSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('stays off before consent and initializes once for each grant lifecycle', async () => {
    await import('../../../instrumentation-client');
    expect(sentry.init).not.toHaveBeenCalled();

    persistAndNotify(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0]?.[0];
    expect(options?.integrations).toEqual([{ name: 'browser-tracing' }]);
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    const tracesSampler = options?.tracesSampler as (context: {
      name: string;
      inheritOrSampleWith: (sampleRate: number) => number;
    }) => number;
    expect(
      tracesSampler({
        name: 'operator.sentry_smoke.browser',
        inheritOrSampleWith: (sampleRate) => sampleRate,
      }),
    ).toBe(1);
    expect(
      tracesSampler({
        name: 'GET /[locale]',
        inheritOrSampleWith: (sampleRate) => sampleRate,
      }),
    ).toBe(0.1);
    expect(window.__DAYOPT_WEB_SENTRY_SMOKE__).toBeTypeOf('function');

    persistAndNotify(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);

    persistAndNotify(false);
    expect(sentry.clientOptions.enabled).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(window.__DAYOPT_WEB_SENTRY_SMOKE__).toBeUndefined();

    persistAndNotify(true);
    expect(sentry.clientOptions.enabled).toBe(false);
    expect(sentry.init).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: null }));
    expect(sentry.clientOptions.enabled).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('disables telemetry when another tab refuses or clears consent', async () => {
    await import('../../../instrumentation-client');
    persistAndNotify(true);

    localStorage.setItem(
      BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
      JSON.stringify(consentDetail(false)),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: BROWSER_TELEMETRY_CONSENT_STORAGE_KEY }),
    );
    expect(sentry.clientOptions.enabled).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(sentry.clientOptions.enabled).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not initialize in Preview even with stored consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    localStorage.setItem(
      BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
      JSON.stringify(consentDetail(true)),
    );

    await import('../../../instrumentation-client');

    expect(sentry.init).not.toHaveBeenCalled();
    expect(window.__DAYOPT_WEB_SENTRY_SMOKE__).toBeUndefined();
  });

  it('disables Zod JIT before application schemas can probe eval support', async () => {
    const { util } = await import('zod/v4/core');
    const allowsEvalBefore = Object.getOwnPropertyDescriptor(util.allowsEval, 'value');
    expect(allowsEvalBefore?.get).toBeTypeOf('function');

    await import('../../../instrumentation-client');
    const { config, z } = await import('zod');
    const schema = z.object({ value: z.string() });

    expect(schema.safeParse({ value: 'ok' }).success).toBe(true);
    expect(config().jitless).toBe(true);
    expect(Object.getOwnPropertyDescriptor(util.allowsEval, 'value')?.get).toBe(
      allowsEvalBefore?.get,
    );
  });
});
