// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(() => 'event-browser'),
  flush: vi.fn(async () => true),
  setTags: vi.fn(),
  startNewTrace: vi.fn((callback: () => unknown) => callback()),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
  withScope: vi.fn((callback: (scope: { setTags: typeof sentry.setTags }) => unknown) =>
    callback({ setTags: sentry.setTags }),
  ),
}));

vi.mock('@sentry/nextjs', () => ({ ...sentry }));

import {
  installWebOperatorSentrySmoke,
  uninstallWebOperatorSentrySmoke,
} from './operator-smoke-client';

const TOKEN = 'A'.repeat(43);

describe('Web operator Sentry smoke client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWebOperatorSentrySmoke();
  });

  afterEach(() => {
    uninstallWebOperatorSentrySmoke();
    vi.unstubAllGlobals();
  });

  it('authorizes then captures and flushes the browser smoke once', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      window.__DAYOPT_WEB_SENTRY_SMOKE__?.({ token: TOKEN, surface: 'browser' }),
    ).resolves.toEqual({
      ok: true,
      surface: 'browser',
      eventId: 'event-browser',
      flushed: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.flush).toHaveBeenCalledWith(5_000);
  });

  it('returns the validated server response without client-side capture', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { eventId: 'event-server', flushed: true, runtime: 'server' },
          { status: 202 },
        ),
      ),
    );

    await expect(
      window.__DAYOPT_WEB_SENTRY_SMOKE__?.({ token: TOKEN, surface: 'server' }),
    ).resolves.toEqual({
      ok: true,
      surface: 'server',
      eventId: 'event-server',
      flushed: true,
      runtime: 'server',
    });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('rejects malformed input without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      window.__DAYOPT_WEB_SENTRY_SMOKE__?.({ token: 'short', surface: 'browser' }),
    ).resolves.toEqual({ ok: false, surface: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
