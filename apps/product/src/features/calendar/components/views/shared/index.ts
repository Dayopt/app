/**
 * 共有カレンダーコンポーネントのメインエクスポート（実利用 API のみ）
 */

// ===== UIコンポーネント =====
// DateDisplay - 日付表示
export type * from './DateDisplay';
export { DateDisplay } from './DateDisplay';

// ドラッグ選択レイヤー（DateTimeSelection 型のみ外部参照あり）
export type { DateTimeSelection } from './components/CalendarDragSelection';

// ===== 統合カスタムフック =====
export { useCurrentPeriod } from './hooks/useCurrentPeriod';
export { useDateUtilities } from './hooks/useDateUtilities';
export { useMultiDayTimeblockPositions } from './hooks/useMultiDayTimeblockPositions';
export { useTimeblocksByDate } from './hooks/useTimeblocksByDate';

// ===== レイアウト =====
export {
  CalendarDateHeader,
  ScrollableCalendarLayout,
} from './components/ScrollableCalendarLayout';

// ===== ユーティリティ関数 =====
export { getDateKey } from '@/lib/date';

// dateHelpers（カレンダー固有、isValidEvent のみ）
export { isValidEvent } from './utils/dateHelpers';

// entrySorting
export { sortEventsByDateKeys } from './utils/timeblockSorting';

// ===== 型定義（centralized types/ から re-export） =====
export type * from '../../../types/base.types';
export type * from '../../../types/grid.types';
export type * from '../../../types/timeblock.types';
export type * from '../../../types/view.types';
