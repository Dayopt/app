/**
 * ベースビュー型定義
 * 全カレンダービューで共通するプロパティ
 */

// CalendarEvent, ViewDateRange, CalendarViewType を Source of Truth から直接エクスポート
export type { CalendarEvent, CalendarViewType, ViewDateRange } from './calendar.types';
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

  // Entry handlers（最小限）
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
  allEntries?: CalendarEvent[] | undefined;

  // Display options
  showWeekends?: boolean | undefined;
  /** compare の差分 Rail を表示する */
  showActualDiff?: boolean | undefined;
  /** compare Rail に出ている entry の ID 一覧 */
  dayDiffEntryIds?: ReadonlySet<string> | undefined;

  /** DnDを無効化するエントリID（Inspector表示中のエントリなど） */
  disabledEntryId?: string | null | undefined;

  // Entry handlers（グリッド操作用）
  onUpdateEntry?:
    | ((
        entryIdOrEntry: string | CalendarEvent,
        updates?: {
          startTime: Date;
          endTime: Date;
          resetActualTime?: boolean;
        },
      ) => void | Promise<void> | Promise<{ skipToast: true } | void>)
    | undefined;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;

  // Navigation handlers
  onViewChange?: ((viewType: CalendarViewType) => void) | undefined;
  onNavigatePrev?: (() => void) | undefined;
  onNavigateNext?: (() => void) | undefined;
  onNavigateToday?: (() => void) | undefined;
}

/**
 * エントリ位置情報の基本型
 * 4箇所で重複していた EntryPosition を統一
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
