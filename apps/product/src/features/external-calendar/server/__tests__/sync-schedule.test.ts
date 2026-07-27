import { describe, expect, it } from 'vitest';

import { DUE_STALENESS_MS, isDailyFullSyncSlot } from '../sync-schedule';

const CONNECTION_A = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_B = '00000000-0000-4000-8000-0000000000b2';

/** 指定 UTC 分（0..1439）の Date。 */
function atUtcMinute(minute: number): Date {
  return new Date(Date.UTC(2026, 6, 24, Math.floor(minute / 60), minute % 60, 0));
}

/** 1 日 96 スロットのうち、その接続が true になるスロット数。 */
function trueSlotCount(connectionId: string): number {
  let count = 0;
  for (let slot = 0; slot < 96; slot += 1) {
    if (isDailyFullSyncSlot(connectionId, atUtcMinute(slot * 15))) count += 1;
  }
  return count;
}

describe('isDailyFullSyncSlot', () => {
  it('決定的（同じ入力なら同じ結果）', () => {
    const now = atUtcMinute(3 * 60);
    expect(isDailyFullSyncSlot(CONNECTION_A, now)).toBe(isDailyFullSyncSlot(CONNECTION_A, now));
  });

  it('各接続は 1 日にちょうど 1 回だけ full resync スロットに当たる', () => {
    expect(trueSlotCount(CONNECTION_A)).toBe(1);
    expect(trueSlotCount(CONNECTION_B)).toBe(1);
  });

  it('接続ごとに割り当てスロットが分散する（同時 full resync を避ける）', () => {
    // 100 接続の割当スロットを集めて、1 スロットに偏りすぎないことを見る。
    const slots = new Map<number, number>();
    for (let index = 0; index < 100; index += 1) {
      const connectionId = `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
      for (let slot = 0; slot < 96; slot += 1) {
        if (isDailyFullSyncSlot(connectionId, atUtcMinute(slot * 15))) {
          slots.set(slot, (slots.get(slot) ?? 0) + 1);
          break;
        }
      }
    }
    // 100 接続が 1 スロットに集中していない（十分に散らばる）。
    expect(slots.size).toBeGreaterThan(30);
    const maxInOneSlot = Math.max(...slots.values());
    expect(maxInOneSlot).toBeLessThan(15);
  });

  it('スロット境界内の分では判定が変わらない（15 分刻み）', () => {
    // 同じ 15 分スロット内（例: 45分と59分）は同じ判定。
    const slotStart = atUtcMinute(45);
    const sameSlot = atUtcMinute(59);
    expect(isDailyFullSyncSlot(CONNECTION_A, slotStart)).toBe(
      isDailyFullSyncSlot(CONNECTION_A, sameSlot),
    );
  });

  it('DUE_STALENESS_MS は cron 間隔（15 分）より短い', () => {
    expect(DUE_STALENESS_MS).toBeLessThan(15 * 60 * 1000);
  });
});
