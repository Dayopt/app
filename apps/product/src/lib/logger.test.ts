import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('logger Sentry breadcrumbs', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('does not flatten structured log fields into the breadcrumb message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Contact delivery failed', {
      email: 'person@example.com',
      verificationCode: '123456',
      contactMessage: 'private feedback',
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: 'Contact delivery failed',
      category: 'logger',
      level: 'error',
    });
  });

  it('uses a neutral label when a log has no stable string argument', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logger.warn({ token: 'short-secret' });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: '[structured log]',
      category: 'logger',
      level: 'warning',
    });
  });
});
