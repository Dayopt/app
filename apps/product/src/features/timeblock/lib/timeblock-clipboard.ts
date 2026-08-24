import type { TimeblockDestination } from '../domain/timeblock-destination';

export interface ClipboardTimeblock {
  kind: TimeblockDestination;
  title: string;
  description: string | null;
  duration: number;
  startHour: number;
  startMinute: number;
  activityId: string | null | undefined;
}

interface ClipboardTimeblockSource {
  kind: TimeblockDestination;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  activityId?: string | null | undefined;
}

/** Timeblock の種別と表示内容だけをコピーし、IDやPlan関連は持ち込まない。 */
export function createClipboardTimeblock({
  kind,
  title,
  description,
  startAt,
  endAt,
  activityId,
}: ClipboardTimeblockSource): ClipboardTimeblock {
  return {
    kind,
    title,
    description,
    duration: (endAt.getTime() - startAt.getTime()) / 60_000,
    startHour: startAt.getHours(),
    startMinute: startAt.getMinutes(),
    activityId,
  };
}
