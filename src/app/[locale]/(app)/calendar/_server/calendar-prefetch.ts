import { headers } from 'next/headers';

import type { CalendarViewType } from '@/features/calendar';
import { calculateViewDateRange } from '@/features/calendar';
import { logger } from '@/lib/logger';
import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

/**
 * ローカル日付の 00:00:00 を UTC midnight として正規化した ISO 文字列を生成
 *
 * サーバー(UTC)とクライアント(JST等)で同じローカル日付なら同じ文字列を返すため、
 * tRPC クエリキーが一致しキャッシュヒットが保証される。
 */
function toLocalDateUTCStart(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

/** ローカル日付の 23:59:59.999 を UTC midnight として正規化した ISO 文字列を生成 */
function toLocalDateUTCEnd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59:59.999Z`;
}

/**
 * タイムゾーン文字列を用いてサーバーの UTC 日時をユーザーのローカル日付に変換する。
 *
 * `new Date()` はサーバー上では UTC で評価されるため、ユーザーがタイムゾーンをまたぐ
 * 時間帯（例: UTC+9 深夜）では日付がズレる。
 * Intl.DateTimeFormat で UTC → ローカル日付部分を取得し、Date を再構成する。
 */
function toLocalDate(utcDate: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(utcDate);

    const year = Number(parts.find((p) => p.type === 'year')?.value ?? utcDate.getFullYear());
    const month = Number(parts.find((p) => p.type === 'month')?.value ?? utcDate.getMonth() + 1);
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? utcDate.getDate());

    return new Date(year, month - 1, day);
  } catch {
    // 不正なタイムゾーン文字列の場合は UTC をそのまま使用
    return utcDate;
  }
}

/**
 * カレンダービュー用 prefetch（day/week/Nday）
 *
 * ビュータイプに応じた日付範囲でプランデータを事前取得し、
 * クライアントでのデータ取得を高速化する。
 *
 * 認証エラー（ログアウト直後等）ではprefetchをスキップし、
 * 空のdehydratedStateを返す。クライアント側で再取得される。
 */
export async function prefetchCalendarData(view: CalendarViewType, targetDate: Date) {
  const helpers = await createServerHelpers();

  // middleware が `user-tz` Cookie から転送した `x-user-timezone` ヘッダーを使用
  // targetDate が `new Date()` の場合はユーザーのローカル日付に補正する
  // 初回アクセス時（Cookie未設定）は UTC にフォールバック
  const headersList = await headers();
  const userTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const localTargetDate = toLocalDate(targetDate, userTimezone);

  // weekStartsOnはZustandストアなのでSSRではデフォルト値1（月曜日）を使用
  const viewDateRange = calculateViewDateRange(view, localTargetDate, 1);
  // toISOString()はTZ依存のためローカル日付をUTC normalizeして文字列化
  const dateFilter = {
    startDate: toLocalDateUTCStart(viewDateRange.start),
    endDate: toLocalDateUTCEnd(viewDateRange.end),
  };

  try {
    await Promise.all([
      helpers.entries.list.prefetch(dateFilter),
      helpers.entries.getTagStats.prefetch(),
      helpers.tags.list.prefetch(),
    ]);
  } catch (error) {
    // 認証エラー（UNAUTHORIZED）等の場合はprefetchをスキップ
    // クライアント側のtRPCがリトライ or 認証リダイレクトを処理する
    logger.warn('prefetchCalendarData failed (possibly unauthenticated):', error);
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
