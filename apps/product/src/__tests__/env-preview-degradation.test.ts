/**
 * `env.ts` の Preview Supabase degradation（#2419）契約を固定する。
 *
 * `env.ts` のバリデーションは vitest 実行時（`process.env.VITEST === 'true'` /
 * `NODE_ENV === 'test'`）は既定でスキップされるため、この 2 つを明示的に
 * 上書きしてバリデーションを実際に走らせる。モジュール内部の `_validated` /
 * `_isPreviewWithoutBackend` は module scope の mutable state のため、
 * ケースごとに `vi.resetModules()` + 動的 import で新しいインスタンスを取る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('env の Preview Supabase degradation', () => {
  beforeEach(() => {
    vi.resetModules();
    // env.ts のバリデーションを実際に走らせる（既定の test skip を無効化）
    vi.stubEnv('VITEST', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('local dev（VERCEL_ENV 未設定）で Supabase env が無いと throw する（検出能力を維持）', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const { env } = await import('../env');
    expect(() => env.NEXT_PUBLIC_SUPABASE_URL).toThrow(/環境変数のバリデーション/);
  });

  it('production 相当の設定ミスでは throw する（検出能力を維持）', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const { env } = await import('../env');
    expect(() => env.NEXT_PUBLIC_SUPABASE_URL).toThrow(/環境変数のバリデーション/);
  });

  it('Preview + Supabase env 未設定では throw せず placeholder を返す', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    // NODE_ENV === 'production' 系の他 refine（RECOVERY_CODE_PEPPER 等）は本テストの
    // 対象外のため、Supabase degradation の検証だけを分離できるよう満たしておく。
    vi.stubEnv('RECOVERY_CODE_PEPPER', 'test-recovery-code-pepper');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const { env } = await import('../env');
    expect(() => env.NEXT_PUBLIC_SUPABASE_URL).not.toThrow();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://placeholder.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('placeholder');
  });

  it('degraded 時の SUPABASE_SERVICE_ROLE_KEY は既知の定数ではなく起動ごとのランダム値（fail-open防止）', async () => {
    // lib/trpc/context.ts の service-role 認証は `!expectedKey || !safeCompare(...)` で
    // fail-closed する契約に依存している。ここへ既知の公開定数を与えると、Preview 上で
    // 誰でもその値を X-API-Key に送るだけで service-role 認証が通ってしまう
    // （risk-reviewer 指摘）。SUPABASE_SERVICE_ROLE_KEY の型を non-optional のまま保つため
    // （呼び出し元 10 箇所超への型カスケードを避けるため）undefined ではなくランダム値にする。
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RECOVERY_CODE_PEPPER', 'test-recovery-code-pepper');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

    const { env } = await import('../env');
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    expect(key).toBeTypeOf('string');
    expect(key.length).toBeGreaterThanOrEqual(32);
    expect(key).not.toBe('placeholder');
    expect(key).not.toBe('');
  });

  it('degraded 時の SUPABASE_SERVICE_ROLE_KEY は同一プロセス内で安定している', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RECOVERY_CODE_PEPPER', 'test-recovery-code-pepper');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

    const { env } = await import('../env');
    const first = env.SUPABASE_SERVICE_ROLE_KEY;
    const second = env.SUPABASE_SERVICE_ROLE_KEY;

    expect(first).toBe(second);
  });

  it('Preview で実 Supabase env が設定済みなら degradation せず実値を返す', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RECOVERY_CODE_PEPPER', 'test-recovery-code-pepper');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-preview.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'real-service-role-key');

    const { env } = await import('../env');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://real-preview.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('real-anon-key');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('real-service-role-key');
  });
});
