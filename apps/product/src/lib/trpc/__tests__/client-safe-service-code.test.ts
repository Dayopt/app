import { describe, expect, it } from 'vitest';

import { getClientSafeServiceCode } from '../client-safe-service-code';
import { ServiceError } from '../errors';

describe('getClientSafeServiceCode', () => {
  it('Timeblock UIが必要な競合codeだけを公開する', () => {
    expect(getClientSafeServiceCode(new ServiceError('STALE_VERSION', 'updated elsewhere'))).toBe(
      'STALE_VERSION',
    );
    expect(getClientSafeServiceCode(new ServiceError('TIME_OVERLAP', 'overlap'))).toBe(
      'TIME_OVERLAP',
    );
  });

  it('他機能の内部codeは公開しない', () => {
    expect(
      getClientSafeServiceCode(new ServiceError('STRIPE_NOT_CONFIGURED', 'internal detail')),
    ).toBeUndefined();
    expect(getClientSafeServiceCode(new Error('unknown'))).toBeUndefined();
  });
});
