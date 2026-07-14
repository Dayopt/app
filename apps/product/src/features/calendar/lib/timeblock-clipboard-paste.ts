import type { ClipboardTimeblock, TimeblockDestination } from '@/features/timeblock';
import { resolveTimeblockDestination } from '@/features/timeblock';
import { localTimeToUTCISO } from '@/lib/date/timezone';

interface ResolveTimeblockPasteArgs {
  copiedTimeblock: ClipboardTimeblock;
  targetDate: Date;
  timezone: string;
  now?: Date;
}

interface TimeblockPasteInput {
  title: string;
  note?: string | undefined;
  tagId?: string | undefined;
  start_at: string;
  end_at: string;
}

export type TimeblockPasteResult =
  | { ok: true; kind: TimeblockDestination; input: TimeblockPasteInput }
  | { ok: false; reason: 'planRequiresFuture' | 'recordRequiresPast' };

/** コピー元の種別を維持し、IDやplan_idを含めない新規作成入力へ変換する。 */
export function resolveTimeblockClipboardPaste({
  copiedTimeblock,
  targetDate,
  timezone,
  now = new Date(),
}: ResolveTimeblockPasteArgs): TimeblockPasteResult {
  const startAt = localTimeToUTCISO(
    targetDate,
    copiedTimeblock.startHour,
    copiedTimeblock.startMinute,
    timezone,
  );
  const endAt = new Date(
    new Date(startAt).getTime() + copiedTimeblock.duration * 60_000,
  ).toISOString();
  const temporalKind = resolveTimeblockDestination(endAt, now);

  if (temporalKind !== copiedTimeblock.kind) {
    return {
      ok: false,
      reason: copiedTimeblock.kind === 'plan' ? 'planRequiresFuture' : 'recordRequiresPast',
    };
  }

  return {
    ok: true,
    kind: copiedTimeblock.kind,
    input: {
      title: copiedTimeblock.title,
      ...(copiedTimeblock.description ? { note: copiedTimeblock.description } : {}),
      ...(copiedTimeblock.tagId ? { tagId: copiedTimeblock.tagId } : {}),
      start_at: startAt,
      end_at: endAt,
    },
  };
}
