import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(
  () =>
    ({
      GOOGLE_CALENDAR_CLIENT_ID: '123456789012-dayoptcalendar.apps.googleusercontent.com',
      GOOGLE_CALENDAR_PROJECT_NUMBER: '123456789012',
    }) as {
      GOOGLE_CALENDAR_CLIENT_ID?: string | undefined;
      GOOGLE_CALENDAR_PROJECT_NUMBER?: string | undefined;
    },
);

vi.mock('@/env', () => ({ env: envMock }));

import {
  getConfiguredGoogleCalendarProjectKey,
  resolveGoogleCalendarAuthorityIdentity,
  resolveGoogleCalendarProjectKey,
} from './authority-config';

beforeEach(() => {
  envMock.GOOGLE_CALENDAR_CLIENT_ID = '123456789012-dayoptcalendar.apps.googleusercontent.com';
  envMock.GOOGLE_CALENDAR_PROJECT_NUMBER = '123456789012';
});

describe('Google Calendar authority config', () => {
  it('完全なOAuth client identityをproject keyと一組で返す', () => {
    expect(resolveGoogleCalendarAuthorityIdentity()).toEqual({
      oauthClientId: '123456789012-dayoptcalendar.apps.googleusercontent.com',
      projectKey: '123456789012',
    });
    expect(resolveGoogleCalendarProjectKey()).toBe('123456789012');
  });

  it.each([
    '999999999999-dayoptcalendar.apps.googleusercontent.com',
    '123456789012-dayoptcalendar',
    'invalid-client-id',
  ])('client identity %s はfail-closeする', (clientId) => {
    envMock.GOOGLE_CALENDAR_CLIENT_ID = clientId;

    expect(resolveGoogleCalendarAuthorityIdentity()).toBeNull();
    expect(resolveGoogleCalendarProjectKey()).toBeNull();
  });

  it('client不整合時もmandatory expiry用のconfigured project keyだけは返す', () => {
    envMock.GOOGLE_CALENDAR_CLIENT_ID = '999999999999-dayoptcalendar.apps.googleusercontent.com';

    expect(getConfiguredGoogleCalendarProjectKey()).toBe('123456789012');
    expect(resolveGoogleCalendarAuthorityIdentity()).toBeNull();
  });
});
