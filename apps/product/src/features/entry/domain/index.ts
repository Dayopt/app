export {
  determineEntryOrigin,
  getActualMinutes,
  getActualRange,
  getDiffMinutes,
  getPlannedMinutes,
  getPlannedRange,
  hasPlannedActualDiff,
  isPlannedEntry,
  isUnplannedEntry,
} from './entry-time-model';
export type { EntryLike, TimeRange } from './entry-time-model';

export {
  buildTimeUpdateData,
  buildUndoTimeUpdateData,
  hasActualRangeDiff,
  rangesMatch,
} from './entry-time-update';
export type { EntryTimeUpdateData } from './entry-time-update';
