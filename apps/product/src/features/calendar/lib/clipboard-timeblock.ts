import { convertToTimezone } from '@/lib/date/timezone';

import type { ClipboardTimeblock } from '../stores/useTimeblockClipboardStore';

interface ClipboardTimeblockSource {
  title: string;
  note: string | null | undefined;
  tagId: string | null | undefined;
  startAt: Date | string;
  endAt: Date | string;
}

/** 予定・記録の表示内容だけを Dayopt 内クリップボードへ変換する。 */
export function buildClipboardTimeblock(
  source: ClipboardTimeblockSource,
  timezone: string,
): ClipboardTimeblock {
  const startAt = source.startAt instanceof Date ? source.startAt : new Date(source.startAt);
  const endAt = source.endAt instanceof Date ? source.endAt : new Date(source.endAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error('Invalid timeblock datetime');
  }

  const duration = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60000));
  const zonedStartAt = convertToTimezone(startAt, timezone);

  return {
    title: source.title,
    description: source.note ?? null,
    duration,
    startHour: zonedStartAt.getHours(),
    startMinute: zonedStartAt.getMinutes(),
    tagId: source.tagId,
  };
}
