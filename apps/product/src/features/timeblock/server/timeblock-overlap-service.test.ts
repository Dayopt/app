import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

import { TimeblockOverlapService } from './timeblock-overlap-service';

describe('TimeblockOverlapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) => error);
  });

  it.each([
    ['plans', 'checkPlans', 'check_plan_overlap'],
    ['records', 'checkRecords', 'check_record_overlap'],
  ] as const)(
    '%sのDB障害を重複なしへ変換せずcaptureしてthrowする',
    async (table, method, operation) => {
      const dbError = new Error('database unavailable');
      const query = createChainableMock(null, { message: dbError.message });
      const service = new TimeblockOverlapService({ from: vi.fn(() => query) } as never);

      const promise = service[method]({
        userId: '00000000-0000-4000-8000-000000000001',
        startAt: '2026-07-16T00:00:00.000Z',
        endAt: '2026-07-16T01:00:00.000Z',
      });

      await expect(promise).rejects.toEqual({ message: dbError.message });
      expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(
        { message: dbError.message },
        { feature: 'timeblock', operation },
      );
      expect(
        (service as unknown as { supabase: { from: ReturnType<typeof vi.fn> } }).supabase.from,
      ).toHaveBeenCalledWith(table);
    },
  );
});
