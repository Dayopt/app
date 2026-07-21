import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  TURNSTILE_SECRET_KEY: 'secret' as string | undefined,
  VERCEL_ENV: 'production' as string | undefined,
}));

vi.mock('@web/platform/config/env', () => ({ env }));

import { verifyTurnstile } from './verify';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.TURNSTILE_SECRET_KEY = 'secret';
    env.VERCEL_ENV = 'production';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an expected rejection for a missing browser token', async () => {
    await expect(verifyTurnstile(undefined)).resolves.toEqual({
      success: false,
      'error-codes': ['missing-input-response'],
    });
  });

  it('throws when the Production secret is not configured', async () => {
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

  it('throws for unsuccessful or malformed provider responses', async () => {
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

  it('accepts only the contact action and a Dayopt Production hostname', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ success: true, action: 'other', hostname: 'dayopt.app' }),
        )
        .mockResolvedValueOnce(
          Response.json({ success: true, action: 'contact', hostname: 'attacker.example' }),
        )
        .mockResolvedValueOnce(
          Response.json({ success: true, action: 'contact', hostname: 'www.dayopt.app' }),
        ),
    );

    await expect(verifyTurnstile('browser-token')).resolves.toEqual({
      success: false,
      'error-codes': ['action-mismatch'],
    });
    await expect(verifyTurnstile('browser-token')).resolves.toEqual({
      success: false,
      'error-codes': ['hostname-mismatch'],
    });
    await expect(verifyTurnstile('browser-token')).resolves.toMatchObject({
      success: true,
      action: 'contact',
      hostname: 'www.dayopt.app',
    });
  });

  it('applies a five-second abort deadline and sends the remote IP', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await verifyTurnstile('browser-token', '203.0.113.10');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain('remoteip=203.0.113.10');
  });
});
