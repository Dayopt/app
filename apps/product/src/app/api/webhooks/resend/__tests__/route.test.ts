import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  createServiceRoleClient: vi.fn(),
  captureUnexpectedDatabaseError: vi.fn(),
  captureUnexpectedError: vi.fn(),
  claimResendWebhookEvent: vi.fn(),
  completeResendWebhookEvent: vi.fn(),
  releaseResendWebhookEvent: vi.fn(),
  env: {
    RESEND_API_KEY: 'test-key' as string | undefined,
    RESEND_WEBHOOK_SECRET: 'test-secret' as string | undefined,
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    webhooks = { verify: mocks.verifyWebhook };
  },
}));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));
vi.mock('@/lib/rate-limit/upstash', () => ({
  claimResendWebhookEvent: mocks.claimResendWebhookEvent,
  completeResendWebhookEvent: mocks.completeResendWebhookEvent,
  releaseResendWebhookEvent: mocks.releaseResendWebhookEvent,
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: mocks.captureUnexpectedDatabaseError,
  captureUnexpectedError: mocks.captureUnexpectedError,
}));
vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { POST } from '../route';

function request(body = '{}'): NextRequest {
  return new NextRequest('https://app.dayopt.app/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: {
      'svix-id': 'event-1',
      'svix-timestamp': '123',
      'svix-signature': 'signature',
    },
  });
}

describe('Product Resend webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.RESEND_WEBHOOK_SECRET = 'test-secret';
    mocks.claimResendWebhookEvent.mockResolvedValue({ status: 'claimed', token: 'lease-1' });
    mocks.completeResendWebhookEvent.mockResolvedValue(undefined);
    mocks.releaseResendWebhookEvent.mockResolvedValue(undefined);
    mocks.captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  it('records transactional bounce suppression with the schema unique key', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    mocks.verifyWebhook.mockReturnValue({
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
    expect(JSON.stringify(mocks.logger)).not.toContain('private@example.com');
    expect(mocks.completeResendWebhookEvent).toHaveBeenCalledWith('event-1', 'lease-1');
  });

  it('captures a suppression DB failure once without address PII and releases the lease', async () => {
    const dbError = { code: 'PGRST500', message: 'database unavailable' };
    const upsert = vi.fn().mockResolvedValue({ error: dbError });
    mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.complained',
      data: { to: ['private@example.com'], email_id: 'email-2' },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'email',
      operation: 'record_email_suppression',
      route: '/api/webhooks/resend',
      requestId: 'email-2',
    });
    expect(mocks.captureUnexpectedError).not.toHaveBeenCalled();
    expect(mocks.releaseResendWebhookEvent).toHaveBeenCalledWith('event-1', 'lease-1');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('private@example.com');
  });

  it.each(['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'] as const)(
    'captures Product contact %s without adding support to suppression',
    async (type) => {
      const upsert = vi.fn();
      mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
      mocks.verifyWebhook.mockReturnValue({
        type,
        data: {
          to: ['support@dayopt.app'],
          email_id: 'contact-email-1',
          tags: { source: 'contact-product', category: 'question' },
        },
      });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(upsert).not.toHaveBeenCalled();
      expect(mocks.captureUnexpectedError).toHaveBeenCalledWith(expect.any(Error), {
        feature: 'contact',
        operation: 'email_delivery_status',
        route: '/api/webhooks/resend',
        source: 'resend_webhook',
        requestId: 'contact-email-1',
      });
      expect(JSON.stringify(mocks.captureUnexpectedError.mock.calls)).not.toContain(
        'support@dayopt.app',
      );
      expect(mocks.completeResendWebhookEvent.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.captureUnexpectedError.mock.invocationCallOrder[0]!,
      );
    },
  );

  it('retries a contact terminal-marker failure without duplicating the delivery Issue', async () => {
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.failed',
      data: {
        to: ['support@dayopt.app'],
        email_id: 'contact-email-retry',
        tags: { source: 'contact-product' },
      },
    });
    mocks.completeResendWebhookEvent
      .mockRejectedValueOnce(new Error('complete failed'))
      .mockResolvedValueOnce(undefined);

    expect((await POST(request())).status).toBe(500);
    expect(mocks.releaseResendWebhookEvent).toHaveBeenCalledWith('event-1', 'lease-1');
    const deliveryCapturesAfterFailure = mocks.captureUnexpectedError.mock.calls.filter(
      ([, context]) => context.operation === 'email_delivery_status',
    );
    expect(deliveryCapturesAfterFailure).toHaveLength(0);

    expect((await POST(request())).status).toBe(200);
    const deliveryCapturesAfterRetry = mocks.captureUnexpectedError.mock.calls.filter(
      ([, context]) => context.operation === 'email_delivery_status',
    );
    expect(deliveryCapturesAfterRetry).toHaveLength(1);
  });

  it('leaves Web contact events to the Web-specific endpoint', async () => {
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.bounced',
      data: {
        to: ['support@dayopt.app'],
        email_id: 'web-contact-email-1',
        tags: { source: 'contact-web' },
      },
    });

    expect((await POST(request())).status).toBe(200);
    expect(mocks.claimResendWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('acknowledges completed duplicates and returns 503 for an active lease', async () => {
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.delivered',
      data: { to: ['private@example.com'], email_id: 'email-duplicate' },
    });
    mocks.claimResendWebhookEvent.mockResolvedValueOnce({ status: 'already_processed' });
    expect((await POST(request())).status).toBe(200);

    mocks.claimResendWebhookEvent.mockResolvedValueOnce({ status: 'in_progress' });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.completeResendWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects missing/invalid signatures and oversized bodies before side effects', async () => {
    const missingHeaders = new NextRequest('https://app.dayopt.app/api/webhooks/resend', {
      method: 'POST',
      body: '{}',
    });
    expect((await POST(missingHeaders)).status).toBe(401);

    mocks.verifyWebhook.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    expect((await POST(request())).status).toBe(401);

    const oversized = request('x');
    oversized.headers.set('content-length', String(64 * 1024 + 1));
    expect((await POST(oversized)).status).toBe(413);
    expect(mocks.claimResendWebhookEvent).not.toHaveBeenCalled();
  });

  it('fails closed when the Product webhook secret is missing', async () => {
    mocks.env.RESEND_WEBHOOK_SECRET = undefined;
    expect((await POST(request())).status).toBe(500);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedError).toHaveBeenCalledWith(expect.any(Error), {
      feature: 'email',
      operation: 'resend_webhook_configuration',
      route: '/api/webhooks/resend',
      source: 'resend_webhook',
    });
  });

  it('reports terminal marker and lease release failures without PII', async () => {
    mocks.verifyWebhook.mockReturnValue({
      type: 'email.delivered',
      data: { to: ['private@example.com'], email_id: 'email-3' },
    });
    mocks.completeResendWebhookEvent.mockRejectedValue(new Error('complete failed'));
    mocks.releaseResendWebhookEvent.mockRejectedValue(new Error('release failed'));

    expect((await POST(request())).status).toBe(500);
    expect(mocks.captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'release failed' }),
      {
        feature: 'email',
        operation: 'resend_webhook_lease_release',
        route: '/api/webhooks/resend',
        source: 'resend_webhook',
      },
    );
    expect(JSON.stringify(mocks.captureUnexpectedError.mock.calls)).not.toContain(
      'private@example.com',
    );
  });
});
