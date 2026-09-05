'use client';

import { useEffect } from 'react';

import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import { useReportActivityDetail } from '../../hooks/useReportActivityDetail';
import { useReportDetailStore } from '../../stores/useReportDetailStore';
import { ReportDetailPanel } from './ReportDetailPanel';

import type { ReportGranularity } from '../../lib/report-period';
import type { ReportDetailTarget } from '../../stores/useReportDetailStore';

interface ConnectedReportDetailPanelProps {
  anchorDate: string;
  granularity: ReportGranularity;
  /** 最初の箱の日をカレンダー（日ビュー）で開く。Composition Bridge の `onJumpToDay`。 */
  onOpenCalendarDay: (dayKey: string) => void;
}

/**
 * 詳細パネルの配線（store + query）。
 *
 * **`ReportBody` からではなく Composition Bridge から描く。** この component は tRPC query を
 * 持つので、`ReportBody` の中に置くと `/report` 以外（単体 test・Storybook）から描いた時に
 * context を要求してしまう（#2580 で踏んだ落とし穴）。章 → パネルの受け渡しは
 * `useReportDetailStore` が担うので、`ReportBody` は store の action を呼ぶだけで済む。
 *
 * 見た目は `ReportDetailPanel`（純粋な表示）に閉じており、Story はそちらに書く。
 */
export function ConnectedReportDetailPanel({
  anchorDate,
  granularity,
  onOpenCalendarDay,
}: ConnectedReportDetailPanelProps) {
  const isOpen = useReportDetailStore((state) => state.isOpen);
  const target = useReportDetailStore((state) => state.target);

  // `/report` を離れたら閉じる。**store は shell の 4 カラム目の開閉も握っている**ので、
  // 開いたままカレンダーへ移ると、中身の無い 250px の帯がカレンダー側に残る
  // （パネル本体はこの component と一緒に unmount されるが、幅は shell が持つため）。
  useEffect(() => () => useReportDetailStore.getState().close(), []);

  // **閉じている間は query を持つ component ごとマウントしない。** `enabled: false` で
  // 済ませると hook は呼ばれるので、`/report` を描くだけで tRPC context が要る形になる
  // （`ReportViewClient` の単体 test がそれで落ちた）。開いた時だけ配線する。
  if (!isOpen || target === null) return null;

  return (
    <OpenReportDetailPanel
      anchorDate={anchorDate}
      granularity={granularity}
      onOpenCalendarDay={onOpenCalendarDay}
      target={target}
    />
  );
}

function OpenReportDetailPanel({
  anchorDate,
  granularity,
  onOpenCalendarDay,
  target,
}: ConnectedReportDetailPanelProps & { target: ReportDetailTarget }) {
  const close = useReportDetailStore((state) => state.close);
  // 明細の時刻・曜日・ジャンプ先の日付は、ブラウザのローカルではなくユーザー設定の timezone で切る
  const timezone = useUserPreferences((state) => state.timezone);
  const { data, isPending, isError } = useReportActivityDetail({
    activityId: target.activityId,
    anchorDate,
    granularity,
    enabled: true,
  });

  return (
    <ReportDetailPanel
      categoryName={target.categoryName}
      color={target.color}
      detail={data}
      granularity={granularity}
      isError={isError}
      isPending={isPending}
      name={target.name}
      onClose={close}
      onOpenCalendarDay={onOpenCalendarDay}
      timezone={timezone}
    />
  );
}
