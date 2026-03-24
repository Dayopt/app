import type { DateRangeFilter } from '@/lib/date';
import type { BaseFilterState } from './createFilterStore';
import { createFilterStore } from './createFilterStore';

/** エントリステータス（時間位置から自動判定） */
type EntryStatus = 'open' | 'closed';

/**
 * リマインダーフィルタータイプ
 */
export type ReminderFilter = 'all' | 'yes' | 'no';

/**
 * スケジュールフィルタータイプ
 */
export type ScheduleFilter = 'all' | 'scheduled' | 'unscheduled';

// DateRangeFilter は @/lib/date から再エクスポート
export type { DateRangeFilter };

/**
 * Entry フィルタ状態
 */
interface EntryFilterState extends BaseFilterState {
  status: EntryStatus[];
  tags: string[];
  search: string;
  assignee: string;
  reminder: ReminderFilter;
  schedule: ScheduleFilter;
  createdAt: DateRangeFilter;
  updatedAt: DateRangeFilter;
}

/**
 * Entry フィルタストア
 *
 * Board/Table間でフィルター状態を共有
 * LocalStorageで永続化
 */
/** エントリフィルターストア（Board/Table間の共有、LocalStorage永続化） */
export const useEntryFilterStore = createFilterStore<EntryFilterState>({
  name: 'plan-filter',
  initialState: {
    status: [],
    tags: [],
    search: '',
    assignee: '',
    reminder: 'all',
    schedule: 'all',
    createdAt: 'all',
    updatedAt: 'all',
    isSearchOpen: false,
  },
});
