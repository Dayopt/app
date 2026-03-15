/**
 * レイアウト計算エンジン — React/DOM依存ゼロの純粋関数
 *
 * Googleカレンダー風のsweep-lineアルゴリズムによる重複検出・カラム割り当て、
 * プランカードの位置計算、予定vs記録の差分オーバーレイ計算を提供。
 */

import type { PlanColumn, TimedPlan } from '../components/views/shared/types/plan.types';

import { MIN_EVENT_HEIGHT } from './grid';

// 予定 vs 記録 差分オーバーレイは Entry ドメインのロジック
// canonical source: @/features/entry
export { computeActualTimeDiffOverlay, NO_OVERLAY } from '@/features/entry';
export type { ActualTimeDiffOverlay } from '@/features/entry';

// ========================================
// 型定義
// ========================================

/** 重複レイアウト情報 */
export interface PlanLayout {
  plan: TimedPlan;
  /** 左から何番目のカラム（0始まり） */
  column: number;
  /** その時間帯の総カラム数 */
  totalColumns: number;
  /** 幅のパーセンテージ（例: 50, 33.33） */
  width: number;
  /** 左位置のパーセンテージ（例: 0, 50） */
  left: number;
}

/** 重複グループ */
interface OverlapGroup {
  plans: TimedPlan[];
  startTime: Date;
  endTime: Date;
}

// ========================================
// Googleカレンダー風カラムレイアウト
// ========================================

/**
 * プランの重複レイアウトを一括計算（メインエントリポイント）
 *
 * Googleカレンダー風の横並び配置:
 * 1. Planned を左側（column: 0）に配置
 * 2. Unplanned を右側に配置
 */
export function calculatePlanLayouts(plans: TimedPlan[]): PlanLayout[] {
  if (plans.length === 0) return [];

  // Step 1: プランを開始時間でソート
  const sortedPlans = [...plans].sort((a, b) => {
    const aStart = new Date(a.start);
    const bStart = new Date(b.start);
    return aStart.getTime() - bStart.getTime();
  });

  // Step 2: 重複グループを検出
  const overlapGroups = findOverlapGroups(sortedPlans);

  // Step 3: 各グループ内でレイアウトを計算
  const layouts: PlanLayout[] = [];

  overlapGroups.forEach((group) => {
    const groupLayouts = calculateGroupLayout(group.plans);
    layouts.push(...groupLayouts);
  });

  return layouts;
}

/**
 * 重複するプラングループを検出（sweep-line）
 */
export function findOverlapGroups(plans: TimedPlan[]): OverlapGroup[] {
  const groups: OverlapGroup[] = [];
  let currentGroup: TimedPlan[] = [];
  let groupEndTime: Date | null = null;

  plans.forEach((plan) => {
    const planStart = new Date(plan.start);
    const planEnd = new Date(plan.end);

    if (!groupEndTime || planStart >= groupEndTime) {
      if (currentGroup.length > 0) {
        groups.push({
          plans: currentGroup,
          startTime: new Date(currentGroup[0]!.start),
          endTime: groupEndTime!,
        });
      }
      currentGroup = [plan];
      groupEndTime = planEnd;
    } else {
      currentGroup.push(plan);
      if (planEnd > groupEndTime) {
        groupEndTime = planEnd;
      }
    }
  });

  if (currentGroup.length > 0 && groupEndTime) {
    groups.push({
      plans: currentGroup,
      startTime: new Date(currentGroup[0]!.start),
      endTime: groupEndTime,
    });
  }

  return groups;
}

/**
 * グループ内のレイアウトを計算
 *
 * 列配置の優先順位:
 * 1. Plan（type !== 'record'）を左側（column: 0）に配置
 * 2. Record（type === 'record'）を右側に配置
 */
export function calculateGroupLayout(plans: TimedPlan[]): PlanLayout[] {
  const layouts: PlanLayout[] = [];

  // 各プランの「競合リスト」を作成
  const conflicts = new Map<string, Set<string>>();

  plans.forEach((plan1) => {
    const conflictSet = new Set<string>();
    plans.forEach((plan2) => {
      if (plan1.id !== plan2.id && isOverlapping(plan1, plan2)) {
        conflictSet.add(plan2.id);
      }
    });
    conflicts.set(plan1.id, conflictSet);
  });

  // 最大同時重複数を計算
  const maxConcurrent = calculateMaxConcurrent(plans);

  // 各プランにカラムを割り当て
  const assignments = new Map<string, number>();

  // Planned を先に処理してcolumn: 0を優先的に割り当て、Unplanned を後に処理
  const sortedForAssignment = [...plans].sort((a, b) => {
    const aIsUnplanned = a.origin === 'unplanned';
    const bIsUnplanned = b.origin === 'unplanned';
    if (aIsUnplanned !== bIsUnplanned) return aIsUnplanned ? 1 : -1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  sortedForAssignment.forEach((plan) => {
    const usedColumns = new Set<number>();

    conflicts.get(plan.id)?.forEach((conflictId) => {
      if (assignments.has(conflictId)) {
        usedColumns.add(assignments.get(conflictId)!);
      }
    });

    let column = 0;
    while (usedColumns.has(column)) {
      column++;
    }

    assignments.set(plan.id, column);
  });

  // レイアウト情報を生成
  plans.forEach((plan) => {
    const column = assignments.get(plan.id)!;
    const width = 100 / maxConcurrent;
    const left = width * column;

    layouts.push({ plan, column, totalColumns: maxConcurrent, width, left });
  });

  return layouts;
}

/**
 * 2つのプランが重複しているかを判定
 */
export function isOverlapping(plan1: TimedPlan, plan2: TimedPlan): boolean {
  const start1 = new Date(plan1.start);
  const end1 = new Date(plan1.end);
  const start2 = new Date(plan2.start);
  const end2 = new Date(plan2.end);

  return start1 < end2 && start2 < end1;
}

/**
 * 最大同時重複数を計算（sweep-line）
 */
export function calculateMaxConcurrent(plans: TimedPlan[]): number {
  const timePoints: { time: Date; type: 'start' | 'end'; planId: string }[] = [];

  plans.forEach((plan) => {
    const start = new Date(plan.start);
    const end = new Date(plan.end);
    timePoints.push({ time: start, type: 'start', planId: plan.id });
    timePoints.push({ time: end, type: 'end', planId: plan.id });
  });

  timePoints.sort((a, b) => {
    const timeDiff = a.time.getTime() - b.time.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.type === 'end' ? -1 : 1;
  });

  let current = 0;
  let max = 0;

  timePoints.forEach((point) => {
    if (point.type === 'start') {
      current++;
      max = Math.max(max, current);
    } else {
      current--;
    }
  });

  return max;
}

// ========================================
// プランカード配置
// ========================================

/**
 * プランが時間的に重複しているか判定
 */
export function plansOverlap(plan1: TimedPlan, plan2: TimedPlan): boolean {
  return !(plan1.end <= plan2.start || plan2.end <= plan1.start);
}

/**
 * プラングループを検出（重複するプランをグループ化）
 */
export function detectOverlapGroups(plans: TimedPlan[]): TimedPlan[][] {
  if (plans.length === 0) return [];

  const sortedPlans = [...plans].sort((a, b) => a.start.getTime() - b.start.getTime());
  const groups: TimedPlan[][] = [];

  for (const plan of sortedPlans) {
    let added = false;
    for (const group of groups) {
      if (group.some((p) => plansOverlap(p, plan))) {
        group.push(plan);
        added = true;
        break;
      }
    }
    if (!added) {
      groups.push([plan]);
    }
  }

  return groups;
}

/**
 * プランの表示位置を計算
 */
export function calculatePlanPosition(
  plan: TimedPlan,
  column: PlanColumn,
  hourHeight: number = 60,
): { top: number; height: number; left: number; width: number } {
  const startMinutes = plan.start.getHours() * 60 + plan.start.getMinutes();
  const endMinutes = plan.end.getHours() * 60 + plan.end.getMinutes();

  const top = (startMinutes * hourHeight) / 60;
  const height = Math.max(((endMinutes - startMinutes) * hourHeight) / 60, MIN_EVENT_HEIGHT);

  const width = 100 / column.totalColumns;
  const left = width * column.columnIndex;

  return { top, height, left, width };
}

/**
 * プランの表示位置を計算（折りたたみ考慮版）
 */
export function calculatePlanPositionWithCollapse(
  plan: TimedPlan,
  column: PlanColumn,
  timeToPixelsFn: (time: Date) => number,
): { top: number; height: number; left: number; width: number } {
  const top = timeToPixelsFn(plan.start);
  const bottom = timeToPixelsFn(plan.end);
  const height = Math.max(bottom - top, MIN_EVENT_HEIGHT);

  const width = 100 / column.totalColumns;
  const left = width * column.columnIndex;

  return { top, height, left, width };
}

/**
 * 時間指定プランをソート（開始時刻順）
 */
export function sortTimedPlans(plans: TimedPlan[]): TimedPlan[] {
  return [...plans].sort((a, b) => {
    const timeDiff = a.start.getTime() - b.start.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.end.getTime() - b.end.getTime();
  });
}

/**
 * 特定の日のプランをフィルタリング
 */
export function filterPlansByDate(plans: TimedPlan[], date: Date): TimedPlan[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return plans.filter((plan) => {
    return plan.start < dayEnd && plan.end > dayStart;
  });
}
