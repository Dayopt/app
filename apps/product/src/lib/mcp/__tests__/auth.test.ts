import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMcpAccessDbClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('../access-db', () => ({ createMcpAccessDbClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

import { OAuthServerError } from '@/lib/oauth-server';

import { extractBearerToken, verifyAccessToken } from '../auth';

beforeEach(() => {
  vi.clearAllMocks();
  captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
    error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('extractBearerToken', () => {
  it.each([
    ['Bearer opaque-token', 'opaque-token'],
    ['bearer abc.DEF_123~+/==', 'abc.DEF_123~+/=='],
    ['Bearer   token', 'token'],
  ])('accepts an RFC 6750 bearer credential: %s', (authorization, expected) => {
    expect(extractBearerToken(authorization)).toBe(expected);
  });

  it.each([null, 'Basic dXNlcjpwYXNz'])(
    'requires bearer discovery for missing or unsupported credentials: %s',
    (authorization) => {
      expect(() => extractBearerToken(authorization)).toThrow(
        expect.objectContaining<Partial<OAuthServerError>>({
          code: 'invalid_request',
          httpStatus: 401,
        }),
      );
    },
  );

  it.each([
    'Bearer',
    'Bearer   ',
    'Bearer token with-spaces',
    'Bearer token,second',
    'Bearer token\t',
  ])('rejects malformed bearer credentials as an invalid request: %s', (value) => {
    expect(() => extractBearerToken(value)).toThrow(
      expect.objectContaining<Partial<OAuthServerError>>({
        code: 'invalid_request',
        httpStatus: 400,
      }),
    );
  });
});

describe('verifyAccessToken dependency failures', () => {
  it.each([
    { name: 'database error', result: { data: null, error: { code: 'PGRST000' } } },
    { name: 'missing singleton row', result: { data: null, error: null } },
  ])('returns a retryable server error for a mutation-control $name', async ({ result }) => {
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');
    createMcpAccessDbClient.mockReturnValue(
      createAccessDb({
        mcp_mutation_control: result,
      }),
    );

    await expect(verifyAccessToken('opaque-token')).rejects.toMatchObject({
      name: 'OAuthServerError',
      code: 'server_error',
      httpStatus: 503,
      message: 'Access token verification failed',
      cause: expect.any(Error),
    });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });

  it('returns a retryable server error when Pro entitlement cannot be verified', async () => {
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');
    createMcpAccessDbClient.mockReturnValue(
      createAccessDb({
        mcp_mutation_control: {
          data: { writes_enabled: true, enabled_client_ids: ['chatgpt'] },
          error: null,
        },
        profiles: { data: null, error: { code: 'PGRST000' } },
      }),
    );

    await expect(verifyAccessToken('opaque-token')).rejects.toMatchObject({
      code: 'server_error',
      httpStatus: 503,
    });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });

  it('rejects a stored write grant that does not include the base read scope', async () => {
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');
    createMcpAccessDbClient.mockReturnValue(
      createAccessDb({
        oauth_tokens: {
          data: { ...validAccessTokenRow, scopes: ['write:plans'] },
          error: null,
        },
      }),
    );

    await expect(verifyAccessToken('opaque-token')).rejects.toMatchObject({
      code: 'invalid_token',
      httpStatus: 401,
      message: 'Access token binding is invalid',
    });
  });

  it('preserves read access while the durable client write gate is disabled', async () => {
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');
    createMcpAccessDbClient.mockReturnValue(
      createAccessDb({
        mcp_mutation_control: {
          data: { writes_enabled: true, enabled_client_ids: ['claude-ai'] },
          error: null,
        },
      }),
    );

    await expect(verifyAccessToken('opaque-token')).resolves.toMatchObject({
      scopes: ['read:entries'],
    });
  });
});

const validAccessTokenRow = {
  id: 'token-1',
  connection_id: 'connection-1',
  user_id: 'user-1',
  token_type: 'access',
  client_id: 'chatgpt',
  scopes: ['read:entries', 'write:plans'],
  resource_uri: 'https://mcp.dayopt.app',
  expires_at: '2099-01-01T00:00:00.000Z',
  revoked_at: null,
};

const validConnectionRow = {
  id: 'connection-1',
  user_id: 'user-1',
  client_id: 'chatgpt',
  resource_uri: 'https://mcp.dayopt.app',
  scopes: ['read:entries', 'write:plans'],
  write_enabled_at: '2026-07-23T00:00:00.000Z',
  write_disabled_at: null,
  revoked_at: null,
  reauth_required_at: '2099-01-01T00:00:00.000Z',
};

interface QueryResult {
  data: unknown;
  error: unknown;
}

function createAccessDb(overrides: Partial<Record<string, QueryResult>>) {
  const defaults: Record<string, QueryResult> = {
    oauth_tokens: { data: validAccessTokenRow, error: null },
    oauth_connections: { data: validConnectionRow, error: null },
    mcp_mutation_control: {
      data: { writes_enabled: true, enabled_client_ids: ['chatgpt'] },
      error: null,
    },
    profiles: { data: { subscription_status: 'active' }, error: null },
  };

  return {
    from: vi.fn((table: string) => createMaybeSingleBuilder(overrides[table] ?? defaults[table]!)),
  };
}

function createMaybeSingleBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}
