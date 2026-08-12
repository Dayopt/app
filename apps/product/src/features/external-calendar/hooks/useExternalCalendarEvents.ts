'use client';

import { useMemo } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';

/**
 * calendar 画面が ghost として描く外部予定。
 *
 * 変換前の外部予定を calendar（Layer 2）へ渡す唯一の口。ミラーの行形ではなく描画に必要な形へ
 * ここで畳む（adapter は source 側、consumer は barrel 経由という DAG の分担）。
 */
export interface ExternalCalendarEvent {
  id: string;
  /** 空タイトルは provider 側で起こりうる。フォールバックは表示側が持つ。 */
  title: string | null;
  calendarName: string | null;
  startDate: Date;
  endDate: Date;
}

interface UseExternalCalendarEventsOptions {
  /** ユーザー TZ の範囲開始（UTC ISO）。calendar の `dateFilter` をそのまま渡す。 */
  startDate: string;
  /** ユーザー TZ の範囲終了（UTC ISO）。 */
  endDate: string;
}

interface UseExternalCalendarEventsResult {
  events: ExternalCalendarEvent[];
  isLoading: boolean;
}

function toExternalCalendarEvent(event: {
  id: string;
  title: string | null;
  calendarName: string | null;
  startAt: string;
  endAt: string;
}): ExternalCalendarEvent {
  const title = event.title?.trim();
  return {
    id: event.id,
    title: title ? title : null,
    calendarName: event.calendarName,
    startDate: new Date(event.startAt),
    endDate: new Date(event.endAt),
  };
}

/**
 * 表示範囲に重なる外部予定を取得する。
 *
 * 接続の有無を先に確かめると waterfall になるので、`enabled` ゲートは置かず常に撃つ。未接続の
 * ユーザーには `(user_id, start_at, end_at)` index で即 0 件が返る。`staleTime` は cron の同期
 * 間隔（15 分）に対して 5 分。
 *
 * **失敗しても calendar 全体を落とさない**（ghost を描かないだけ）。plans / records が健全なのに
 * 外部予定の失敗で画面を潰すのは、ghost が主データではないという位置づけと矛盾する。エラー自体は
 * server 側の tRPC capture 経路が Sentry へ送るので、ここで握り潰すのは描画だけ。
 *
 * **エラー時は必ず空配列にする**（前回成功時の `data` にフォールバックしない）。TanStack Query は
 * refetch が失敗しても直前の成功 `data` を保持し続けるため、`data ?? []` のままだと
 * `proProcedure` の課金ゲートが `FORBIDDEN` を返すようになった後も解約前の外部予定を描画し続ける
 * （fail closed。`apps/product/src/AGENTS.md` EXT-1）。
 */
export function useExternalCalendarEvents({
  startDate,
  endDate,
}: UseExternalCalendarEventsOptions): UseExternalCalendarEventsResult {
  const { data, isError, isLoading } = api.externalCalendar.listEvents.useQuery(
    { startDate, endDate },
    { staleTime: CACHE_5_MINUTES, retry: false },
  );

  const events = useMemo(
    () => (isError ? [] : (data ?? []).map(toExternalCalendarEvent)),
    [data, isError],
  );

  return { events, isLoading };
}
