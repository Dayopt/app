import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimResendWebhookEvent: vi.fn(),
  completeResendWebhookEvent: vi.fn(),
  captureUnexpectedWebError: vi.fn(),
  env: { RESEND_WEBHOOK_SECRET: 'web-secret' as string | undefined },
  releaseResendWebhookEvent: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    webhooks = { verify: mocks.verify };
  },
}));
vi.mock('@web/platform/config/env', () => ({ env: mocks.env }));
vi.mock('@web/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError: mocks.captureUnexpectedWebError,
}));
vi.mock('@web/platform/security/resend-webhook-dedup', () => ({
  claimResendWebhookEvent: mocks.claimResendWebhookEvent,
  completeResendWebhookEvent: mocks.completeResendWebhookEvent,
  releaseResendWebhookEvent: mocks.releaseResendWebhookEvent,
}));

import { POST } from './route';

function request(body = '{}'): NextRequest {
  return new NextRequest('https://dayopt.app/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: {
      'svix-id': 'event-1',
      'svix-timestamp': '123',
      'svix-signature': 'signature',
    },
  });
}

function contactFailure(type = 'email.failed') {
  return {
    type,
    data: {
      to: ['support@dayopt.app'],
      email_id: 'contact-email-1',
      tags: { source: 'contact-web', category: 'question' },
    },
  };
}

describe('Web Resend webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.RESEND_WEBHOOK_SECRET = 'web-secret';
    mocks.claimResendWebhookEvent.mockResolvedValue({ status: 'claimed', token: 'lease-1' });
    mocks.completeResendWebhookEvent.mockResolvedValue(undefined);
    mocks.releaseResendWebhookEvent.mockResolvedValue(undefined);
    mocks.captureUnexpectedWebError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected Web failure'),
    );
  });

  it.each(['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'] as const)(
    'captures a Web contact %s event without PII',
    async (type) => {
      mocks.verify.mockReturnValue(contactFailure(type));

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
      expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(expect.any(Error), {
        feature: 'contact',
        operation: 'email_delivery_status',
        route: '/api/webhooks/resend',
        source: 'resend_webhook',
        requestId: 'contact-email-1',
      });
      expect(JSON.stringify(mocks.captureUnexpectedWebError.mock.calls)).not.toContain(
        'support@dayopt.app',
      );
      expect(mocks.completeResendWebhookEvent.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.captureUnexpectedWebError.mock.invocationCallOrder[0]!,
      );
    },
  );

  it('ignores Product, unrelated recipient, and non-failure events', async () => {
    mocks.verify.mockReturnValueOnce({
      ...contactFailure(),
      data: { ...contactFailure().data, tags: { source: 'contact-product' } },
    });
    expect((await POST(request())).status).toBe(200);

    mocks.verify.mockReturnValueOnce({
      ...contactFailure(),
      data: { ...contactFailure().data, to: ['other@example.com'] },
    });
    expect((await POST(request())).status).toBe(200);

    mocks.verify.mockReturnValueOnce(contactFailure('email.delivered'));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.claimResendWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it('acknowledges completed duplicates and retries in-progress events', async () => {
    mocks.verify.mockReturnValue(contactFailure());
    mocks.claimResendWebhookEvent.mockResolvedValueOnce({ status: 'already_processed' });
    expect((await POST(request())).status).toBe(200);

    mocks.claimResendWebhookEvent.mockResolvedValueOnce({ status: 'in_progress' });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
    expect(mocks.completeResendWebhookEvent).not.toHaveBeenCalled();
  });

  it('retries a terminal-marker failure without duplicating the delivery Issue', async () => {
    mocks.verify.mockReturnValue(contactFailure());
    mocks.completeResendWebhookEvent
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce(undefined);

    expect((await POST(request())).status).toBe(500);
    expect(mocks.releaseResendWebhookEvent).toHaveBeenCalledWith('event-1', 'lease-1');
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Redis unavailable' }),
      {
        feature: 'contact',
        operation: 'process_resend_webhook',
        route: '/api/webhooks/resend',
        source: 'resend_webhook',
      },
    );

    const deliveryCapturesAfterFailure = mocks.captureUnexpectedWebError.mock.calls.filter(
      ([, context]) => context.operation === 'email_delivery_status',
    );
    expect(deliveryCapturesAfterFailure).toHaveLength(0);

    expect((await POST(request())).status).toBe(200);
    const deliveryCapturesAfterRetry = mocks.captureUnexpectedWebError.mock.calls.filter(
      ([, context]) => context.operation === 'email_delivery_status',
    );
    expect(deliveryCapturesAfterRetry).toHaveLength(1);
  });

  it('captures lease release failures without request data', async () => {
    mocks.verify.mockReturnValue(contactFailure());
    mocks.completeResendWebhookEvent.mockRejectedValue(new Error('complete failed'));
    mocks.releaseResendWebhookEvent.mockRejectedValue(new Error('release failed'));

    expect((await POST(request())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'release failed' }),
      {
        feature: 'contact',
        operation: 'release_resend_webhook',
        route: '/api/webhooks/resend',
        source: 'upstash',
      },
    );
  });

  it('rejects missing or invalid signatures and oversized bodies without capture', async () => {
    const missingHeaders = new NextRequest('https://dayopt.app/api/webhooks/resend', {
      method: 'POST',
      body: '{}',
    });
    expect((await POST(missingHeaders)).status).toBe(401);

    mocks.verify.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    expect((await POST(request())).status).toBe(401);

    const oversized = request('x');
    oversized.headers.set('content-length', String(64 * 1024 + 1));
    expect((await POST(oversized)).status).toBe(413);
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it('fails closed and reports only technical context when the Web secret is absent', async () => {
    mocks.env.RESEND_WEBHOOK_SECRET = undefined;
    expect((await POST(request())).status).toBe(500);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(expect.any(Error), {
      feature: 'contact',
      operation: 'resend_webhook_configuration',
      route: '/api/webhooks/resend',
      source: 'resend_webhook',
    });
  });
});
