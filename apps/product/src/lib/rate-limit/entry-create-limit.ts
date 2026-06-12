/**
 * エントリ作成の日次レート制限
 *
 * Upstash が設定されていればそちら、fallback としてプロセスメモリ内の
 * sliding window を使用。`entry router` から利用される。
 *
 * router 層から service-層へ business logic を剥がす整理（P2-3）の一環。
 * in-memory fallback は単一 instance 限定で、serverless では隣 instance の
 * 発行回数を認識できないため、本番は必ず Upstash を設定する前提。
 *
 * @see src/lib/rate-limit/upstash.ts — Upstash 初期化と entryCreateRateLimit の定義
 */

import { entryCreateRateLimit } from './upstash';

const DAILY_LIMIT = 500;
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** user 数が膨らんだ時に古い user の timestamp 配列を掃除する閾値 */
const PRUNE_THRESHOLD = 5000;

/** in-memory fallback 用の per-user timestamp 記録 */
const inMemoryLog = new Map<string, number[]>();

/**
 * user 単位の「直近 24 時間の entry 作成数が上限を超えているか」を判定する。
 *
 * 戻り値が true の時は router 側で TOO_MANY_REQUESTS を返す想定。
 */
export async function isEntryCreateLimited(userId: string): Promise<boolean> {
  // Upstash が有効な場合は prefer
  if (entryCreateRateLimit) {
    try {
      const { success } = await entryCreateRateLimit.limit(userId);
      return !success;
    } catch {
      // Redis 側の一時的失敗は in-memory fallback に降りる
    }
  }

  const now = Date.now();
  const timestamps = inMemoryLog.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  inMemoryLog.set(userId, recent);

  // map が肥大化しないよう old user を定期 prune
  if (inMemoryLog.size > PRUNE_THRESHOLD) {
    for (const [key, ts] of inMemoryLog) {
      if (ts.every((t) => now - t > WINDOW_MS)) {
        inMemoryLog.delete(key);
      }
    }
  }

  return recent.length > DAILY_LIMIT;
}
