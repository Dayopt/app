import type { TimeblockDestination } from '../domain/timeblock-destination';

export const TIMEBLOCK_PARAM = 'timeblock';

/** `plan:{id}` / `record:{id}` を分解する。 */
export function parseTimeblockParam(
  param: string,
): { timeblockId: string; kind: TimeblockDestination } | null {
  if (param.startsWith('plan:') && param.length > 5) {
    return { timeblockId: param.slice(5), kind: 'plan' };
  }
  if (param.startsWith('record:') && param.length > 7) {
    return { timeblockId: param.slice(7), kind: 'record' };
  }
  return null;
}

/** インスペクターURLの値を既存契約に合わせて生成する。 */
export function serializeTimeblockParam(timeblockId: string, kind: TimeblockDestination): string {
  return `${kind}:${timeblockId}`;
}
