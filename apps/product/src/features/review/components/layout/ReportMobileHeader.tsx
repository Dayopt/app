'use client';

import { isSameMonth } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Redo2, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppHeader } from '@/components/shell/AppHeader';
import { IconTabSwitcher } from '@/components/ui/navigation/IconTabSwitcher';
import { MobileMonthGrid } from '@/components/ui/navigation/MobileMonthGrid';
import { MobileYearStrip } from '@/components/ui/navigation/MobileYearStrip';
import { Button, cn } from '@dayopt/components';

import { formatReportMobilePeriod } from '../../lib/report-mobile-period-label';

import type { ReportGranularity } from '../../lib/report-period';

interface ReportMobileHeaderProps {
  periodStart: Date;
  periodEnd: Date;
  granularity: ReportGranularity;
  /**
   * 今日を含む期間から見てどちら側を見ているか。`current` の時は「今日へ」を出さない
   * （押しても何も起きないボタンを残さない。カレンダーの #2302 と同じ扱い）。
   */
  todayDirection: 'past' | 'current' | 'future';
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** ミニカレンダー内の粒度切替。渡さない時は粒度の行を出さない。 */
  onGranularityChange?: ((granularity: ReportGranularity) => void) | undefined;
  /**
   * ミニカレンダーで日付を選んだ時。選んだ日を含む期間へ移す
   * （粒度は変えない。週を見ていたら週のまま、その日の週へ動く）。
   * 渡さない時はミニカレンダー自体を出さない。
   */
  onDateSelect?: ((date: Date) => void) | undefined;
  /** カレンダーへ戻るトグルとアカウントボタン（Composition Layer が注入）。 */
  rightSlot?: React.ReactNode | undefined;
  /** Storybook / test 用。既定は畳んだ状態。 */
  defaultExpanded?: boolean | undefined;
}

/**
 * `/report` のヘッダー（モバイル）。
 *
 * カレンダーのモバイルヘッダー（`MobileCalendarHeader`）と**同じ作り**にする
 * （2026-09-07 User 指示）: 期間ラベルを押すと月グリッドがインライン展開し、本文を
 * 押し下げる。外側タップで閉じ、日付を選んでもパネルは閉じない（Google Calendar 準拠）。
 * 月グリッドと年ストリップは共有層の `MobileMonthGrid` / `MobileYearStrip` をそのまま
 * 使う（calendar と review は同層なので、共有層へ昇格させて 1 つの実体を共有する）。
 *
 * デスクトップ（`ReportHeader`）との違いは 3 つ:
 * - **`‹ 今週へ ›` を置かない**（2026-09-07 User 指示）。期間の移動は本文の左右スワイプ
 *   （`ReportViewClient` の `useSwipeGesture`）が担い、ヘッダーに残すのは「今日へ」の
 *   アイコン 1 つだけ。カレンダーのモバイルと同じ構成にする
 * - **粒度切替をヘッダーに置かず、ミニカレンダーの中へ入れる**（2026-09-07 User 裁可）。
 *   1 行に日付 + chevron + 今日 + カレンダー + アカウントが並ぶので、そこへ 3 択を足すと
 *   潰れる。「見る期間を変える」操作（日付選択と粒度）が展開パネルに集まる
 * - **期間ラベルが年を持たない**（年粒度を除く）。カレンダーのモバイルに揃える
 */
export function ReportMobileHeader({
  periodStart,
  periodEnd,
  granularity,
  todayDirection,
  onNavigate,
  onGranularityChange,
  onDateSelect,
  rightSlot,
  defaultExpanded,
}: ReportMobileHeaderProps) {
  const t = useTranslations('report');
  const tMobile = useTranslations('report.mobile');
  const tGranularity = useTranslations('report.granularity');
  const locale = useLocale();
  const dateFnsLocale = locale === 'ja' ? ja : enUS;

  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);
  // 外側タップで閉じる（カレンダー #2297 と同じ手当て）。ヘッダー + パネルを
  // まとめて包み、開いている間だけ document の pointerdown を監視する
  const containerRef = useRef<HTMLDivElement>(null);

  // グリッドのスワイプで独立に動く表示月。期間が別の月へ移ったら追従させる
  const [viewMonth, setViewMonth] = useState(() => periodStart);
  const [prevPeriodStart, setPrevPeriodStart] = useState(periodStart);
  if (!isSameMonth(periodStart, prevPeriodStart)) {
    setPrevPeriodStart(periodStart);
    setViewMonth(periodStart);
  } else if (periodStart !== prevPeriodStart) {
    setPrevPeriodStart(periodStart);
  }

  const expandable = onDateSelect !== undefined;

  useEffect(() => {
    if (!isExpanded) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (containerRef.current.contains(event.target)) return;
      setIsExpanded(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isExpanded]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // 日付を選んでもパネルは閉じない（Chevron か外側タップでのみ閉じる）
  const handleDateSelect = useCallback(
    (date: Date) => {
      onDateSelect?.(date);
    },
    [onDateSelect],
  );

  const handleViewMonthChange = useCallback(
    (nextMonth: Date) => {
      setViewMonth(nextMonth);
      onDateSelect?.(nextMonth);
    },
    [onDateSelect],
  );

  const label = formatReportMobilePeriod({
    granularity,
    periodStart,
    periodEnd,
    dateFnsLocale,
    // **`t()` ではなく `raw()`。** ここで引くのは表示文ではなく書式そのもの。
    // `{start}〜{end}` を `t()` に通すと next-intl が ICU メッセージとして解釈し、
    // 引数を渡していないのでパースに失敗してキー名（`report.mobile.…`）が返る。
    // `yyyy'年'` の `'…'` も ICU のエスケープと衝突する。
    // `MobileMonthGrid` が曜日配列を `raw()` で引いているのと同じ扱い
    patterns: {
      weekDay: tMobile.raw('periodFormat.weekDay') as string,
      weekDayShort: tMobile.raw('periodFormat.weekDayShort') as string,
      weekRange: tMobile.raw('periodFormat.weekRange') as string,
      month: tMobile.raw('periodFormat.month') as string,
      year: tMobile.raw('periodFormat.year') as string,
    },
  });

  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;
  // 過去を見ている: Redo（時間を進めて戻る）。未来: Undo（時間を戻す）。カレンダーと同じ
  const TodayIcon = todayDirection === 'past' ? Redo2 : Undo2;

  return (
    <div ref={containerRef} className="bg-background sticky top-0 z-20">
      <AppHeader
        rightSlot={
          <div className="flex h-8 items-center gap-1">
            {todayDirection !== 'current' && (
              <Button
                variant="ghost"
                icon
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate('today')}
                aria-label={t(`nav.current.${granularity}`)}
              >
                <TodayIcon className="size-5" />
              </Button>
            )}
            {rightSlot}
          </div>
        }
      >
        {/* 文字サイズはカレンダーのモバイル見出しに揃える（20px = text-xl） */}
        {expandable ? (
          <button
            type="button"
            onClick={handleToggle}
            // 44px のタッチターゲット。AppHeader の行は 32px だが、はみ出す 6px は
            // 透明なので見た目は動かず、当たり判定だけが広がる
            className="flex min-h-11 min-w-0 items-center gap-1"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? tMobile('closeMiniCalendar') : tMobile('openMiniCalendar')}
          >
            <h2 className="min-w-0 truncate text-xl">{label}</h2>
            <ChevronIcon className="text-muted-foreground size-5 shrink-0" />
          </button>
        ) : (
          <h2 className="min-w-0 truncate text-xl">{label}</h2>
        )}
      </AppHeader>

      {/* インライン展開パネル（カレンダーと同じ grid-rows アニメーション） */}
      {expandable ? (
        <div
          className={cn(
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- grid-template-rows の transition はトークンで表現不可
            'ease-standard grid transition-[grid-template-rows] duration-200',
            isExpanded ? 'grid-rows-expanded' : 'grid-rows-collapsed',
          )}
        >
          {/* 畳んでいてもパネルは DOM に残る（高さのアニメーションのため）。
              `inert` で塞がないと、見えていない粒度ボタンや日付に Tab で入れてしまう */}
          <div className="overflow-hidden" inert={!isExpanded}>
            <div>
              {/* 粒度はここに置く（ヘッダーには出さない）。パネルの中なら 44px の
                  タッチターゲットを持つセグメントがそのまま収まる */}
              {onGranularityChange ? (
                <div className="px-3 pt-2">
                  {/* デスクトップ Sidebar の「カレンダー / レポート」切替と同じ部品
                      （2026-09-07 User 指示）。面が変わっても帯タブの見た目は 1 つに保つ */}
                  <IconTabSwitcher
                    value={granularity}
                    onValueChange={onGranularityChange}
                    ariaLabel={tGranularity('ariaLabel')}
                    items={[
                      { value: 'week', label: tGranularity('week') },
                      { value: 'month', label: tGranularity('month') },
                      { value: 'year', label: tGranularity('year') },
                    ]}
                  />
                </div>
              ) : null}

              {/* 選択中の期間はレンジで示す。粒度が週・月・年のいずれでも、
                  いま数字を出している範囲がそのまま塗られる */}
              <MobileMonthGrid
                viewMonth={viewMonth}
                selectedDate={periodStart}
                displayRange={{ start: periodStart, end: periodEnd }}
                onViewMonthChange={handleViewMonthChange}
                onDateSelect={handleDateSelect}
                className="w-full"
              />
              <MobileYearStrip viewMonth={viewMonth} onViewMonthChange={handleViewMonthChange} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
