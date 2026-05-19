/**
 * 共有カレンダーコンポーネントのメインエクスポート（実利用 API のみ）
 */

// ===== UIコンポーネント =====
// DateDisplay - 日付表示
export type * from './DateDisplay';
export { DateDisplay } from './DateDisplay';

// ドラッグ選択レイヤー（DateTimeSelection 型のみ外部参照あり）
export type { DateTimeSelection } from './components/CalendarDragSelection';

// ===== カスタムフック =====
export { useEntryStyles } from './hooks/useEntryStyles';

// 統合カスタムフック
export { useCurrentPeriod } from './hooks/useCurrentPeriod';
export { useDateUtilities } from './hooks/useDateUtilities';
export { useEntriesByDate } from './hooks/useEntriesByDate';
export { useMultiDayEntryPositions } from './hooks/useMultiDayEntryPositions';

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
export { sortEventsByDateKeys } from './utils/entrySorting';

// ===== 型定義（centralized types/ から re-export） =====
export type * from '../../../types/base.types';
export type * from '../../../types/entry.types';
export type * from '../../../types/grid.types';
export type * from '../../../types/view.types';
