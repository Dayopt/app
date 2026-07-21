// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(() => 'event-server'),
  flush: vi.fn(async () => true),
  setTags: vi.fn(),
  startNewTrace: vi.fn((callback: () => unknown) => callback()),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
  withScope: vi.fn((callback: (scope: { setTags: typeof sentry.setTags }) => unknown) =>
    callback({ setTags: sentry.setTags }),
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ ...sentry }));

import { captureWebOperatorServerSmoke } from './operator-smoke-capture';

describe('captureWebOperatorServerSmoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captures one scoped error in an isolated trace and flushes before responding', async () => {
    const response = await captureWebOperatorServerSmoke();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      eventId: 'event-server',
      flushed: true,
      runtime: 'server',
    });
    expect(sentry.startNewTrace).toHaveBeenCalledOnce();
    expect(sentry.startSpan).toHaveBeenCalledWith(
      {
        name: 'operator.sentry_smoke.server',
        op: 'test.observability',
        forceTransaction: true,
      },
      expect.any(Function),
    );
    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'observability',
      operation: 'operator_sentry_smoke_server',
      route: '/api/v1/system/sentry-smoke/server',
      runtime: 'server',
    });
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.flush).toHaveBeenCalledWith(5_000);
  });

  it('returns 503 without an event body when flushing fails', async () => {
    sentry.flush.mockResolvedValueOnce(false);

    const response = await captureWebOperatorServerSmoke();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
  });
});
