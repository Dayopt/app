/**
 * AI Usage Service Unit Tests
 *
 * createAIUsageService の hasQuota / getUsage メソッドをモックSupabaseで検証する。
 * 境界値（used === limit, used > limit, used === 0, DBエラー等）を網羅する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { FREE_TIER_MONTHLY_LIMIT } from '../types';
import { createAIUsageService } from '../usage-service';

import type { MockSupabaseClient } from '@/lib/test/trpc-test-helpers';
import type { AISupabaseClient } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildService(mockSupabase: MockSupabaseClient) {
  return createAIUsageService(mockSupabase as unknown as AISupabaseClient);
}

function setupFromWithRequestCount(mockSupabase: MockSupabaseClient, requestCount: number | null) {
  const data = requestCount !== null ? { request_count: requestCount } : null;
  const mock = createChainableMock(data);
  mockSupabase.from.mockReturnValue(mock);
  return mock;
}

function setupFromWithError(mockSupabase: MockSupabaseClient, errorMessage: string) {
  const mock = createChainableMock(null, { message: errorMessage });
  mockSupabase.from.mockReturnValue(mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAIUsageService', () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  // -------------------------------------------------------------------------
  // getUsage
  // -------------------------------------------------------------------------

  describe('getUsage', () => {
    it('should return request_count from DB and the constant limit', async () => {
      setupFromWithRequestCount(mockSupabase, 10);

      const service = buildService(mockSupabase);
      const result = await service.getUsage('user-1');

      expect(result.used).toBe(10);
      expect(result.limit).toBe(FREE_TIER_MONTHLY_LIMIT);
    });

    it('should return used === 0 when the row does not exist (null data)', async () => {
      setupFromWithRequestCount(mockSupabase, null);

      const service = buildService(mockSupabase);
      const result = await service.getUsage('user-1');

      expect(result.used).toBe(0);
      expect(result.limit).toBe(FREE_TIER_MONTHLY_LIMIT);
    });

    it('should return used === 0 when request_count is 0', async () => {
      setupFromWithRequestCount(mockSupabase, 0);

      const service = buildService(mockSupabase);
      const result = await service.getUsage('user-1');

      expect(result.used).toBe(0);
    });

    it('should return used equal to FREE_TIER_MONTHLY_LIMIT when fully consumed', async () => {
      setupFromWithRequestCount(mockSupabase, FREE_TIER_MONTHLY_LIMIT);

      const service = buildService(mockSupabase);
      const result = await service.getUsage('user-1');

      expect(result.used).toBe(FREE_TIER_MONTHLY_LIMIT);
      expect(result.limit).toBe(FREE_TIER_MONTHLY_LIMIT);
    });

    it('should return used greater than limit when DB value exceeds it', async () => {
      const over = FREE_TIER_MONTHLY_LIMIT + 5;
      setupFromWithRequestCount(mockSupabase, over);

      const service = buildService(mockSupabase);
      const result = await service.getUsage('user-1');

      expect(result.used).toBe(over);
      expect(result.used).toBeGreaterThan(result.limit);
    });

    it('should query the ai_usage table', async () => {
      setupFromWithRequestCount(mockSupabase, 5);

      const service = buildService(mockSupabase);
      await service.getUsage('user-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('ai_usage');
    });

    it('should throw when Supabase returns an error', async () => {
      setupFromWithError(mockSupabase, 'DB failure');

      const service = buildService(mockSupabase);

      await expect(service.getUsage('user-1')).rejects.toMatchObject({
        message: 'DB failure',
      });
    });
  });

  // -------------------------------------------------------------------------
  // hasQuota
  // -------------------------------------------------------------------------

  describe('hasQuota', () => {
    it('should return true when used is 0 (no requests yet)', async () => {
      setupFromWithRequestCount(mockSupabase, 0);

      const service = buildService(mockSupabase);
      const result = await service.hasQuota('user-1');

      expect(result).toBe(true);
    });

    it('should return true when no row exists in DB (used defaults to 0)', async () => {
      setupFromWithRequestCount(mockSupabase, null);

      const service = buildService(mockSupabase);
      const result = await service.hasQuota('user-1');

      expect(result).toBe(true);
    });

    it('should return true when used is 1 less than the limit', async () => {
      setupFromWithRequestCount(mockSupabase, FREE_TIER_MONTHLY_LIMIT - 1);

      const service = buildService(mockSupabase);
      const result = await service.hasQuota('user-1');

      expect(result).toBe(true);
    });

    it('should return false when used equals the limit (boundary: used === limit)', async () => {
      setupFromWithRequestCount(mockSupabase, FREE_TIER_MONTHLY_LIMIT);

      const service = buildService(mockSupabase);
      const result = await service.hasQuota('user-1');

      // used < limit is false when they are equal
      expect(result).toBe(false);
    });

    it('should return false when used exceeds the limit', async () => {
      setupFromWithRequestCount(mockSupabase, FREE_TIER_MONTHLY_LIMIT + 1);

      const service = buildService(mockSupabase);
      const result = await service.hasQuota('user-1');

      expect(result).toBe(false);
    });

    it('should propagate errors thrown by getUsage', async () => {
      setupFromWithError(mockSupabase, 'quota check failed');

      const service = buildService(mockSupabase);

      await expect(service.hasQuota('user-1')).rejects.toMatchObject({
        message: 'quota check failed',
      });
    });
  });

  // -------------------------------------------------------------------------
  // incrementUsage
  // -------------------------------------------------------------------------

  describe('incrementUsage', () => {
    it('should call the increment_ai_usage RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

      const service = buildService(mockSupabase);
      await service.incrementUsage('user-1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'increment_ai_usage',
        expect.objectContaining({ p_user_id: 'user-1' }),
      );
    });

    it('should resolve without a return value on success', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

      const service = buildService(mockSupabase);
      const result = await service.incrementUsage('user-1');

      expect(result).toBeUndefined();
    });

    it('should throw when the RPC returns an error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'rpc error' },
      });

      const service = buildService(mockSupabase);

      await expect(service.incrementUsage('user-1')).rejects.toMatchObject({
        message: 'rpc error',
      });
    });
  });
});
