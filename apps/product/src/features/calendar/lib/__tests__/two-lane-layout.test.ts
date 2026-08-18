import { describe, expect, it } from 'vitest';

import type { PlanEvent, RecordEvent } from '@/features/timeblock';
import {
  calculateTwoLaneLayout,
  DEFAULT_PLAN_LANE_WIDTH_PERCENT,
  resolveTwoLaneFromPointer,
} from '../two-lane-layout';

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
    activityId: null,
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
    activityId: null,
    planId: null,
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
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

  it('同一レーンで隣接するイベントは2pxだけ離す', () => {
    const result = calculateTwoLaneLayout({
      plans: [
        makePlan({ id: 'p1' }),
        makePlan({
          id: 'p2',
          displayStartDate: localDate(10, 0),
          displayEndDate: localDate(10, 30),
        }),
      ],
      records: [],
      hourHeight: HOUR_HEIGHT,
    });
    expect(result.planLayouts[1]?.position).toMatchObject({ top: 602, height: 28 });
  });

  it('レコードレーンでも隣接イベント間に2pxの間隔を入れる', () => {
    const result = calculateTwoLaneLayout({
      plans: [],
      records: [
        makeRecord({
          id: 'r1',
          displayStartDate: localDate(9, 0),
          displayEndDate: localDate(10, 0),
        }),
        makeRecord({
          id: 'r2',
          displayStartDate: localDate(10, 0),
          displayEndDate: localDate(11, 0),
        }),
      ],
      hourHeight: HOUR_HEIGHT,
    });
    expect(result.recordLayouts[1]?.position).toMatchObject({ top: 602, height: 58 });
  });

  it('連続する短いイベントでも間隔を累積させず24:00内に収める', () => {
    const plans = Array.from({ length: 96 }, (_, index) => {
      const startMinutes = index * 15;
      const endMinutes = startMinutes + 15;
      return makePlan({
        id: `p${index}`,
        displayStartDate: localDate(Math.floor(startMinutes / 60), startMinutes % 60),
        displayEndDate:
          endMinutes === 24 * 60
            ? localDate(0, 0, 11)
            : localDate(Math.floor(endMinutes / 60), endMinutes % 60),
      });
    });

    const result = calculateTwoLaneLayout({ plans, records: [], hourHeight: HOUR_HEIGHT });
    const lastPosition = result.planLayouts.at(-1)?.position;

    expect(lastPosition).toEqual({ top: 1427, height: 13, left: 0, width: 38 });
    expect((lastPosition?.top ?? 0) + (lastPosition?.height ?? 0)).toBe(24 * HOUR_HEIGHT);
  });
});

describe('resolveTwoLaneFromPointer', () => {
  it('全ビュー共通の既定38%境界より左をPlan、右をRecordにする', () => {
    expect(DEFAULT_PLAN_LANE_WIDTH_PERCENT).toBe(38);
    expect(resolveTwoLaneFromPointer(137, 100, 100)).toBe('plan');
    expect(resolveTwoLaneFromPointer(138, 100, 100)).toBe('record');
  });

  it('既定値に戻した38%幅を反映する', () => {
    expect(resolveTwoLaneFromPointer(137, 100, 100, 38)).toBe('plan');
    expect(resolveTwoLaneFromPointer(138, 100, 100, 38)).toBe('record');
  });

  it('明示した境界幅を反映する', () => {
    expect(resolveTwoLaneFromPointer(149, 100, 100, 50)).toBe('plan');
    expect(resolveTwoLaneFromPointer(150, 100, 100, 50)).toBe('record');
  });
});
