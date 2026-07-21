import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    VERCEL_ENV: 'production' as string | undefined,
    RESEND_API_KEY: 'resend-test-key' as string | undefined,
    RESEND_FROM_EMAIL: 'contact-sender@dayopt.app' as string | undefined,
  },
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/platform/config/env', () => ({ env: mocks.env }));

import { sendContactEmail } from './contact-email';

const input = {
  submissionId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Private Name',
  email: 'private@example.com',
  category: 'question' as const,
  message: 'This is a private contact message.',
};

describe('Web sendContactEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.VERCEL_ENV = 'production';
    mocks.env.RESEND_API_KEY = 'resend-test-key';
    mocks.env.RESEND_FROM_EMAIL = 'contact-sender@dayopt.app';
    mocks.fetch.mockImplementation(async () => Response.json({ id: 'email-1' }));
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses fixed headers and puts contact PII only in the plain-text body', async () => {
    await sendContactEmail(input);

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, request] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer resend-test-key',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'contact-web-550e8400-e29b-41d4-a716-446655440000',
      },
      signal: expect.any(AbortSignal),
    });
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toEqual({
      from: 'Dayopt Contact <contact-sender@dayopt.app>',
      to: ['support@dayopt.app'],
      reply_to: 'private@example.com',
      subject: '[Dayopt Contact][Web][Question]',
      text: [
        'Unverified submission from the Dayopt Website contact form.',
        '',
        'Category: Question',
        'Name: Private Name',
        'Email: private@example.com',
        '',
        'Message:',
        'This is a private contact message.',
      ].join('\n'),
      tags: [
        { name: 'source', value: 'contact-web' },
        { name: 'category', value: 'question' },
      ],
    });
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('attachments');
  });

  it.each(['preview', 'development', undefined])(
    'refuses non-Production delivery even with credentials (%s)',
    async (vercelEnv) => {
      mocks.env.VERCEL_ENV = vercelEnv;

      await expect(sendContactEmail(input)).rejects.toThrow(
        'Contact email delivery is available only in Production',
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { key: undefined, from: 'contact-sender@dayopt.app' },
    { key: 'resend-test-key', from: undefined },
    { key: 'resend-test-key', from: 'onboarding@resend.dev' },
    { key: 'resend-test-key', from: 'sender@example.com' },
  ])('fails closed for invalid email configuration', async ({ key, from }) => {
    mocks.env.RESEND_API_KEY = key;
    mocks.env.RESEND_FROM_EMAIL = from;

    await expect(sendContactEmail(input)).rejects.toThrow(
      'Contact email configuration is missing or invalid',
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects reply-to recipient injection', async () => {
    await expect(
      sendContactEmail({ ...input, email: 'a@example.com,b@example.com' }),
    ).rejects.toThrow('Contact email reply address is invalid');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('normalizes provider errors without retaining provider response PII', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        { message: `provider echoed ${input.email} ${input.message}` },
        { status: 422 },
      ),
    );

    const error = await sendContactEmail(input).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      message: 'Contact email provider returned an unsuccessful response',
    });
    expect(JSON.stringify(error)).not.toContain(input.email);
    expect(JSON.stringify(error)).not.toContain(input.message);
  });

  it('rejects malformed successful provider responses', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ unexpected: true }));
    await expect(sendContactEmail(input)).rejects.toThrow(
      'Contact email provider returned an unsuccessful response',
    );
  });

  it('aborts after ten seconds and preserves the idempotency key for retry', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(
      (_url: unknown, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          );
        }),
    );

    const delivery = sendContactEmail(input);
    const assertion = expect(delivery).rejects.toThrow('Contact email delivery timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({
      'Idempotency-Key': 'contact-web-550e8400-e29b-41d4-a716-446655440000',
    });
    expect(request.signal?.aborted).toBe(true);
  });
});
