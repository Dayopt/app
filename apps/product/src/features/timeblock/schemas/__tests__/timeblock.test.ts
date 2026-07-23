import { describe, expect, it } from 'vitest';

import { confirmDaySchema, planFilterSchema, recordFilterSchema } from '../timeblock';

const planId = '11111111-1111-4111-8111-111111111111';

describe('timeblock relation filters', () => {
  it('UUID配列を受け入れる', () => {
    expect(planFilterSchema.safeParse({ ids: [planId] }).success).toBe(true);
    expect(recordFilterSchema.safeParse({ planIds: [planId] }).success).toBe(true);
  });

  it('UUIDではないIDを拒否する', () => {
    expect(planFilterSchema.safeParse({ ids: ['not-a-uuid'] }).success).toBe(false);
    expect(recordFilterSchema.safeParse({ planIds: ['not-a-uuid'] }).success).toBe(false);
  });

  it('100件を超えるID配列を拒否する', () => {
    const tooManyIds = Array.from({ length: 101 }, () => planId);

    expect(planFilterSchema.safeParse({ ids: tooManyIds }).success).toBe(false);
    expect(recordFilterSchema.safeParse({ planIds: tooManyIds }).success).toBe(false);
  });
});

describe('confirmDaySchema', () => {
  it('DSTを含む26時間までの日次範囲を受け入れる', () => {
    expect(
      confirmDaySchema.safeParse({
        start_at: '2026-10-24T22:00:00.000Z',
        end_at: '2026-10-26T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('26時間を超える範囲を拒否する', () => {
    const result = confirmDaySchema.safeParse({
      start_at: '2026-07-01T00:00:00.000Z',
      end_at: '2026-07-02T02:00:00.001Z',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'validation.time.rangeTooLong', path: ['end_at'] }),
        ]),
      );
    }
  });
});
