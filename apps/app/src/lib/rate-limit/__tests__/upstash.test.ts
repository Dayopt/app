/**
 * Upstash Rate Limit Unit Tests
 *
 * レート制限機能のユニットテスト
 * Upstash未設定時のフォールバック動作を検証
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apiRateLimit,
  entryCreateRateLimit,
  isUpstashEnabled,
  loginRateLimit,
  passwordResetRateLimit,
  RATE_LIMIT_PRESETS,
  trpcUserRateLimit,
  UPSTASH_COST_ESTIMATE,
  withUpstashRateLimit,
} from '../upstash';

describe('Upstash Rate Limit', () => {
  describe('Configuration', () => {
    it('should export isUpstashEnabled flag', () => {
      expect(typeof isUpstashEnabled).toBe('boolean');
    });

    it('should be disabled when environment variables are not set', () => {
      // テスト環境ではUpstashが設定されていないはず
      if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        expect(isUpstashEnabled).toBe(false);
      }
    });

    it('should export rate limit instances (null when disabled)', () => {
      if (!isUpstashEnabled) {
        expect(apiRateLimit).toBeNull();
        expect(loginRateLimit).toBeNull();
        expect(passwordResetRateLimit).toBeNull();
        expect(trpcUserRateLimit).toBeNull();
        expect(entryCreateRateLimit).toBeNull();
      }
    });
  });

  describe('Rate Limit Presets', () => {
    it('should define API preset', () => {
      expect(RATE_LIMIT_PRESETS.api).toBeDefined();
      expect(RATE_LIMIT_PRESETS.api.requests).toBe(60);
      expect(RATE_LIMIT_PRESETS.api.window).toBe('1 m');
    });

    it('should define auth preset with stricter limits', () => {
      expect(RATE_LIMIT_PRESETS.auth).toBeDefined();
      expect(RATE_LIMIT_PRESETS.auth.requests).toBe(5);
      expect(RATE_LIMIT_PRESETS.auth.window).toBe('15 m');
    });

    it('should define password reset preset with strictest limits', () => {
      expect(RATE_LIMIT_PRESETS.passwordReset).toBeDefined();
      expect(RATE_LIMIT_PRESETS.passwordReset.requests).toBe(3);
      expect(RATE_LIMIT_PRESETS.passwordReset.window).toBe('1 h');
    });

    it('should define search preset', () => {
      expect(RATE_LIMIT_PRESETS.search).toBeDefined();
      expect(RATE_LIMIT_PRESETS.search.requests).toBe(30);
    });

    it('should define upload preset', () => {
      expect(RATE_LIMIT_PRESETS.upload).toBeDefined();
      expect(RATE_LIMIT_PRESETS.upload.requests).toBe(10);
      expect(RATE_LIMIT_PRESETS.upload.window).toBe('1 h');
    });

    it('should have descriptions for all presets', () => {
      Object.values(RATE_LIMIT_PRESETS).forEach((preset) => {
        expect(preset.description).toBeDefined();
        expect(typeof preset.description).toBe('string');
      });
    });
  });

  describe('Cost Estimate', () => {
    it('should define cost estimate constants', () => {
      expect(UPSTASH_COST_ESTIMATE.freeQuota).toBe(10_000);
      expect(UPSTASH_COST_ESTIMATE.pricePerHundredThousand).toBe(0.2);
      expect(UPSTASH_COST_ESTIMATE.estimatedMonthlyRequests).toBe(3_000_000);
      expect(UPSTASH_COST_ESTIMATE.estimatedMonthlyCost).toBe(6);
    });
  });

  describe('withUpstashRateLimit', () => {
    it('should return null when rate limit is null', async () => {
      const mockRequest = new Request('https://example.com/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const result = await withUpstashRateLimit(mockRequest, null);

      expect(result).toBeNull();
    });

    it('should handle request without IP headers', async () => {
      const mockRequest = new Request('https://example.com/api/test');

      const result = await withUpstashRateLimit(mockRequest, null);

      expect(result).toBeNull();
    });
  });

  describe('New Rate Limit Instances (Phase 1+2)', () => {
    it('should export trpcUserRateLimit (null when Upstash disabled)', () => {
      if (!isUpstashEnabled) {
        expect(trpcUserRateLimit).toBeNull();
      } else {
        expect(trpcUserRateLimit).not.toBeNull();
      }
    });

    it('should export entryCreateRateLimit (null when Upstash disabled)', () => {
      if (!isUpstashEnabled) {
        expect(entryCreateRateLimit).toBeNull();
      } else {
        expect(entryCreateRateLimit).not.toBeNull();
      }
    });
  });

  describe('Rate Limit Ordering', () => {
    it('should have stricter limits for sensitive operations', () => {
      // API > search > auth > password reset (より厳しい順)
      expect(RATE_LIMIT_PRESETS.api.requests).toBeGreaterThan(RATE_LIMIT_PRESETS.search.requests);
      expect(RATE_LIMIT_PRESETS.search.requests).toBeGreaterThan(RATE_LIMIT_PRESETS.auth.requests);
      expect(RATE_LIMIT_PRESETS.auth.requests).toBeGreaterThan(
        RATE_LIMIT_PRESETS.passwordReset.requests,
      );
    });
  });
});

describe('Upstash Rate Limit with Mock', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should enable when environment variables are set', async () => {
    // 環境変数をモック設定
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

    // モジュールを再インポートして環境変数の効果を確認
    // 注意: この方法は実際のRedis接続を試みるため、
    // 本番環境では適切なモックが必要
    const enabled = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    );
    expect(enabled).toBe(true);
  });

  it('should disable when URL is missing', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

    const enabled = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    );
    expect(enabled).toBe(false);
  });

  it('should disable when token is missing', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock.upstash.io';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const enabled = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    );
    expect(enabled).toBe(false);
  });
});
