/**
 * ベースビュー型定義
 * 全カレンダービューで共通するプロパティ
 */

// CalendarEvent, ViewDateRange, CalendarViewType を Source of Truth から直接エクスポート
export type { CalendarEvent, CalendarViewType, ViewDateRange } from './calendar.types';
import type { ExternalCalendarEvent } from '@/features/external-calendar';

import type { DateTimeSelection } from '../components/views/shared';
import type { CalendarEvent, CalendarViewType, ViewDateRange } from './calendar.types';

/**
 * 全ビューで共通する最小限のプロパティ
 * リスト表示ビュー向け
 */
interface BaseViewProps {
  // Core data
  entries: CalendarEvent[];
  currentDate: Date;

  // Display options
  className?: string | undefined;

  // Timeblock handlers（最小限）
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, mouseEvent: React.MouseEvent) => void) | undefined;
}

/**
 * 時間グリッドビュー用の拡張プロパティ
 * DayView, MultiDayView(3day/5day), WeekView向け
 */
export interface GridViewProps extends BaseViewProps {
  // Core data
  dateRange: ViewDateRange;
  /** 全エントリ（期限切れ未完了表示用、日付フィルタリング前） */
  allTimeblocks?: CalendarEvent[] | undefined;
  /**
   * 外部カレンダーの未変換予定（ghost、#1962）。読み取り専用で `entries` とは別に持つ。
   * plan / record と違い DB の EXCLUDE 制約が無いため重なり、座標計算も別系統になる。
   */
  externalEvents?: ExternalCalendarEvent[] | undefined;

  // Display options
  showWeekends?: boolean | undefined;
  /** compare の差分 Rail を表示する */
  showActualDiff?: boolean | undefined;
  /** compare Rail に出ている entry の ID 一覧 */
  dayDiffEntryIds?: ReadonlySet<string> | undefined;

  /** DnDを無効化するTimeblock ID（Inspector表示中のエントリなど） */
  disabledTimeblockId?: string | null | undefined;

  // Timeblock handlers（グリッド操作用）
  onUpdateEntry?:
    | ((
        timeblockIdOrTimeblock: string | CalendarEvent,
        updates?: {
          startTime: Date;
          endTime: Date;
          resetActualTime?: boolean;
        },
      ) => void | Promise<void> | Promise<{ skipToast: true } | void>)
    | undefined;
  onDeleteTimeblock?: ((timeblockId: string) => void) | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;

  // Navigation handlers
  onViewChange?: ((viewType: CalendarViewType) => void) | undefined;
  onNavigatePrev?: (() => void) | undefined;
  onNavigateNext?: (() => void) | undefined;
  onNavigateToday?: (() => void) | undefined;
}

/**
 * エントリ位置情報の基本型
 * 4箇所で重複していた TimeblockPosition を統一
 */
export interface BaseEntryPosition {
  plan: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  column: number;
  totalColumns: number;
}
