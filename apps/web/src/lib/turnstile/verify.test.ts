import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ TURNSTILE_SECRET_KEY: 'secret' as string | undefined }));

vi.mock('@/platform/config/env', () => ({ env }));

import { verifyTurnstile } from './verify';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.TURNSTILE_SECRET_KEY = 'secret';
  });

  it('returns an expected rejection for a missing browser token', async () => {
    await expect(verifyTurnstile(undefined)).resolves.toEqual({
      success: false,
      'error-codes': ['missing-input-response'],
    });
  });

  it('throws when the production secret is not configured', async () => {
    env.TURNSTILE_SECRET_KEY = undefined;
    await expect(verifyTurnstile('browser-token')).rejects.toThrow(
      'Turnstile secret key is not configured',
    );
  });

  it('preserves a transport Error for the route capture boundary', async () => {
    const original = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(original));

    await expect(verifyTurnstile('browser-token')).rejects.toBe(original);
  });

  it('throws for an unsuccessful or malformed provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(verifyTurnstile('browser-token')).rejects.toThrow(
      'Turnstile verification service returned an unsuccessful response',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ unexpected: true })),
    );
    await expect(verifyTurnstile('browser-token')).rejects.toThrow(
      'Turnstile verification service returned an invalid response',
    );
  });

  it('returns a schema-validated provider decision', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
      ),
    );

    await expect(verifyTurnstile('browser-token')).resolves.toEqual({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
  });
});
