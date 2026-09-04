export type TimeblockDestination = 'plan' | 'record';

/** 保存先はユーザー選択ではなく終了時刻だけから決める。 */
export function resolveTimeblockDestination(
  endAt: Date | string,
  now: Date = new Date(),
): TimeblockDestination {
  return new Date(endAt).getTime() > now.getTime() ? 'plan' : 'record';
}

/** Plan を Record レーンへ落とす操作は記録化として扱う。 */
export function isPlanRecordDrop(
  sourceLane: TimeblockDestination,
  targetLane: TimeblockDestination,
): boolean {
  return sourceLane === 'plan' && targetLane === 'record';
}
