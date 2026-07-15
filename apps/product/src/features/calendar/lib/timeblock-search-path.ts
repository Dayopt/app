import { formatInTimeZone } from 'date-fns-tz';

import {
  serializeTimeblockParam,
  TIMEBLOCK_PARAM,
  type TimeblockDestination,
} from '@/features/timeblock';

/** 検索結果を対象日の Calendar day view とインスペクターへ接続する。 */
export function buildTimeblockSearchResultPath({
  locale,
  startAt,
  timezone,
  timeblockId,
  kind,
}: {
  locale: string;
  startAt: string;
  timezone: string;
  timeblockId: string;
  kind: TimeblockDestination;
}): string {
  const params = new URLSearchParams();
  params.set('date', formatInTimeZone(new Date(startAt), timezone, 'yyyy-MM-dd'));
  params.set(TIMEBLOCK_PARAM, serializeTimeblockParam(timeblockId, kind));
  return `/${locale}/day?${params.toString()}`;
}
