import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureUnexpectedWebError: vi.fn(),
  contactGlobalRateLimit: { limit: vi.fn() },
  contactRateLimit: { limit: vi.fn() },
  getClientIp: vi.fn(() => '127.0.0.1'),
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-client-ip'),
  sendContactEmail: vi.fn(),
  verifyCsrfToken: vi.fn(() => true),
  verifyTurnstile: vi.fn(),
}));

vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock('@/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError: mocks.captureUnexpectedWebError,
}));
vi.mock('@/platform/security/csrf-protection', () => ({
  verifyCsrfToken: mocks.verifyCsrfToken,
}));
vi.mock('@/platform/security/rate-limit', () => ({
  contactGlobalRateLimit: mocks.contactGlobalRateLimit,
  contactRateLimit: mocks.contactRateLimit,
  getClientIp: mocks.getClientIp,
  hashRateLimitIdentifier: mocks.hashRateLimitIdentifier,
}));
vi.mock('./contact-email', () => ({ sendContactEmail: mocks.sendContactEmail }));

import { POST } from './route';

const validBody = {
  submissionId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Private Name',
  email: 'private@example.com',
  category: 'question',
  message: 'This is a private contact message.',
  website: '',
  turnstileToken: 'turnstile-token',
};

function contactRequest(
  body: unknown = validBody,
  headers: HeadersInit = { 'content-type': 'application/json' },
): NextRequest {
  return new NextRequest('https://dayopt.app/api/contact', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function streamingContactRequest(chunks: Uint8Array[]): NextRequest {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
  type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
  const init = {
    method: 'POST',
    body,
    duplex: 'half',
    headers: { 'content-type': 'application/json' },
  } satisfies NextRequestInit & { duplex: 'half' };
  return new NextRequest('https://dayopt.app/api/contact', init);
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCsrfToken.mockReturnValue(true);
    mocks.contactGlobalRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 60_000,
    });
    mocks.contactRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
    });
    mocks.verifyTurnstile.mockResolvedValue({ success: true });
    mocks.sendContactEmail.mockResolvedValue(undefined);
    mocks.captureUnexpectedWebError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected Web failure'),
    );
  });

  it('returns expected client rejections without delivery or Sentry Issues', async () => {
    mocks.verifyCsrfToken.mockReturnValueOnce(false);
    expect((await POST(contactRequest())).status).toBe(403);

    expect((await POST(contactRequest(validBody, { 'content-type': 'text/plain' }))).status).toBe(
      415,
    );

    mocks.contactRateLimit.limit.mockResolvedValueOnce({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    expect((await POST(contactRequest())).status).toBe(429);

    expect((await POST(contactRequest('{invalid-json'))).status).toBe(400);
    expect(
      (await POST(contactRequest({ ...validBody, category: 'private-category' }))).status,
    ).toBe(400);
    expect((await POST(contactRequest({ ...validBody, extra: 'not-allowed' }))).status).toBe(400);
    expect(
      (await POST(contactRequest({ ...validBody, email: 'a@example.com,b@example.com' }))).status,
    ).toBe(400);
    expect((await POST(contactRequest({ ...validBody, submissionId: 'not-a-uuid' }))).status).toBe(
      400,
    );

    expect((await POST(contactRequest({ ...validBody, website: 'bot-value' }))).status).toBe(200);

    mocks.verifyTurnstile.mockResolvedValueOnce({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
    const botResponse = await POST(contactRequest());
    expect(botResponse.status).toBe(403);
    expect(JSON.stringify(await botResponse.json())).not.toContain('invalid-input-response');

    expect(mocks.sendContactEmail).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it('consumes the global quota only after schema and bot verification', async () => {
    mocks.contactGlobalRateLimit.limit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(contactRequest());

    expect(response.status).toBe(429);
    expect(mocks.contactRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
    expect(mocks.verifyTurnstile).toHaveBeenCalledOnce();
    expect(mocks.contactGlobalRateLimit.limit).toHaveBeenCalledWith('global');
    expect(mocks.sendContactEmail).not.toHaveBeenCalled();
  });

  it('rejects declared and streamed oversized request bodies', async () => {
    const declared = contactRequest();
    declared.headers.set('content-length', String(16 * 1024 + 1));
    expect((await POST(declared)).status).toBe(413);

    const streamed = streamingContactRequest([new Uint8Array(10 * 1024), new Uint8Array(7 * 1024)]);
    expect((await POST(streamed)).status).toBe(413);
    expect(mocks.sendContactEmail).not.toHaveBeenCalled();
  });

  it('captures a rate-limit backend failure once and returns 503', async () => {
    const original = new Error('redis unavailable');
    mocks.contactRateLimit.limit.mockRejectedValueOnce(original);

    const response = await POST(
      contactRequest(validBody, {
        'content-type': 'application/json',
        'x-vercel-id': 'iad1::contact-123',
      }),
    );
    expect(response.status).toBe(503);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'rate_limit',
      route: '/api/contact',
      requestId: 'iad1::contact-123',
    });
  });

  it('captures a global quota backend failure after bot verification and returns 503', async () => {
    const original = new Error('redis unavailable');
    mocks.contactGlobalRateLimit.limit.mockRejectedValueOnce(original);

    expect((await POST(contactRequest())).status).toBe(503);
    expect(mocks.verifyTurnstile).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'global_rate_limit',
      route: '/api/contact',
    });
    expect(mocks.sendContactEmail).not.toHaveBeenCalled();
  });

  it('captures a Turnstile transport failure once', async () => {
    const original = new TypeError('fetch failed');
    mocks.verifyTurnstile.mockRejectedValueOnce(original);

    expect((await POST(contactRequest())).status).toBe(503);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'verify_turnstile',
      route: '/api/contact',
    });
  });

  it('captures an email delivery failure once without contact PII', async () => {
    const original = new TypeError('fetch failed');
    mocks.sendContactEmail.mockRejectedValueOnce(original);

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'send_contact_email',
      route: '/api/contact',
    });
    const captured = JSON.stringify(mocks.captureUnexpectedWebError.mock.calls);
    expect(captured).not.toContain(validBody.email);
    expect(captured).not.toContain(validBody.message);
    expect(captured).not.toContain(validBody.name);
  });

  it('delivers once and returns only the stable public success contract', async () => {
    const response = await POST(contactRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.sendContactEmail).toHaveBeenCalledWith({
      submissionId: validBody.submissionId,
      name: validBody.name,
      email: validBody.email,
      category: validBody.category,
      message: validBody.message,
    });
    expect(mocks.contactRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
    expect(mocks.contactRateLimit.limit).not.toHaveBeenCalledWith('127.0.0.1');
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
  });
});
