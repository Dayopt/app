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
import { createServiceRoleClient } from '@/platform/supabase/oauth';

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
      recurrence_rule,
      created_at,
      updated_at,
      entry_tags(tags(name))
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

  // entry_tagsリレーションからタグ名を抽出
  return (entries ?? []).map((entry) => {
    const entryTags = entry.entry_tags as Array<{ tags: { name: string } | null }> | undefined;
    const tagName = entryTags?.[0]?.tags?.name ?? null;
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      start_time: entry.start_time,
      end_time: entry.end_time,
      recurrence_rule: entry.recurrence_rule,
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
