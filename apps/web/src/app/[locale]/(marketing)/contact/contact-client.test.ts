import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedWebError = vi.hoisted(() => vi.fn());

vi.mock('@/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError,
}));

import { submitContactRequest } from './contact-client';

const privatePayload = {
  submissionId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Private Name',
  email: 'private@example.com',
  category: 'question' as const,
  message: 'This is a private contact message.',
  website: '',
  turnstileToken: 'private-turnstile-token',
};

describe('submitContactRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureUnexpectedWebError.mockImplementation((error: unknown) => error);
  });

  it.each([403, 429, 500])(
    'does not duplicate server capture for an HTTP %i response',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));

      await expect(submitContactRequest(privatePayload)).rejects.toBeInstanceOf(Error);
      expect(captureUnexpectedWebError).not.toHaveBeenCalled();
    },
  );

  it('captures the original browser transport failure once without contact PII', async () => {
    const original = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(original));

    await expect(submitContactRequest(privatePayload)).rejects.toBe(original);
    expect(captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'contact',
      operation: 'submit_contact_form',
      route: '/api/contact',
      source: 'browser_transport',
    });
    expect(JSON.stringify(captureUnexpectedWebError.mock.calls)).not.toContain(
      privatePayload.email,
    );
    expect(JSON.stringify(captureUnexpectedWebError.mock.calls)).not.toContain(
      privatePayload.message,
    );
    expect(JSON.stringify(captureUnexpectedWebError.mock.calls)).not.toContain(
      privatePayload.turnstileToken,
    );
  });

  it('resolves without capture for a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitContactRequest(privatePayload)).resolves.toBeUndefined();
    expect(captureUnexpectedWebError).not.toHaveBeenCalled();
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(sentBody).toMatchObject({
      submissionId: privatePayload.submissionId,
      turnstileToken: privatePayload.turnstileToken,
    });
  });

  it('omits a null Turnstile token from the JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitContactRequest({ ...privatePayload, turnstileToken: null });

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(sentBody).not.toHaveProperty('turnstileToken');
  });
});
