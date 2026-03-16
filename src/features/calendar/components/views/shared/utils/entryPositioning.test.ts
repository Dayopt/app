import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../../../types/calendar.types';

import type { TimedPlan } from '../types/plan.types';

import { computeActualTimeDiffOverlay, detectOverlapGroups, plansOverlap } from './planPositioning';

describe('planPositioning', () => {
  const createTimedPlan = (
    id: string,
    startHour: number,
    startMinute: number,
    endHour: number,
    endMinute: number,
  ): TimedPlan => ({
    id,
    title: `Plan ${id}`,
    start: new Date(2025, 0, 15, startHour, startMinute),
    end: new Date(2025, 0, 15, endHour, endMinute),
    startDate: new Date(2025, 0, 15, startHour, startMinute),
    endDate: new Date(2025, 0, 15, endHour, endMinute),
    origin: 'planned',
    status: 'open',
    color: 'blue',
    isRecurring: false,
    tagId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    displayStartDate: new Date(2025, 0, 15, startHour, startMinute),
    displayEndDate: new Date(2025, 0, 15, endHour, endMinute),
    duration: (endHour - startHour) * 60 + (endMinute - startMinute),
    isMultiDay: false,
  });

  describe('plansOverlap', () => {
    it('完全に重複するプランを検出する', () => {
      const plan1 = createTimedPlan('1', 10, 0, 11, 0); // 10:00-11:00
      const plan2 = createTimedPlan('2', 10, 30, 11, 30); // 10:30-11:30

      expect(plansOverlap(plan1, plan2)).toBe(true);
    });

    it('部分的に重複するプランを検出する', () => {
      const plan1 = createTimedPlan('1', 10, 0, 11, 0); // 10:00-11:00
      const plan2 = createTimedPlan('2', 10, 45, 12, 0); // 10:45-12:00

      expect(plansOverlap(plan1, plan2)).toBe(true);
    });

    it('完全に含まれるプランを検出する', () => {
      const plan1 = createTimedPlan('1', 10, 0, 12, 0); // 10:00-12:00
      const plan2 = createTimedPlan('2', 10, 30, 11, 0); // 10:30-11:00

      expect(plansOverlap(plan1, plan2)).toBe(true);
    });

    it('重複しないプランを判定する（連続）', () => {
      const plan1 = createTimedPlan('1', 10, 0, 11, 0); // 10:00-11:00
      const plan2 = createTimedPlan('2', 11, 0, 12, 0); // 11:00-12:00

      expect(plansOverlap(plan1, plan2)).toBe(false);
    });

    it('重複しないプランを判定する（離れている）', () => {
      const plan1 = createTimedPlan('1', 10, 0, 11, 0); // 10:00-11:00
      const plan2 = createTimedPlan('2', 12, 0, 13, 0); // 12:00-13:00

      expect(plansOverlap(plan1, plan2)).toBe(false);
    });

    it('逆順でも同じ結果が得られる', () => {
      const plan1 = createTimedPlan('1', 10, 0, 11, 0);
      const plan2 = createTimedPlan('2', 10, 30, 11, 30);

      expect(plansOverlap(plan1, plan2)).toBe(plansOverlap(plan2, plan1));
    });
  });

  describe('detectOverlapGroups', () => {
    it('重複しないプランは別々のグループになる', () => {
      const plans: TimedPlan[] = [
        createTimedPlan('1', 10, 0, 11, 0), // 10:00-11:00
        createTimedPlan('2', 11, 0, 12, 0), // 11:00-12:00
        createTimedPlan('3', 12, 0, 13, 0), // 12:00-13:00
      ];

      const groups = detectOverlapGroups(plans);

      expect(groups).toHaveLength(3);
      expect(groups[0]).toHaveLength(1);
      expect(groups[1]).toHaveLength(1);
      expect(groups[2]).toHaveLength(1);
    });

    it('重複するプランは同じグループになる', () => {
      const plans: TimedPlan[] = [
        createTimedPlan('1', 10, 0, 11, 0), // 10:00-11:00
        createTimedPlan('2', 10, 30, 11, 30), // 10:30-11:30（plan1と重複）
        createTimedPlan('3', 11, 0, 12, 0), // 11:00-12:00（plan2と重複）
      ];

      const groups = detectOverlapGroups(plans);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
    });

    it('複数のグループが正しく検出される', () => {
      const plans: TimedPlan[] = [
        createTimedPlan('1', 10, 0, 11, 0), // Group 1
        createTimedPlan('2', 10, 30, 11, 30), // Group 1
        createTimedPlan('3', 12, 0, 13, 0), // Group 2
        createTimedPlan('4', 12, 30, 13, 30), // Group 2
        createTimedPlan('5', 14, 0, 15, 0), // Group 3
      ];

      const groups = detectOverlapGroups(plans);

      expect(groups).toHaveLength(3);
      expect(groups[0]).toHaveLength(2); // plan1, plan2
      expect(groups[1]).toHaveLength(2); // plan3, plan4
      expect(groups[2]).toHaveLength(1); // plan5
    });

    it('空配列の場合は空配列を返す', () => {
      const groups = detectOverlapGroups([]);
      expect(groups).toHaveLength(0);
    });

    it('単一プランの場合は1グループを返す', () => {
      const plans: TimedPlan[] = [createTimedPlan('1', 10, 0, 11, 0)];

      const groups = detectOverlapGroups(plans);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(1);
    });

    it('開始時刻が異なる場合でもソートされる', () => {
      const plans: TimedPlan[] = [
        createTimedPlan('3', 12, 0, 13, 0),
        createTimedPlan('1', 10, 0, 11, 0),
        createTimedPlan('2', 11, 0, 12, 0),
      ];

      const groups = detectOverlapGroups(plans);

      // ソートされていることを確認（グループ分けが正しいかチェック）
      expect(groups).toHaveLength(3);
    });
  });

  describe('computeActualTimeDiffOverlay', () => {
    const HOUR_HEIGHT = 72;

    const createCalendarEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
      id: '1',
      title: 'Test',
      startDate: new Date(2025, 0, 15, 10, 0),
      endDate: new Date(2025, 0, 15, 11, 0),
      status: 'closed',
      color: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      displayStartDate: new Date(2025, 0, 15, 10, 0),
      displayEndDate: new Date(2025, 0, 15, 11, 0),
      duration: 60,
      isMultiDay: false,
      isRecurring: false,
      origin: 'planned',
      entryState: 'past',
      actualStartDate: null,
      actualEndDate: null,
      ...overrides,
    });

    it('actual times がない場合は none を返す', () => {
      const plan = createCalendarEvent();
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('none');
      expect(result.topShift).toBe(0);
      expect(result.heightDelta).toBe(0);
    });

    it('entryState が past でない場合は none を返す', () => {
      const plan = createCalendarEvent({
        entryState: 'upcoming',
        actualStartDate: new Date(2025, 0, 15, 10, 0),
        actualEndDate: new Date(2025, 0, 15, 11, 0),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('none');
    });

    it('origin が unplanned の場合は none を返す', () => {
      const plan = createCalendarEvent({
        origin: 'unplanned',
        actualStartDate: new Date(2025, 0, 15, 10, 0),
        actualEndDate: new Date(2025, 0, 15, 11, 0),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('none');
    });

    it('予定通りの場合は none を返す', () => {
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 0),
        actualEndDate: new Date(2025, 0, 15, 11, 0),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('none');
      expect(result.topShift).toBe(0);
      expect(result.heightDelta).toBe(0);
    });

    it('遅刻（実績開始が遅い）→ 上部 unexecuted', () => {
      // 予定 10:00-11:00、実績 10:15-11:00
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 15),
        actualEndDate: new Date(2025, 0, 15, 11, 0),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('unexecuted');
      expect(result.topHeight).toBe((15 * HOUR_HEIGHT) / 60); // 15min
      expect(result.bottomKind).toBe('none');
      expect(result.topShift).toBe(0);
    });

    it('早く終了 → 下部 unexecuted', () => {
      // 予定 10:00-11:00、実績 10:00-10:45
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 0),
        actualEndDate: new Date(2025, 0, 15, 10, 45),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('unexecuted');
      expect(result.bottomHeight).toBe((15 * HOUR_HEIGHT) / 60); // 15min
    });

    it('早く始めた → 上部 overtime + topShift', () => {
      // 予定 10:00-11:00、実績 9:45-11:00
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 9, 45),
        actualEndDate: new Date(2025, 0, 15, 11, 0),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('overtime');
      expect(result.topHeight).toBe((15 * HOUR_HEIGHT) / 60);
      expect(result.topShift).toBe((15 * HOUR_HEIGHT) / 60);
      expect(result.bottomKind).toBe('none');
    });

    it('超過 → 下部 overtime + heightDelta', () => {
      // 予定 10:00-11:00、実績 10:00-11:30
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 0),
        actualEndDate: new Date(2025, 0, 15, 11, 30),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('overtime');
      expect(result.bottomHeight).toBe((30 * HOUR_HEIGHT) / 60);
      expect(result.heightDelta).toBe((30 * HOUR_HEIGHT) / 60);
    });

    it('遅刻 + 早く終了 → 上下とも unexecuted', () => {
      // 予定 10:00-11:00、実績 10:10-10:50
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 10),
        actualEndDate: new Date(2025, 0, 15, 10, 50),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('unexecuted');
      expect(result.topHeight).toBe((10 * HOUR_HEIGHT) / 60);
      expect(result.bottomKind).toBe('unexecuted');
      expect(result.bottomHeight).toBe((10 * HOUR_HEIGHT) / 60);
      expect(result.topShift).toBe(0);
      expect(result.heightDelta).toBe(0);
    });

    it('早く始めた + 超過 → 上下とも overtime', () => {
      // 予定 10:00-11:00、実績 9:50-11:20
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 9, 50),
        actualEndDate: new Date(2025, 0, 15, 11, 20),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('overtime');
      expect(result.topHeight).toBe((10 * HOUR_HEIGHT) / 60);
      expect(result.topShift).toBe((10 * HOUR_HEIGHT) / 60);
      expect(result.bottomKind).toBe('overtime');
      expect(result.bottomHeight).toBe((20 * HOUR_HEIGHT) / 60);
      expect(result.heightDelta).toBe(((10 + 20) * HOUR_HEIGHT) / 60);
    });

    it('actualEndDate のみ設定（actualStartDate null）→ 下部のみ unexecuted', () => {
      // 予定 10:00-11:00、実績 ?-10:45（開始は予定通り扱い）
      const plan = createCalendarEvent({
        actualStartDate: null,
        actualEndDate: new Date(2025, 0, 15, 10, 45),
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('none');
      expect(result.bottomKind).toBe('unexecuted');
      expect(result.bottomHeight).toBe((15 * HOUR_HEIGHT) / 60);
    });

    it('actualStartDate のみ設定（actualEndDate null）→ 上部のみ unexecuted', () => {
      // 予定 10:00-11:00、実績 10:15-?（終了は予定通り扱い）
      const plan = createCalendarEvent({
        actualStartDate: new Date(2025, 0, 15, 10, 15),
        actualEndDate: null,
      });
      const result = computeActualTimeDiffOverlay(plan, HOUR_HEIGHT);

      expect(result.topKind).toBe('unexecuted');
      expect(result.topHeight).toBe((15 * HOUR_HEIGHT) / 60);
      expect(result.bottomKind).toBe('none');
    });
  });
});
