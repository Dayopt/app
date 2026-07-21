import 'server-only';

import { Redis } from '@upstash/redis';

import { env } from '@/platform/config/env';

import { hashRateLimitIdentifier, RateLimitUnavailableError } from './rate-limit';

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : undefined;

const PROCESSING_SECONDS = 5 * 60;
/** Resendの自動retryと30日間のmanual replay運用を越えて重複を抑止する。 */
export const RESEND_WEBHOOK_PROCESSED_SECONDS = 35 * 24 * 60 * 60;

type ResendWebhookClaim =
  | { status: 'claimed'; token: string }
  | { status: 'already_processed' }
  | { status: 'in_progress' };

async function getWebhookKey(eventId: string): Promise<string> {
  const digest = await hashRateLimitIdentifier(`resend-event:${eventId}`);
  return `webhook:web:resend:${digest}`;
}

function assertRedisAvailable(): void {
  if (!redis && env.VERCEL_ENV === 'production') throw new RateLimitUnavailableError();
}

/** Reserve a signed Web Resend event with a short processing lease. */
export async function claimResendWebhookEvent(eventId: string): Promise<ResendWebhookClaim> {
  const token = crypto.randomUUID();
  assertRedisAvailable();
  if (!redis) return { status: 'claimed', token };

  const result = await redis.eval<[string, number], string>(
    `local current = redis.call('GET', KEYS[1])
if current == 'processed' then return 'already_processed' end
if current then return 'in_progress' end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 'claimed'`,
    [await getWebhookKey(eventId)],
    [`processing:${token}`, PROCESSING_SECONDS],
  );

  if (result === 'claimed') return { status: 'claimed', token };
  if (result === 'already_processed' || result === 'in_progress') return { status: result };
  throw new Error('Resend webhook claim returned an invalid state');
}

/** Mark a fully handled event terminal before acknowledging it. */
export async function completeResendWebhookEvent(eventId: string, token: string): Promise<void> {
  assertRedisAvailable();
  if (!redis) return;

  const result = await redis.eval<[string, string, number], number>(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`,
    [await getWebhookKey(eventId)],
    [`processing:${token}`, 'processed', RESEND_WEBHOOK_PROCESSED_SECONDS],
  );
  if (result !== 1) throw new Error('Resend webhook processing lease is no longer owned');
}

/** Release only a failed processing lease owned by this invocation. */
export async function releaseResendWebhookEvent(eventId: string, token: string): Promise<void> {
  assertRedisAvailable();
  if (!redis) return;

  await redis.eval<[string], number>(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`,
    [await getWebhookKey(eventId)],
    [`processing:${token}`],
  );
}
