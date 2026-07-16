import { describe, expect, it } from 'vitest';

import {
  isExplicitUserCancellation,
  USER_CANCELLATION_ERROR_CODE,
  UserCancellationError,
} from './cancellation';

describe('explicit user cancellation', () => {
  it('recognizes only the explicit Dayopt marker', () => {
    expect(isExplicitUserCancellation(new UserCancellationError())).toBe(true);
    expect(
      isExplicitUserCancellation(
        Object.assign(new Error('cancelled'), {
          code: USER_CANCELLATION_ERROR_CODE,
        }),
      ),
    ).toBe(true);
    expect(isExplicitUserCancellation(new DOMException('timed out', 'AbortError'))).toBe(false);
    expect(isExplicitUserCancellation(new Error('cancelled'))).toBe(false);
  });
});
