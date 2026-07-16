import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyWebhook = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    webhooks = { verify: verifyWebhook };
  },
}));
vi.mock('@/env', () => ({
  env: { RESEND_API_KEY: 'test-key', RESEND_WEBHOOK_SECRET: 'test-secret' },
}));
vi.mock('@/lib/logger', () => ({ logger }));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
}));
vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));

import { POST } from './route';

function request() {
  return new NextRequest('https://app.dayopt.com/api/webhooks/resend', {
    method: 'POST',
    body: '{}',
    headers: {
      'svix-id': 'event-1',
      'svix-timestamp': '123',
      'svix-signature': 'signature',
    },
  });
}

describe('Resend webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  it('bounceをschemaの複合unique keyでupsertする', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    createServiceRoleClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    verifyWebhook.mockReturnValue({
      type: 'email.bounced',
      data: { to: ['private@example.com'], email_id: 'email-1' },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        email: 'private@example.com',
        reason: 'bounce',
        source_event_id: 'email-1',
      },
      { onConflict: 'email,reason' },
    );
    expect(JSON.stringify(logger)).not.toContain('private@example.com');
  });

  it('suppression DB障害は500でcaptureし、addressをcontext/logへ含めない', async () => {
    const dbError = { code: 'PGRST500', message: 'database unavailable' };
    const upsert = vi.fn().mockResolvedValue({ error: dbError });
    createServiceRoleClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    verifyWebhook.mockReturnValue({
      type: 'email.complained',
      data: { to: ['private@example.com'], email_id: 'email-2' },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'email',
      operation: 'record_email_suppression',
      route: '/api/webhooks/resend',
      requestId: 'email-2',
    });
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(JSON.stringify([...logger.error.mock.calls, ...logger.warn.mock.calls])).not.toContain(
      'private@example.com',
    );
  });
});
