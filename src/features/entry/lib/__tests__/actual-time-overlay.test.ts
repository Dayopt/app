/**
 * Actual Time Diff Overlay Unit Tests
 *
 * 予定 vs 記録の差分オーバーレイ計算ロジックのテスト
 * - formatDiffMinutes: 差分分数のフォーマット
 * - computeActualTimeDiffOverlay: オーバーレイ情報の計算
 */

import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@/types/calendar-event';

import {
  computeActualTimeDiffOverlay,
  formatDiffMinutes,
  NO_OVERLAY,
} from '../actual-time-overlay';

// --- helpers ---

/** hourHeight=72px（1分=1.2px）で計算しやすいデフォルト値 */
const HOUR_HEIGHT = 72;

function makePlan(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'test-1',
    title: 'Test',
    startDate: new Date('2026-04-03T09:00:00'),
    endDate: new Date('2026-04-03T10:00:00'),
    displayStartDate: new Date('2026-04-03T09:00:00'),
    displayEndDate: new Date('2026-04-03T10:00:00'),
    status: 'open',
    color: '#000',
    duration: 60,
    isMultiDay: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// --- formatDiffMinutes ---

describe('formatDiffMinutes', () => {
  it('分のみを表示する', () => {
    expect(formatDiffMinutes(15)).toBe('15min');
    expect(formatDiffMinutes(45)).toBe('45min');
  });

  it('時のみを表示する', () => {
    expect(formatDiffMinutes(60)).toBe('1h');
    expect(formatDiffMinutes(120)).toBe('2h');
  });

  it('時+分を表示する', () => {
    expect(formatDiffMinutes(90)).toBe('1h30m');
    expect(formatDiffMinutes(65)).toBe('1h5m');
  });

  it('0分を表示する', () => {
    expect(formatDiffMinutes(0)).toBe('0min');
  });

  it('負の値は絶対値で表示する', () => {
    expect(formatDiffMinutes(-30)).toBe('30min');
    expect(formatDiffMinutes(-90)).toBe('1h30m');
  });
});

// --- computeActualTimeDiffOverlay ---

describe('computeActualTimeDiffOverlay', () => {
  describe('NO_OVERLAY を返すケース', () => {
    it('actualStartDate/actualEndDate が両方未設定', () => {
      const plan = makePlan({});
      expect(computeActualTimeDiffOverlay(plan, HOUR_HEIGHT)).toBe(NO_OVERLAY);
    });

    it('startDate が null', () => {
      const plan = makePlan({
        startDate: null,
        actualStartDate: new Date('2026-04-03T09:15:00'),
      });
      expect(computeActualTimeDiffOverlay(plan, HOUR_HEIGHT)).toBe(NO_OVERLAY);
    });

    it('endDate が null', () => {
      const plan = makePlan({
        endDate: null,
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      expect(computeActualTimeDiffOverlay(plan, HOUR_HEIGHT)).toBe(NO_OVERLAY);
    });
  });

  describe('差分なし（actual == planned）', () => {
    it('全く同じ時刻の場合 kind は none', () => {
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:00:00'),
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('none');
      expect(result.topHeight).toBe(0);
      expect(result.bottomHeight).toBe(0);
      expect(result.topShift).toBe(0);
      expect(result.heightDelta).toBe(0);
    });
  });

  describe('開始差分（top）', () => {
    it('開始が遅れた → unexecuted（斜線）', () => {
      // 予定09:00 → 実績09:30（30分遅れ）
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:30:00'),
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('unexecuted');
      expect(result.topDiffMin).toBe(30);
      expect(result.topHeight).toBe(36); // 30 * 72 / 60 = 36px
      expect(result.topShift).toBe(0);
    });

    it('開始が早まった → overtime（点線）+ topShift', () => {
      // 予定09:00 → 実績08:45（15分早い）
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T08:45:00'),
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('overtime');
      expect(result.topDiffMin).toBe(-15);
      expect(result.topHeight).toBe(18); // 15 * 72 / 60 = 18px
      expect(result.topShift).toBe(18); // overtime分だけカードを上に伸ばす
    });
  });

  describe('終了差分（bottom）', () => {
    it('終了が早まった → unexecuted（斜線）', () => {
      // 予定10:00終了 → 実績09:45終了（15分早い）
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:00:00'),
        actualEndDate: new Date('2026-04-03T09:45:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.bottomKind).toBe('unexecuted');
      expect(result.bottomDiffMin).toBe(-15);
      expect(result.bottomHeight).toBe(18);
    });

    it('終了が遅延した → overtime（点線）+ heightDelta', () => {
      // 予定10:00終了 → 実績10:30終了（30分超過）
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:00:00'),
        actualEndDate: new Date('2026-04-03T10:30:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.bottomKind).toBe('overtime');
      expect(result.bottomDiffMin).toBe(30);
      expect(result.bottomHeight).toBe(36);
      expect(result.heightDelta).toBe(36); // bottom overtime分
    });
  });

  describe('複合ケース', () => {
    it('開始遅れ + 終了早め（両方 unexecuted）', () => {
      // 予定09:00-10:00 → 実績09:15-09:45
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:15:00'),
        actualEndDate: new Date('2026-04-03T09:45:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('unexecuted');
      expect(result.topDiffMin).toBe(15);
      expect(result.bottomKind).toBe('unexecuted');
      expect(result.bottomDiffMin).toBe(-15);
      expect(result.topShift).toBe(0);
      expect(result.heightDelta).toBe(0);
    });

    it('開始早め + 終了遅延（両方 overtime）', () => {
      // 予定09:00-10:00 → 実績08:30-10:30
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T08:30:00'),
        actualEndDate: new Date('2026-04-03T10:30:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('overtime');
      expect(result.topDiffMin).toBe(-30);
      expect(result.topHeight).toBe(36);
      expect(result.topShift).toBe(36);
      expect(result.bottomKind).toBe('overtime');
      expect(result.bottomDiffMin).toBe(30);
      expect(result.bottomHeight).toBe(36);
      expect(result.heightDelta).toBe(72); // topShift(36) + bottomHeight(36)
    });
  });

  describe('片方のみ設定', () => {
    it('actualStart のみ → end は予定通り（差分なし）', () => {
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:20:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('unexecuted');
      expect(result.topDiffMin).toBe(20);
      expect(result.bottomKind).toBe('none');
      expect(result.bottomDiffMin).toBe(0);
    });

    it('actualEnd のみ → start は予定通り（差分なし）', () => {
      const plan = makePlan({
        actualEndDate: new Date('2026-04-03T10:15:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);
      expect(result.topKind).toBe('none');
      expect(result.topDiffMin).toBe(0);
      expect(result.bottomKind).toBe('overtime');
      expect(result.bottomDiffMin).toBe(15);
    });
  });

  describe('px 計算の正確性', () => {
    it('hourHeight=60 では 1分=1px', () => {
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:10:00'),
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, 60);
      expect(result.topHeight).toBe(10); // 10分 * 60/60 = 10px
    });

    it('hourHeight=120 では 1分=2px', () => {
      const plan = makePlan({
        actualStartDate: new Date('2026-04-03T09:10:00'),
        actualEndDate: new Date('2026-04-03T10:00:00'),
      });
      const result = computeActualTimeDiffOverlay(plan, 120);
      expect(result.topHeight).toBe(20); // 10分 * 120/60 = 20px
    });
  });
});
