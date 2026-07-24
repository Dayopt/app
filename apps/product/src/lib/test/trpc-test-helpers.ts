/**
 * tRPC テストヘルパー
 *
 * tRPCルーターの単体テスト・統合テスト用のユーティリティ
 *
 * @example
 * ```typescript
 * import { createTestCaller, createMockContext } from '@/lib/test/trpc-test-helpers'
 * import { tagsRouter } from '@/features/tags/server/router'
 *
 * describe('tags.list', () => {
 *   it('should return tags for authenticated user', async () => {
 *     const ctx = createMockContext({ userId: 'test-user-id' })
 *     const caller = createTestCaller(tagsRouter, ctx)
 *
 *     const result = await caller.list()
 *     expect(result).toBeDefined()
 *   })
 * })
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyRouter } from '@trpc/server';
import { vi } from 'vitest';

import type { Database } from '@/lib/database';
import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';
import { createCallerFactory, type Context } from '@/lib/trpc/procedures';

// Re-export factories for backward compatibility
/**
 * モックコンテキストのオプション
 */
interface MockContextOptions {
  userId?: string | undefined;
  sessionId?: string | undefined;
  authMode?: Context['authMode'];
  oauthClientId?: OAuthClientId | undefined;
  oauthScopes?: SupportedScope[] | undefined;
  oauthExecution?: Context['oauthExecution'];
  mfaAssurance?: Context['mfaAssurance'];
  supabaseOverrides?: Partial<MockSupabaseClient>;
}

/**
 * モックSupabaseクライアントの型
 */
interface MockSupabaseClient {
  from: ReturnType<typeof vi.fn>;
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
  };
  rpc: ReturnType<typeof vi.fn>;
}

/**
 * モックSupabaseクライアントを作成
 */
export function createMockSupabase(overrides?: Partial<MockSupabaseClient>): MockSupabaseClient {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
  });

  return {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
}

/**
 * モックコンテキストを作成
 */
export function createMockContext(options: MockContextOptions = {}): Context {
  const {
    userId,
    sessionId,
    authMode = 'session',
    oauthClientId,
    oauthScopes,
    oauthExecution,
    mfaAssurance,
    supabaseOverrides,
  } = options;

  const mockSupabase = createMockSupabase(supabaseOverrides);

  return {
    req: {
      headers: {},
      cookies: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as Context['req'],
    res: {
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as Context['res'],
    userId,
    sessionId,
    oauthClientId,
    oauthScopes,
    oauthExecution,
    mfaAssurance,
    supabase: mockSupabase as unknown as SupabaseClient<Database>,
    authMode,
  };
}

/**
 * tRPCテスト用のcallerを作成
 *
 * アプリ本体と同じtRPCインスタンスの createCallerFactory を使用し、
 * 型推論が正しく機能するようにする。
 *
 * @param router - テスト対象のルーター
 * @param ctx - モックコンテキスト
 * @returns ルーターのcaller
 *
 * @example
 * ```typescript
 * const caller = createTestCaller(tagsRouter, ctx);
 * const result = await caller.list(); // 型推論される
 * ```
 */
export function createTestCaller<TRouter extends AnyRouter>(router: TRouter, ctx: Context) {
  const caller = createCallerFactory(router);
  return caller(ctx);
}

/**
 * チェーン可能なSupabaseクエリビルダーモック
 *
 * `from('table').select().eq(...).single()` のようなチェーンを模倣。
 * 全メソッドが `this` を返し、末端メソッド（single/maybeSingle/then）が結果を返す。
 */
export function createChainableMock(
  data: unknown,
  error: { message: string; code?: string } | null = null,
) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: vi.fn().mockImplementation((resolve: (value: unknown) => void) =>
      resolve({
        data: Array.isArray(data) ? data : data ? [data] : [],
        error,
      }),
    ),
  };

  Object.keys(mock).forEach((key) => {
    if (!['single', 'maybeSingle', 'then'].includes(key)) {
      mock[key]!.mockReturnValue(mock);
    }
  });

  return mock;
}
