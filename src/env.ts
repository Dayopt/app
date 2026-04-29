/**
 * サーバーサイド環境変数のZodバリデーション
 *
 * NEXT_PUBLIC_* はNext.jsがビルド時に置換するため、
 * クライアントコード（client.ts等）では従来通り process.env を直接参照する。
 * このファイルはサーバーサイドでのみ import する。
 */
import 'server-only';

import { z } from 'zod';

const serverSchema = z
  .object({
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

    // GitHub
    GITHUB_TOKEN: z.string().optional(),
    GITHUB_CONTACT_REPO: z.string().optional(),

    // Cloudflare Turnstile (client-side site key only; secret is stored in Supabase Auth Bot Protection)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

    // Auth
    RECOVERY_CODE_PEPPER: z.string().optional(),

    // Google
    GOOGLE_SITE_VERIFICATION: z.string().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Slack
    SLACK_BILLING_WEBHOOK_URL: z.string().url().optional(),

    // App
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_MAINTENANCE_MODE: z.enum(['true', 'false']).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    SKIP_AUTH_IN_DEV: z.string().optional(),
  })
  .refine((data) => !(data.NODE_ENV === 'production' && data.SKIP_AUTH_IN_DEV === 'true'), {
    message: 'SKIP_AUTH_IN_DEV は本番環境では使用できない',
    path: ['SKIP_AUTH_IN_DEV'],
  })
  .refine((data) => !(data.NODE_ENV === 'production' && !data.RECOVERY_CODE_PEPPER), {
    message: 'RECOVERY_CODE_PEPPER は本番環境では必須です',
    path: ['RECOVERY_CODE_PEPPER'],
  })
  .refine(
    (data) => {
      const hasKey = !!data.STRIPE_SECRET_KEY;
      const hasWebhook = !!data.STRIPE_WEBHOOK_SECRET;
      return hasKey === hasWebhook;
    },
    {
      message: 'STRIPE_SECRET_KEY と STRIPE_WEBHOOK_SECRET はペアで設定してください',
      path: ['STRIPE_WEBHOOK_SECRET'],
    },
  )
  .refine(
    (data) =>
      !(
        data.NODE_ENV === 'production' &&
        (!data.UPSTASH_REDIS_REST_URL || !data.UPSTASH_REDIS_REST_TOKEN)
      ),
    {
      message:
        'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN は本番環境では必須です（インメモリfallbackはmulti-replicaで歯抜けになる）',
      path: ['UPSTASH_REDIS_REST_URL'],
    },
  );

export type ServerEnv = z.infer<typeof serverSchema>;

let _validated = false;

/**
 * サーバーサイド環境変数
 *
 * process.env へのアクセスをProxy経由で提供する。
 * - dev/production ランタイム: 初回アクセス時にZodバリデーションを実行（不足があればthrow）
 * - ビルド時/テスト時/CI: バリデーションをスキップし process.env を直接返す
 */
export const env = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    // テスト・ビルド・CI環境ではバリデーションをスキップ
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    const isCI = process.env.CI === 'true';

    if (!isTest && !isBuild && !isCI && !_validated) {
      // Vercel env pull が末尾に \n を付与したり空文字をセットすることがあるため正規化
      const cleaned: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(process.env)) {
        const trimmed = value?.replace(/\\n/g, '').trim();
        cleaned[key] = trimmed === '' ? undefined : trimmed;
      }
      const result = serverSchema.safeParse(cleaned);
      if (!result.success) {
        const formatted = result.error.issues
          .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        throw new Error(
          `❌ 環境変数のバリデーションに失敗しました:\n${formatted}\n\n` +
            `vercel env pull .env.local を実行するか、.env.example を参照してください。`,
        );
      }
      _validated = true;
    }

    return process.env[prop];
  },
});
