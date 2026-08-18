import {
  resolveTimeblockDestination,
  type TimeblockDestination,
} from '../domain/timeblock-destination';

export interface TimeblockDuplicateDraft {
  sourceId: string;
  kind: TimeblockDestination;
  title: string;
  note: string | null;
  tagId: string | null | undefined;
  activityId?: string | null | undefined;
  startAt: string;
  endAt: string;
}

interface CreateTimeblockDuplicateDraftArgs {
  sourceId: string;
  kind: TimeblockDestination;
  title: string;
  note: string | null;
  tagId: string | null | undefined;
  activityId?: string | null | undefined;
  startAt: Date;
  endAt: Date;
}

interface TimeblockDuplicateEditorValue {
  note: string;
  tagId: string | null;
  activityId?: string | null;
  startAt: Date;
  endAt: Date;
}

export type TimeblockDuplicateValidationReason =
  'invalidRange' | 'planRequiresFuture' | 'recordRequiresPast';

interface TimeblockDuplicateCreateInput {
  title: string;
  note?: string | undefined;
  tagId?: string | undefined;
  activityId?: string | undefined;
  start_at: string;
  end_at: string;
}

/** IDやPlan関係を含まない、独立複製用の下書きを作る。 */
export function createTimeblockDuplicateDraft({
  sourceId,
  kind,
  title,
  note,
  tagId,
  activityId,
  startAt,
  endAt,
}: CreateTimeblockDuplicateDraftArgs): TimeblockDuplicateDraft {
  return {
    sourceId,
    kind,
    title,
    note,
    tagId,
    activityId,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

/** 複製先の日時変更とPlan / Recordの時間制約を検証する。 */
export function getTimeblockDuplicateValidationReason(
  draft: TimeblockDuplicateDraft,
  value: TimeblockDuplicateEditorValue,
  now: Date = new Date(),
): TimeblockDuplicateValidationReason | null {
  if (value.startAt >= value.endAt) return 'invalidRange';

  const temporalKind = resolveTimeblockDestination(value.endAt, now);
  if (temporalKind !== draft.kind) {
    return draft.kind === 'plan' ? 'planRequiresFuture' : 'recordRequiresPast';
  }

  return null;
}

/** 複製下書きを既存create mutationの入力へ変換する。元IDとplan_idは含めない。 */
export function buildTimeblockDuplicateCreateInput(
  draft: TimeblockDuplicateDraft,
  value: TimeblockDuplicateEditorValue,
): TimeblockDuplicateCreateInput {
  const note = value.note.trim();

  return {
    title: draft.title,
    ...(note ? { note } : {}),
    ...(value.tagId ? { tagId: value.tagId } : {}),
    ...(value.activityId ? { activityId: value.activityId } : {}),
    start_at: value.startAt.toISOString(),
    end_at: value.endAt.toISOString(),
  };
}
