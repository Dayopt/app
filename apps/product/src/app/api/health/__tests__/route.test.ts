import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
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
      get(_target, property) {
        if (mocks.envValidationError) {
          throw new Error('env-validation-sentinel');
        }
        return typeof property === 'string' ? process.env[property] : undefined;
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
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'production');
    vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://app.dayopt.app');
    vi.stubEnv('MCP_CANONICAL_RESOURCE_URI', 'https://mcp.dayopt.app');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    mocks.envValidationError = false;
    mocks.rpc.mockImplementation(() =>
      Promise.resolve({
        data: [
          process.env.MCP_OAUTH_ENVIRONMENT === 'preview'
            ? {
                environment: 'preview',
                authorization_server_uri: 'https://product-git-codex-mcp-preview-dayopt.vercel.app',
                resource_uri: 'https://product-git-codex-mcp-preview-dayopt.vercel.app',
                supabase_project_ref: 'abcdefghijklmnopqrst',
                provisioned_at: '2026-07-29T00:00:00.000Z',
              }
            : process.env.VERCEL_TARGET_ENV === 'staging'
              ? {
                  environment: 'staging',
                  authorization_server_uri: 'https://staging.dayopt.app',
                  resource_uri: 'https://mcp.staging.dayopt.app',
                  supabase_project_ref: null,
                  provisioned_at: '2026-07-26T00:00:00.000Z',
                }
              : {
                  environment: 'production',
                  authorization_server_uri: 'https://app.dayopt.app',
                  resource_uri: 'https://mcp.dayopt.app',
                  supabase_project_ref: null,
                  provisioned_at: '2026-07-26T00:00:00.000Z',
                },
        ],
        error: null,
      }),
    );
    mocks.limit.mockResolvedValue({ data: [], error: null });
    mocks.redisPing.mockResolvedValue('PONG');
    mocks.select.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.createClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
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
    stubStagingOperationalEnvironment();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://staging-example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'staging-redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy' });
  });

  it('OAuth-enabled Previewをproject refと依存必須かつ詳細非公開として扱う', async () => {
    stubPreviewOperationalEnvironment();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      createUnsignedTestJwt({
        role: 'service_role',
        ref: 'abcdefghijklmnopqrst',
      }),
    );
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://preview-example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'preview-redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy' });
    expect(mocks.rpc).toHaveBeenCalledWith('get_mcp_environment_identity_v2');
  });

  it('OAuth-enabled PreviewはSupabase project ref driftをunhealthyにする', async () => {
    stubPreviewOperationalEnvironment();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      createUnsignedTestJwt({
        role: 'service_role',
        ref: 'zyxwvutsrqponmlkjihg',
      }),
    );
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://preview-example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'preview-redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
  });

  it('staging Custom EnvironmentはRedis未設定をunhealthyにする', async () => {
    stubStagingOperationalEnvironment();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
  });

  it('staging Custom Environmentはnon-PONGをreadiness失敗として扱う', async () => {
    stubStagingOperationalEnvironment();
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

  it.each([
    {
      name: 'missing',
      result: { data: [], error: null },
    },
    {
      name: 'mismatched',
      result: {
        data: [
          {
            environment: 'staging',
            authorization_server_uri: 'https://staging.dayopt.app',
            resource_uri: 'https://mcp.staging.dayopt.app',
            provisioned_at: '2026-07-26T00:00:00.000Z',
          },
        ],
        error: null,
      },
    },
  ])('production DB identity $nameをreadiness失敗にする', async ({ result }) => {
    mocks.rpc.mockResolvedValue(result);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-sentinel');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy' });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('staging.dayopt.app');
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

function stubStagingOperationalEnvironment(): void {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_TARGET_ENV', 'staging');
  vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'staging');
  vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://staging.dayopt.app');
  vi.stubEnv('MCP_CANONICAL_RESOURCE_URI', 'https://mcp.staging.dayopt.app');
}

function stubPreviewOperationalEnvironment(): void {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
  vi.stubEnv('VERCEL_BRANCH_URL', 'product-git-codex-mcp-preview-dayopt.vercel.app');
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'codex/mcp-preview');
  vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'preview');
  vi.stubEnv('MCP_OAUTH_PREVIEW_BRANCH', 'codex/mcp-preview');
  vi.stubEnv(
    'OAUTH_AUTHORIZATION_SERVER_URI',
    'https://product-git-codex-mcp-preview-dayopt.vercel.app',
  );
  vi.stubEnv(
    'MCP_CANONICAL_RESOURCE_URI',
    'https://product-git-codex-mcp-preview-dayopt.vercel.app',
  );
}

function createUnsignedTestJwt(payload: Record<string, string>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}
