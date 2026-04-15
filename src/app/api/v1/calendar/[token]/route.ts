/**
 * iCalフィード API
 *
 * GET /api/v1/calendar/{token}.ics
 *
 * 秘密トークンURLでユーザーのエントリをiCalendar形式で返却。
 * Google Calendar等で「URLで追加」して購読可能。
 *
 * 認証: トークンベース（Cookie/JWT不要、RLSバイパス）
 */

import { NextRequest, NextResponse } from 'next/server';

import { entriesToICal } from '@/features/entry';
import { logger } from '@/lib/logger';
import { icalFeedRateLimit } from '@/lib/rate-limit/upstash';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

/**
 * トークンからユーザーIDを取得
 */
async function getUserIdByToken(token: string): Promise<string | null> {
  const supabase = createServiceRoleClient();

  // ical_feed_tokenは生成型に未反映のため filter で直接クエリ
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('ical_feed_token' as never, token)
    .single();

  if (error || !data) return null;
  return (data as Record<string, unknown>).user_id as string;
}

/**
 * ユーザーのエントリを取得（タグ名含む）
 */
async function getEntriesForFeed(userId: string) {
  const supabase = createServiceRoleClient();

  // 過去90日〜未来90日のエントリを取得
  const now = new Date();
  const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: entries, error } = await supabase
    .from('entries')
    .select(
      `
      id,
      title,
      description,
      start_time,
      end_time,
      created_at,
      updated_at,
      tag_id,
      tags!entries_tag_id_fkey(name)
    `,
    )
    .eq('user_id', userId)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null)
    .gte('start_time', past)
    .lte('start_time', future)
    .order('start_time', { ascending: true })
    .limit(1000);

  if (error) {
    logger.error('[iCal Feed] entries fetch error', error);
    return [];
  }

  // tags リレーションからタグ名を抽出
  return (entries ?? []).map((entry) => {
    const tags = entry.tags as unknown as { name: string } | null;
    const tagName = tags?.name ?? null;
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      start_time: entry.start_time,
      end_time: entry.end_time,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      tag_name: tagName,
    };
  });
}

/**
 * UUIDv4形式かどうかの簡易バリデーション
 */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * per-token インメモリレート制限（Upstash未設定時のフォールバック）
 *
 * Vercel Serverless では関数インスタンスが再利用される間だけ有効。
 */
const TOKEN_RATE_LIMIT = 10;
const TOKEN_RATE_WINDOW_MS = 60 * 1000;
const tokenRequestLog = new Map<string, number[]>();

function isRateLimitedInMemory(token: string): boolean {
  const now = Date.now();
  const timestamps = tokenRequestLog.get(token) ?? [];
  const recent = timestamps.filter((t) => now - t < TOKEN_RATE_WINDOW_MS);
  recent.push(now);
  tokenRequestLog.set(token, recent);

  // メモリリーク防止: 古いエントリを定期的にクリーン
  if (tokenRequestLog.size > 1000) {
    for (const [key, ts] of tokenRequestLog) {
      if (ts.every((t) => now - t > TOKEN_RATE_WINDOW_MS)) {
        tokenRequestLog.delete(key);
      }
    }
  }

  return recent.length > TOKEN_RATE_LIMIT;
}

/**
 * Upstash優先 → インメモリフォールバックのレート制限チェック
 */
async function checkRateLimit(token: string): Promise<{
  limited: boolean;
  retryAfter?: string;
  headers?: Record<string, string>;
}> {
  // Upstash が有効な場合はそちらを使用
  if (icalFeedRateLimit) {
    try {
      const { success, limit, remaining, reset } = await icalFeedRateLimit.limit(`ical:${token}`);
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000).toString();
        return {
          limited: true,
          retryAfter,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': retryAfter,
          },
        };
      }
      return { limited: false };
    } catch (error) {
      // Redis障害時はインメモリにフォールバック（可用性優先）
      logger.warn('[iCal Feed] Upstash rate limit failed, falling back to in-memory', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // インメモリフォールバック
  if (isRateLimitedInMemory(token)) {
    return { limited: true, retryAfter: '60' };
  }
  return { limited: false };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;

  // .ics 拡張子を除去
  const token = rawToken.replace(/\.ics$/, '');

  // UUIDバリデーション
  if (!isValidUUID(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // per-token レート制限（Upstash優先、インメモリフォールバック）
  const rateLimit = await checkRateLimit(token);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: rateLimit.headers ?? { 'Retry-After': rateLimit.retryAfter ?? '60' },
      },
    );
  }

  // トークンでユーザー特定
  const userId = await getUserIdByToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // エントリ取得 → iCal変換
  const entries = await getEntriesForFeed(userId);
  const ical = entriesToICal(entries);

  return new NextResponse(ical, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="dayopt.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
