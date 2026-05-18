/**
 * レイアウト計算エンジン — React/DOM依存ゼロの純粋関数
 *
 * Googleカレンダー風のsweep-lineアルゴリズムによる重複検出・カラム割り当て、
 * エントリカードの位置計算、予定vs記録の差分オーバーレイ計算を提供。
 */

import type { EntryColumn, TimedEntry } from '../types/entry.types';

import { MIN_EVENT_HEIGHT } from './grid';

// 予定 vs 記録 差分オーバーレイは Entry ドメインのロジック
// canonical source: @/features/entry
export { computeActualTimeDiffOverlay } from '@/features/entry';

// ========================================
// 型定義
// ========================================

/** 重複レイアウト情報 */
export interface EntryLayout {
  entry: TimedEntry;
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
  entries: TimedEntry[];
  startTime: Date;
  endTime: Date;
}

// ========================================
// Googleカレンダー風カラムレイアウト
// ========================================

/**
 * エントリの重複レイアウトを一括計算（メインエントリポイント）
 *
 * Googleカレンダー風の横並び配置:
 * 1. Planned を左側（column: 0）に配置
 * 2. Unplanned を右側に配置
 */
export function calculateEntryLayouts(entries: TimedEntry[]): EntryLayout[] {
  if (entries.length === 0) return [];

  // Step 1: エントリを開始時間でソート
  const sortedEntries = [...entries].sort((a, b) => {
    const aStart = new Date(a.start);
    const bStart = new Date(b.start);
    return aStart.getTime() - bStart.getTime();
  });

  // Step 2: 重複グループを検出
  const overlapGroups = findOverlapGroups(sortedEntries);

  // Step 3: 各グループ内でレイアウトを計算
  const layouts: EntryLayout[] = [];

  overlapGroups.forEach((group) => {
    const groupLayouts = calculateGroupLayout(group.entries);
    layouts.push(...groupLayouts);
  });

  return layouts;
}

/**
 * 重複するエントリグループを検出（sweep-line）
 */
export function findOverlapGroups(entries: TimedEntry[]): OverlapGroup[] {
  const groups: OverlapGroup[] = [];
  let currentGroup: TimedEntry[] = [];
  let groupEndTime: Date | null = null;

  entries.forEach((entry) => {
    const entryStart = new Date(entry.start);
    const entryEnd = new Date(entry.end);

    if (!groupEndTime || entryStart >= groupEndTime) {
      if (currentGroup.length > 0) {
        groups.push({
          entries: currentGroup,
          startTime: new Date(currentGroup[0]!.start),
          endTime: groupEndTime!,
        });
      }
      currentGroup = [entry];
      groupEndTime = entryEnd;
    } else {
      currentGroup.push(entry);
      if (entryEnd > groupEndTime) {
        groupEndTime = entryEnd;
      }
    }
  });

  if (currentGroup.length > 0 && groupEndTime) {
    groups.push({
      entries: currentGroup,
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
export function calculateGroupLayout(entries: TimedEntry[]): EntryLayout[] {
  const layouts: EntryLayout[] = [];

  // 各エントリの「競合リスト」を作成
  const conflicts = new Map<string, Set<string>>();

  entries.forEach((entry1) => {
    const conflictSet = new Set<string>();
    entries.forEach((entry2) => {
      if (entry1.id !== entry2.id && isOverlapping(entry1, entry2)) {
        conflictSet.add(entry2.id);
      }
    });
    conflicts.set(entry1.id, conflictSet);
  });

  // 最大同時重複数を計算
  const maxConcurrent = calculateMaxConcurrent(entries);

  // 各エントリにカラムを割り当て
  const assignments = new Map<string, number>();

  // 開始時刻順にソートしてカラムを割り当て
  const sortedForAssignment = [...entries].sort((a, b) => {
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  sortedForAssignment.forEach((entry) => {
    const usedColumns = new Set<number>();

    conflicts.get(entry.id)?.forEach((conflictId) => {
      if (assignments.has(conflictId)) {
        usedColumns.add(assignments.get(conflictId)!);
      }
    });

    let column = 0;
    while (usedColumns.has(column)) {
      column++;
    }

    assignments.set(entry.id, column);
  });

  // レイアウト情報を生成
  entries.forEach((entry) => {
    const column = assignments.get(entry.id)!;
    const width = 100 / maxConcurrent;
    const left = width * column;

    layouts.push({ entry, column, totalColumns: maxConcurrent, width, left });
  });

  return layouts;
}

/**
 * 2つのエントリが時間的に重複しているかを判定
 *
 * 接触のみ（一方の end === 他方の start）は重複としない
 */
export function isOverlapping(entry1: TimedEntry, entry2: TimedEntry): boolean {
  return entry1.start < entry2.end && entry2.start < entry1.end;
}

/**
 * 最大同時重複数を計算（sweep-line）
 */
export function calculateMaxConcurrent(entries: TimedEntry[]): number {
  const timePoints: { time: Date; type: 'start' | 'end'; entryId: string }[] = [];

  entries.forEach((entry) => {
    const start = new Date(entry.start);
    const end = new Date(entry.end);
    timePoints.push({ time: start, type: 'start', entryId: entry.id });
    timePoints.push({ time: end, type: 'end', entryId: entry.id });
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
// エントリカード配置
// ========================================

/** @deprecated isOverlapping を使用 */
export const entriesOverlap = isOverlapping;

/**
 * エントリグループを検出（重複するエントリをグループ化）
 */
export function detectOverlapGroups(entries: TimedEntry[]): TimedEntry[][] {
  if (entries.length === 0) return [];

  const sortedEntries = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime());
  const groups: TimedEntry[][] = [];

  for (const entry of sortedEntries) {
    let added = false;
    for (const group of groups) {
      if (group.some((p) => isOverlapping(p, entry))) {
        group.push(entry);
        added = true;
        break;
      }
    }
    if (!added) {
      groups.push([entry]);
    }
  }

  return groups;
}

/**
 * エントリの表示位置を計算
 */
export function calculateEntryPosition(
  entry: TimedEntry,
  column: EntryColumn,
  hourHeight: number = 60,
): { top: number; height: number; left: number; width: number } {
  const startMinutes = entry.start.getHours() * 60 + entry.start.getMinutes();
  const endMinutes = entry.end.getHours() * 60 + entry.end.getMinutes();

  const top = (startMinutes * hourHeight) / 60;
  const height = Math.max(((endMinutes - startMinutes) * hourHeight) / 60, MIN_EVENT_HEIGHT);

  const width = 100 / column.totalColumns;
  const left = width * column.columnIndex;

  return { top, height, left, width };
}

/**
 * エントリの表示位置を計算（折りたたみ考慮版）
 */
export function calculateEntryPositionWithCollapse(
  entry: TimedEntry,
  column: EntryColumn,
  timeToPixelsFn: (time: Date) => number,
): { top: number; height: number; left: number; width: number } {
  const top = timeToPixelsFn(entry.start);
  const bottom = timeToPixelsFn(entry.end);
  const height = Math.max(bottom - top, MIN_EVENT_HEIGHT);

  const width = 100 / column.totalColumns;
  const left = width * column.columnIndex;

  return { top, height, left, width };
}

/**
 * 時間指定エントリをソート（開始時刻順）
 */
export function sortTimedEntries(entries: TimedEntry[]): TimedEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = a.start.getTime() - b.start.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.end.getTime() - b.end.getTime();
  });
}

/**
 * 特定の日のエントリをフィルタリング
 */
export function filterEntriesByDate(entries: TimedEntry[], date: Date): TimedEntry[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return entries.filter((entry) => {
    return entry.start < dayEnd && entry.end > dayStart;
  });
}
