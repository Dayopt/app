export type TimeblockDestination = 'plan' | 'log';

/** 保存先はユーザー選択ではなく終了時刻だけから決める。 */
export function resolveTimeblockDestination(
  endAt: Date | string,
  now: Date = new Date(),
): TimeblockDestination {
  return new Date(endAt).getTime() > now.getTime() ? 'plan' : 'log';
}

/** 過去 Plan は title / tag / note だけ編集でき、時間は凍結する。 */
export function isPlanTimeEditable(endAt: Date | string, now: Date = new Date()): boolean {
  return new Date(endAt).getTime() > now.getTime();
}

/** Plan を Log レーンへ落とす操作は記録化として扱う。 */
export function isPlanRecordDrop(
  sourceLane: TimeblockDestination,
  targetLane: TimeblockDestination,
): boolean {
  return sourceLane === 'plan' && targetLane === 'log';
}
