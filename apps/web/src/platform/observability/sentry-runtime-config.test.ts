import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  extraErrorDataIntegration: vi.fn(() => ({ name: 'extra-error-data' })),
  init: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ ...sentry }));
vi.mock('./sentry-sanitizers', () => ({
  sanitizeBreadcrumbEvent: vi.fn(),
  sanitizeErrorEvent: vi.fn(),
  sanitizeSpanEvent: vi.fn(),
  sanitizeTransactionEvent: vi.fn(),
}));

describe('Web server/edge Sentry runtime configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/2');
  });

  it('ProductionだけでNode/Edge clientを初期化する', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    await import('../../../sentry.server.config');
    await import('../../../sentry.edge.config');

    expect(sentry.init).toHaveBeenCalledTimes(2);
    expect(sentry.init).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/2',
        enabled: true,
        environment: 'production',
        sendDefaultPii: false,
      }),
    );
    const serverOptions = sentry.init.mock.calls[0]?.[0];
    const tracesSampler = serverOptions?.tracesSampler as (context: {
      name: string;
      inheritOrSampleWith: (sampleRate: number) => number;
    }) => number;
    expect(
      tracesSampler({
        name: 'GET /api/contact',
        inheritOrSampleWith: (sampleRate) => sampleRate,
      }),
    ).toBe(0.1);
  });

  it.each(['preview', 'development'])('%sでは初期化しない', async (vercelEnv) => {
    vi.stubEnv('VERCEL_ENV', vercelEnv);

    await import('../../../sentry.server.config');
    await import('../../../sentry.edge.config');

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('ProductionでもDSNなしなら初期化しない', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', '');

    await import('../../../sentry.server.config');
    await import('../../../sentry.edge.config');

    expect(sentry.init).not.toHaveBeenCalled();
  });
});
