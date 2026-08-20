/**
 * tRPC テストヘルパー
 *
 * tRPCルーターの単体テスト・統合テスト用のユーティリティ
 *
 * @example
 * ```typescript
 * import { createTestCaller, createMockContext } from '@/lib/test/trpc-test-helpers'
 * import { activitiesRouter } from '@/features/activities/server/router'
 *
 * describe('activities.list', () => {
 *   it('should return activities for authenticated user', async () => {
 *     const ctx = createMockContext({ userId: 'test-user-id' })
 *     const caller = createTestCaller(activitiesRouter, ctx)
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
  /** MCP endpoint 内部からの実行だけが OAuth token を tRPC へ通せる。 */
  oauthExecution?: Context['oauthExecution'];
  mfaAssurance?: Context['mfaAssurance'];
  supabaseOverrides?: Partial<MockSupabaseClient>;
  /** 省略時は呼び出し時点の `Date.now()`。予算 anchor のテストで固定値を注入する。 */
  requestStartedAt?: number;
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
  const defaultChainable = {
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
  };

  // write_fence_control は他テーブルと違う既定値が要る: maybeSingle() の既定
  // { data: null } は isWriteFenceEnabled() では「行欠損 → fail closed」と解釈され、
  // 明示的に mock していない全 mutation テストが fence block で失敗してしまう。
  // 既定は本番の初期状態（fence 無効）に合わせ、fence 挙動を検証するテストだけ
  // supabaseOverrides で個別に上書きする。
  const writeFenceChainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { fence_enabled: false }, error: null }),
  };

  const mockFrom = vi.fn((table: string) => {
    if (table === 'write_fence_control') return writeFenceChainable;
    return defaultChainable;
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
    requestStartedAt = Date.now(),
  } = options;

  const mockSupabase = createMockSupabase(supabaseOverrides);
  const resolvedMfaAssurance =
    authMode === 'session' && userId && mfaAssurance === undefined
      ? { currentLevel: 'aal1' as const, nextLevel: 'aal1' as const }
      : mfaAssurance;

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
    requestStartedAt,
    userId,
    sessionId,
    oauthClientId,
    oauthScopes,
    oauthExecution,
    mfaAssurance: resolvedMfaAssurance,
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
 * const caller = createTestCaller(activitiesRouter, ctx);
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
