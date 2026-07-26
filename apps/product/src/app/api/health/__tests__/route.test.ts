import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  redisPing: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  envValidationError: false,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@upstash/redis', () => ({
  Redis: class Redis {
    ping() {
      return mocks.redisPing();
    }
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

vi.mock('@/env', () => ({
  env: new Proxy(
    {},
    {
      get() {
        if (mocks.envValidationError) {
          throw new Error('env-validation-sentinel');
        }
        return undefined;
      },
    },
  ),
}));

import { GET } from '../route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-sentinel');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-sentinel');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.32.0');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('VERCEL_TARGET_ENV', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    mocks.envValidationError = false;
    mocks.limit.mockResolvedValue({ data: [], error: null });
    mocks.redisPing.mockResolvedValue('PONG');
    mocks.select.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.createClient.mockReturnValue({ from: mocks.from });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('profilesへの空結果SELECT成功をhealthyとして扱う', async () => {
    const memoryUsage = vi.spyOn(process, 'memoryUsage');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('0.32.0');
    expect(body.checks).toEqual({ database: 'ok', redis: 'skipped' });
    expect(body.checks).not.toHaveProperty('memory');
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.select).toHaveBeenCalledWith('id');
    expect(mocks.limit).toHaveBeenCalledWith(1);
    expect(memoryUsage).not.toHaveBeenCalled();
  });

  it('productionではstatusだけをno-storeで返す', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'healthy' });
    expect(Object.keys(body)).toEqual(['status']);
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('Vercel PreviewではNODE_ENVがproductionでも診断情報を返す', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks).toEqual({ database: 'ok', redis: 'skipped' });
  });

  it('staging Custom Environmentを依存必須かつ詳細非公開として扱う', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://staging-example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'staging-redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy' });
  });

  it('staging Custom EnvironmentはRedis未設定をunhealthyにする', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
  });

  it('staging Custom Environmentはnon-PONGをreadiness失敗として扱う', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://staging-example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'staging-redis-token-sentinel');
    mocks.redisPing.mockResolvedValue('NOT_PONG');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
  });

  it.each(['PGRST202', 'PGRST205'])('DB query error %sをunhealthyにする', async (code) => {
    mocks.limit.mockResolvedValue({
      data: null,
      error: {
        code,
        message: 'database-message-sentinel',
        details: 'database-details-sentinel',
        hint: 'database-hint-sentinel',
      },
    });
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.loggerError).toHaveBeenCalledOnce();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[health] dependency check failed',
      expect.objectContaining({ database: 'error', redis: 'ok' }),
    );
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('database-message-sentinel');
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('service-role-sentinel');
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('example.supabase.co');
  });

  it('DB queryのtimeoutをunhealthyにする', async () => {
    mocks.limit.mockRejectedValue(new Error('timeout-message-sentinel'));
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[health] dependency check failed',
      expect.objectContaining({ database: 'error', redis: 'ok' }),
    );
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('timeout-message-sentinel');
  });

  it('非productionのDB設定不足をdegradedとしてclientを作らず返す', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('degraded');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it('productionのservice-role secret不足をunhealthyとして扱う', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[health] dependency check failed',
      expect.objectContaining({ database: 'error', redis: 'ok' }),
    );
  });

  it('operational環境変数schemaの失敗をnetwork check前にunhealthyとして扱う', async () => {
    mocks.envValidationError = true;
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redisPing).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[health] environment check failed',
      expect.objectContaining({ status: 'unhealthy' }),
    );
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('env-validation-sentinel');
  });

  it('productionのRedis設定不足をunhealthyとして扱う', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });

  it('RedisのPONGをhealthyとして扱う', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('Redisのnon-PONGをdegradedとして扱う', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');
    mocks.redisPing.mockResolvedValue('NOT_PONG');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks).toEqual({ database: 'ok', redis: 'warning' });
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it('Redis errorをunhealthyとして扱う', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');
    mocks.redisPing.mockRejectedValue(new Error('redis-token-sentinel'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe('unhealthy');
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('redis-token-sentinel');
  });
});
