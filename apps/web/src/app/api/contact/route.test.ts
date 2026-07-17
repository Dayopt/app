import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  captureUnexpectedWebError: vi.fn(),
  contactRateLimit: { limit: vi.fn() },
  env: {
    GITHUB_CONTACT_REPO: 'Dayopt/contact-private' as string | undefined,
    GITHUB_TOKEN: 'github-token' as string | undefined,
  },
  getClientIp: vi.fn(() => '127.0.0.1'),
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-client-ip'),
  verifyCsrfToken: vi.fn(() => true),
  verifyTurnstile: vi.fn(),
}));

vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock('@/platform/config/env', () => ({ env: mocks.env }));
vi.mock('@/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError: mocks.captureUnexpectedWebError,
}));
vi.mock('@/platform/security/csrf-protection', () => ({
  verifyCsrfToken: mocks.verifyCsrfToken,
}));
vi.mock('@/platform/security/rate-limit', () => ({
  contactRateLimit: mocks.contactRateLimit,
  getClientIp: mocks.getClientIp,
  hashRateLimitIdentifier: mocks.hashRateLimitIdentifier,
}));

import { POST } from './route';

const validBody = {
  name: 'Private Name',
  email: 'private@example.com',
  category: 'question',
  message: 'This is a private contact message.',
  website: '',
  turnstileToken: 'turnstile-token',
};

function contactRequest(body: unknown = validBody, headers: HeadersInit = {}): NextRequest {
  return new NextRequest('https://dayopt.app/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.GITHUB_CONTACT_REPO = 'Dayopt/contact-private';
    mocks.env.GITHUB_TOKEN = 'github-token';
    mocks.verifyCsrfToken.mockReturnValue(true);
    mocks.contactRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
    });
    mocks.verifyTurnstile.mockResolvedValue({ success: true });
    mocks.captureUnexpectedWebError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected Web failure'),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'GET'
          ? Response.json({ private: true })
          : Response.json({ number: 123 }, { status: 201 }),
      ),
    );
  });

  it('returns expected rejection outcomes without creating Sentry Issues', async () => {
    mocks.verifyCsrfToken.mockReturnValueOnce(false);
    expect((await POST(contactRequest())).status).toBe(403);

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

    expect((await POST(contactRequest({ ...validBody, website: 'bot-value' }))).status).toBe(200);

    mocks.verifyTurnstile.mockResolvedValueOnce({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
    expect((await POST(contactRequest())).status).toBe(403);

    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
  });

  it('captures a rate-limit backend failure once', async () => {
    const original = new Error('redis unavailable');
    mocks.contactRateLimit.limit.mockRejectedValueOnce(original);

    expect(
      (await POST(contactRequest(validBody, { 'x-vercel-id': 'iad1::contact-123' }))).status,
    ).toBe(503);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'rate_limit',
      route: '/api/contact',
      requestId: 'iad1::contact-123',
    });
    expect(mocks.contactRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
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

  it('captures missing GitHub configuration without contact PII', async () => {
    mocks.env.GITHUB_CONTACT_REPO = undefined;

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    const [error, context] = mocks.captureUnexpectedWebError.mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect(context).toEqual({
      feature: 'contact',
      operation: 'configuration',
      route: '/api/contact',
    });
    expect(JSON.stringify([error, context])).not.toContain(validBody.email);
    expect(JSON.stringify([error, context])).not.toContain(validBody.message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a public repository before sending contact PII', async () => {
    const fetchMock = vi.fn(async () => Response.json({ private: false }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    const [error, context] = mocks.captureUnexpectedWebError.mock.calls[0] ?? [];
    expect(error).toMatchObject({ message: 'GitHub contact repository must be private' });
    expect(context).toMatchObject({ operation: 'verify_github_repository' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(validBody.email);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(validBody.message);
  });

  it('captures a repository verification failure without reading its body', async () => {
    const fetchMock = vi.fn(async () => new Response('private provider body', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    const [error, context] = mocks.captureUnexpectedWebError.mock.calls[0] ?? [];
    expect(error).toMatchObject({
      message: 'GitHub contact repository privacy could not be verified',
    });
    expect(context).toMatchObject({ operation: 'verify_github_repository' });
    expect(JSON.stringify([error, context])).not.toContain('private provider body');
  });

  it('captures the original repository verification network failure once', async () => {
    const original = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(original));

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'verify_github_repository',
      route: '/api/contact',
    });
  });

  it('captures a GitHub issue creation failure once without reading its body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ private: true }))
      .mockResolvedValueOnce(new Response('private provider body', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    const [error, context] = mocks.captureUnexpectedWebError.mock.calls[0] ?? [];
    expect(error).toMatchObject({
      message: 'GitHub contact API returned an unsuccessful response',
    });
    expect(context).toMatchObject({ operation: 'create_github_issue' });
    expect(JSON.stringify([error, context])).not.toContain('private provider body');
  });

  it('captures the original GitHub issue creation network failure once', async () => {
    const original = new TypeError('fetch failed');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ private: true }))
        .mockRejectedValueOnce(original),
    );

    expect((await POST(contactRequest())).status).toBe(500);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'create_github_issue',
      route: '/api/contact',
    });
  });

  it('captures timeout AbortError instead of dropping it', async () => {
    const original = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(original));

    expect((await POST(contactRequest())).status).toBe(504);
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'verify_github_repository',
      route: '/api/contact',
    });
  });

  it('returns the created issue number without capturing normal business activity', async () => {
    const response = await POST(contactRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, issueNumber: 123 });
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/Dayopt/contact-private',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/Dayopt/contact-private/issues',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
