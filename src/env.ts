/**
 * サーバーサイド環境変数のZodバリデーション
 *
 * NEXT_PUBLIC_* はNext.jsがビルド時に置換するため、
 * クライアントコード（client.ts等）では従来通り process.env を直接参照する。
 * このファイルはサーバーサイドでのみ import する。
 */
import { z } from 'zod';

const serverSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Resend
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CONTACT_REPO: z.string().optional(),

  // reCAPTCHA (server)
  RECAPTCHA_SECRET_KEY_V3: z.string().optional(),
  RECAPTCHA_SECRET_KEY_V2: z.string().optional(),

  // Auth
  RECOVERY_CODE_PEPPER: z.string().optional(),

  // Google
  GOOGLE_SITE_VERIFICATION: z.string().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  SKIP_AUTH_IN_DEV: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let _env: ServerEnv | undefined;

function validateEnv(): ServerEnv {
  const result = serverSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ 環境変数のバリデーションに失敗しました:\n${formatted}\n\n` +
        `vercel env pull .env.local を実行するか、.env.example を参照してください。`,
    );
  }

  return result.data;
}

/**
 * サーバーサイド環境変数（遅延評価）
 *
 * 初回アクセス時にバリデーションを実行する。
 * テスト環境ではモジュールインポートだけでクラッシュしないようにするため。
 */
export const env = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    if (!_env) {
      _env = validateEnv();
    }
    return _env[prop as keyof ServerEnv];
  },
});
