import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, withPIIScrub } from './scrub-pii';

function makeEvent(overrides: Partial<ErrorEvent>): ErrorEvent {
  return overrides as ErrorEvent;
}

describe('scrubSentryEvent', () => {
  it('redacts email from exception message', () => {
    const result = scrubSentryEvent(
      makeEvent({
        exception: {
          values: [{ type: 'Error', value: 'Failed for user alice@example.com during sync' }],
        },
      }),
    );
    expect(result.exception?.values?.[0]?.value).toBe(
      'Failed for user [REDACTED_EMAIL] during sync',
    );
  });

  it('redacts JWT from exception message', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmn';
    const result = scrubSentryEvent(
      makeEvent({
        exception: { values: [{ type: 'Error', value: `bad token: ${jwt}` }] },
      }),
    );
    expect(result.exception?.values?.[0]?.value).toBe('bad token: [REDACTED_JWT]');
  });

  it('redacts long tokens like recovery codes', () => {
    const longToken = 'a'.repeat(40);
    const result = scrubSentryEvent(
      makeEvent({
        exception: { values: [{ type: 'Error', value: `code=${longToken}` }] },
      }),
    );
    expect(result.exception?.values?.[0]?.value).toBe('code=[REDACTED_TOKEN]');
  });

  it('scrubs sensitive URL query params', () => {
    const result = scrubSentryEvent(
      makeEvent({
        request: {
          url: 'https://app.example.com/auth/callback?token=abc123&email=alice@example.com',
          method: 'GET',
        },
      }),
    );
    expect(result.request?.url).toBe(
      'https://app.example.com/auth/callback?token=%5BREDACTED%5D&email=%5BREDACTED%5D',
    );
  });

  it('scrubs sensitive header names case-insensitively', () => {
    const result = scrubSentryEvent(
      makeEvent({
        request: {
          headers: {
            Authorization: 'Bearer eyJhbc.def.ghi',
            Cookie: 'session=xyz',
            'User-Agent': 'mozilla',
          },
        },
      }),
    );
    expect((result.request?.headers as Record<string, string>).Authorization).toBe('[REDACTED]');
    expect((result.request?.headers as Record<string, string>).Cookie).toBe('[REDACTED]');
    expect((result.request?.headers as Record<string, string>)['User-Agent']).toBe('mozilla');
  });

  it('redacts user.email but keeps id', () => {
    const result = scrubSentryEvent(
      makeEvent({
        user: { id: 'user_123', email: 'alice@example.com' },
      }),
    );
    expect(result.user?.id).toBe('user_123');
    expect(result.user?.email).toBe('[REDACTED]');
  });

  it('scrubs breadcrumb message and data', () => {
    const result = scrubSentryEvent(
      makeEvent({
        breadcrumbs: [
          {
            message: 'login attempt bob@example.com',
            data: { email: 'bob@example.com', path: '/login' },
          },
        ],
      }),
    );
    const bc = result.breadcrumbs?.[0];
    expect(bc?.message).toBe('login attempt [REDACTED_EMAIL]');
    expect((bc?.data as Record<string, string>).email).toBe('[REDACTED]');
    expect((bc?.data as Record<string, string>).path).toBe('/login');
  });

  it('scrubs extra and contexts', () => {
    const result = scrubSentryEvent(
      makeEvent({
        extra: { userInput: 'contact me at me@example.com' },
        contexts: { auth: { token: 'abc' } },
      }),
    );
    expect(result.extra?.userInput).toBe('contact me at [REDACTED_EMAIL]');
    expect((result.contexts as Record<string, Record<string, string>>).auth?.token).toBe(
      '[REDACTED]',
    );
  });

  it('does not mutate the input event', () => {
    const original: ErrorEvent = makeEvent({
      exception: { values: [{ type: 'Error', value: 'secret eyJabc.def.ghij' }] },
    });
    const snapshot = JSON.stringify(original);
    scrubSentryEvent(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('passes through events with no PII', () => {
    const event = makeEvent({
      exception: { values: [{ type: 'Error', value: 'something broke' }] },
      request: { url: 'https://app.example.com/home' },
    });
    const result = scrubSentryEvent(event);
    expect(result.exception?.values?.[0]?.value).toBe('something broke');
    expect(result.request?.url).toBe('https://app.example.com/home');
  });
});

describe('withPIIScrub', () => {
  it('returns null when existing beforeSend filters event', () => {
    const wrapped = withPIIScrub(() => null);
    const result = wrapped(makeEvent({ exception: { values: [{ value: 'noise' }] } }), {});
    expect(result).toBeNull();
  });

  it('scrubs the event returned by existing beforeSend', () => {
    const wrapped = withPIIScrub((event) => event);
    const result = wrapped(
      makeEvent({
        exception: { values: [{ type: 'Error', value: 'user alice@example.com' }] },
      }),
      {},
    );
    expect(result?.exception?.values?.[0]?.value).toBe('user [REDACTED_EMAIL]');
  });

  it('works when existing beforeSend is undefined', () => {
    const wrapped = withPIIScrub();
    const result = wrapped(
      makeEvent({
        exception: { values: [{ type: 'Error', value: 'contact: x@y.io' }] },
      }),
      {},
    );
    expect(result?.exception?.values?.[0]?.value).toBe('contact: [REDACTED_EMAIL]');
  });
});
