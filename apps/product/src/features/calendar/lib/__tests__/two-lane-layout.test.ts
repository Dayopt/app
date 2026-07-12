import { describe, expect, it } from 'vitest';

import type { PlanEvent, RecordEvent } from '@/features/timeblock';
import { calculateTwoLaneLayout, resolveTwoLaneFromPointer } from '../two-lane-layout';

const HOUR_HEIGHT = 60;

/**
 * `displayStartDate`/`displayEndDate` は `convertToTimezone`（`toZonedTime`）で
 * 既に対象タイムゾーンの wall-clock 値へ変換済みの Date を想定する。
 * `calculateTwoLaneLayout` はその wall-clock 値を `getHours()`/`getMinutes()`
 * （実行環境のローカル TZ 依存）で読むため、テストでは UTC ISO 文字列ではなく
 * ローカルコンポーネント指定の `new Date(y, m, d, h, min)` で構築する
 * （実行環境の TZ に関わらず意図した時刻を再現するため）。
 */
function localDate(hour: number, minute: number, day = 10): Date {
  return new Date(2026, 6, day, hour, minute, 0, 0);
}

function makePlan(overrides: Partial<PlanEvent> = {}): PlanEvent {
  const start = localDate(9, 0);
  const end = localDate(10, 0);
  return {
    id: 'plan-1',
    title: 'Deep Work',
    note: null,
    tagId: 'tag-1',
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    status: 'upcoming',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RecordEvent> = {}): RecordEvent {
  const start = localDate(9, 0);
  const end = localDate(10, 0);
  return {
    id: 'record-1',
    title: 'Deep Work',
    note: null,
    tagId: 'tag-1',
    planId: null,
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    fulfillmentScore: null,
    ...overrides,
  };
}

describe('calculateTwoLaneLayout', () => {
  it('Plan は左レーン(left=0)、Record は右レーン(left=planLaneWidthPercent)に配置する', () => {
    const result = calculateTwoLaneLayout({
      plans: [makePlan()],
      records: [makeRecord()],
      hourHeight: HOUR_HEIGHT,
    });

    expect(result.planLayouts[0]?.position.left).toBe(0);
    expect(result.planLayouts[0]?.position.width).toBe(38);
    expect(result.recordLayouts[0]?.position.left).toBe(38);
    expect(result.recordLayouts[0]?.position.width).toBe(62);
  });

  it('planLaneWidthPercent を変更するとレーン幅も追従する', () => {
    const result = calculateTwoLaneLayout({
      plans: [makePlan()],
      records: [makeRecord()],
      hourHeight: HOUR_HEIGHT,
      planLaneWidthPercent: 50,
    });
    expect(result.planLayouts[0]?.position.width).toBe(50);
    expect(result.recordLayouts[0]?.position.left).toBe(50);
    expect(result.recordLayouts[0]?.position.width).toBe(50);
  });

  it('9:00-10:00 (hourHeight=60) は top=540px, height=60px', () => {
    const result = calculateTwoLaneLayout({
      plans: [makePlan()],
      records: [],
      hourHeight: HOUR_HEIGHT,
    });
    expect(result.planLayouts[0]?.position).toMatchObject({ top: 540, height: 60 });
  });

  it('日をまたぐ場合は当日の終端(24:00)でクランプする', () => {
    const result = calculateTwoLaneLayout({
      plans: [
        makePlan({
          displayStartDate: localDate(23, 0),
          displayEndDate: localDate(2, 0, 11),
        }),
      ],
      records: [],
      hourHeight: HOUR_HEIGHT,
    });
    // 23:00 → top=1380px, 24:00までの1時間 → height=60px
    expect(result.planLayouts[0]?.position).toMatchObject({ top: 1380, height: 60 });
  });

  it('plans/records 複数件をそれぞれ独立に配置する（レーン内は重複しない前提）', () => {
    const result = calculateTwoLaneLayout({
      plans: [
        makePlan({ id: 'p1' }),
        makePlan({
          id: 'p2',
          displayStartDate: localDate(11, 0),
          displayEndDate: localDate(11, 30),
        }),
      ],
      records: [],
      hourHeight: HOUR_HEIGHT,
    });
    expect(result.planLayouts).toHaveLength(2);
    expect(result.planLayouts[1]?.position).toMatchObject({ top: 660, height: 30 });
  });
});

describe('resolveTwoLaneFromPointer', () => {
  it('既定38%の境界より左をPlan、右をRecordにする', () => {
    expect(resolveTwoLaneFromPointer(137, 100, 100)).toBe('plan');
    expect(resolveTwoLaneFromPointer(138, 100, 100)).toBe('record');
  });

  it('Week用20%幅を反映する', () => {
    expect(resolveTwoLaneFromPointer(119, 100, 100, 20)).toBe('plan');
    expect(resolveTwoLaneFromPointer(120, 100, 100, 20)).toBe('record');
  });
});
