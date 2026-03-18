/**
 * 繰り返しパターン展開ユーティリティ
 *
 * RRULE/recurrence_typeから指定期間内のオカレンス日付を生成
 */

import { logger } from '@/lib/logger';

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  getDate,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  setDate,
  startOfDay,
} from 'date-fns';

import type { Entry, RecurrenceConfig } from '../types/entry';

import { ruleToConfig } from './rrule';

/**
 * 展開されたオカレンス
 */
export interface ExpandedOccurrence {
  /** オカレンスの日付 */
  date: Date;
  /** 元のエントリID */
  entryId: string;
  /** 親プランの開始時刻（HH:mm形式、時刻部分のみ） */
  startTime: string | null;
  /** 親プランの終了時刻（HH:mm形式、時刻部分のみ） */
  endTime: string | null;
  /** 例外かどうか（DBに保存された例外） */
  isException: boolean;
  /** 例外タイプ */
  exceptionType?: 'modified' | 'cancelled' | 'moved' | undefined;
  /** タイトルオーバーライド */
  overrideTitle?: string | undefined;
  /** 説明オーバーライド */
  overrideDescription?: string | undefined;
  /** 開始時刻オーバーライド（ISO 8601） */
  overrideStartTime?: string | undefined;
  /** 終了時刻オーバーライド（ISO 8601） */
  overrideEndTime?: string | undefined;
}

/**
 * 例外情報（DBから取得）
 */
export interface EntryInstanceException {
  instanceDate: string; // YYYY-MM-DD
  exceptionType?: 'modified' | 'cancelled' | 'moved' | undefined;
  title?: string | undefined;
  description?: string | undefined;
  instanceStart?: string | undefined; // ISO 8601
  instanceEnd?: string | undefined; // ISO 8601
  originalDate?: string | undefined; // moved時の元日付
}

/**
 * recurrence_type（シンプル版）からRecurrenceConfigに変換
 */
function simpleTypeToConfig(recurrenceType: string, startDate: Date): RecurrenceConfig | null {
  switch (recurrenceType) {
    case 'daily':
      return { frequency: 'daily', interval: 1, endType: 'never' };
    case 'weekly':
      // 開始日の曜日で繰り返し
      return {
        frequency: 'weekly',
        interval: 1,
        byWeekday: [getDay(startDate)],
        endType: 'never',
      };
    case 'monthly':
      // 開始日の日付で繰り返し
      return {
        frequency: 'monthly',
        interval: 1,
        byMonthDay: getDate(startDate),
        endType: 'never',
      };
    case 'yearly':
      return { frequency: 'yearly', interval: 1, endType: 'never' };
    case 'weekdays':
      // 平日（月〜金）
      return {
        frequency: 'weekly',
        interval: 1,
        byWeekday: [1, 2, 3, 4, 5],
        endType: 'never',
      };
    case 'none':
    default:
      return null;
  }
}

/**
 * プランの繰り返し設定からRecurrenceConfigを取得
 */
export function getEntryRecurrenceConfig(entry: Entry): RecurrenceConfig | null {
  // recurrence_rule（RRULE形式）が優先
  if (entry.recurrence_rule) {
    return ruleToConfig(entry.recurrence_rule);
  }

  // recurrence_type（シンプル版）
  if (entry.recurrence_type && entry.recurrence_type !== 'none') {
    const startDate = entry.start_time ? new Date(entry.start_time) : new Date();
    return simpleTypeToConfig(entry.recurrence_type, startDate);
  }

  return null;
}

/**
 * 次のオカレンス日付を計算
 */
function getNextOccurrence(current: Date, config: RecurrenceConfig, _startDate: Date): Date | null {
  let next: Date;

  switch (config.frequency) {
    case 'daily':
      next = addDays(current, config.interval);
      break;

    case 'weekly':
      if (config.byWeekday && config.byWeekday.length > 0) {
        // 指定曜日で繰り返し
        next = current;
        let found = false;
        for (let i = 0; i < 7 * config.interval + 1; i++) {
          next = addDays(next, 1);
          if (config.byWeekday.includes(getDay(next))) {
            found = true;
            break;
          }
        }
        if (!found) return null;
      } else {
        next = addWeeks(current, config.interval);
      }
      break;

    case 'monthly':
      if (config.byMonthDay) {
        // 毎月X日
        next = addMonths(current, config.interval);
        next = setDate(next, config.byMonthDay);
      } else {
        next = addMonths(current, config.interval);
      }
      break;

    case 'yearly':
      next = addYears(current, config.interval);
      break;

    default:
      return null;
  }

  return next;
}

/**
 * 繰り返しパターンを指定期間内に展開
 *
 * @param plan - 繰り返しプラン
 * @param rangeStart - 表示範囲の開始日
 * @param rangeEnd - 表示範囲の終了日
 * @param exceptions - DBから取得した例外情報
 * @returns 展開されたオカレンスの配列
 */
export function expandRecurrence(
  entry: Entry,
  rangeStart: Date,
  rangeEnd: Date,
  exceptions: EntryInstanceException[] = [],
): ExpandedOccurrence[] {
  const config = getEntryRecurrenceConfig(entry);
  if (!config) {
    return [];
  }

  const occurrences: ExpandedOccurrence[] = [];

  // 開始日を決定
  const entryStartDate = entry.start_time ? startOfDay(new Date(entry.start_time)) : null;

  if (!entryStartDate) {
    return [];
  }

  // 時刻を抽出（HH:mm形式、UTC — SSR環境でもブラウザと同じ結果を保証）
  const startTime = entry.start_time
    ? `${String(new Date(entry.start_time).getUTCHours()).padStart(2, '0')}:${String(new Date(entry.start_time).getUTCMinutes()).padStart(2, '0')}`
    : null;
  const endTime = entry.end_time
    ? `${String(new Date(entry.end_time).getUTCHours()).padStart(2, '0')}:${String(new Date(entry.end_time).getUTCMinutes()).padStart(2, '0')}`
    : null;

  // 終了日を決定
  let recurrenceEndDate: Date | null = null;
  if (config.endType === 'until' && config.endDate) {
    recurrenceEndDate = new Date(config.endDate);
  } else if (entry.recurrence_end_date) {
    recurrenceEndDate = new Date(entry.recurrence_end_date);
  }

  // 例外マップを作成
  const exceptionMap = new Map<string, EntryInstanceException>();
  exceptions.forEach((ex) => {
    exceptionMap.set(ex.instanceDate, ex);
  });

  // moved例外の移動先日付を収集
  const movedToDates = new Set<string>();
  exceptions.forEach((ex) => {
    if (ex.exceptionType === 'moved' && ex.originalDate) {
      movedToDates.add(ex.instanceDate);
    }
  });

  // オカレンスを生成
  let current = entryStartDate;
  let count = 0;
  const maxIterations = 1000; // 無限ループ防止

  while (count < maxIterations) {
    // 終了条件チェック
    if (recurrenceEndDate && isAfter(current, recurrenceEndDate)) {
      break;
    }
    if (config.endType === 'count' && config.count && occurrences.length >= config.count) {
      break;
    }
    if (isAfter(current, rangeEnd)) {
      break;
    }

    // 表示範囲内かチェック
    if (!isBefore(current, rangeStart) || isSameDay(current, rangeStart)) {
      const dateKey = current.toISOString().slice(0, 10);
      const exception = exceptionMap.get(dateKey);

      // cancelled例外はスキップ
      if (exception?.exceptionType === 'cancelled') {
        // スキップ
      } else if (exception?.exceptionType === 'moved') {
        // 元の日付からは削除（移動先で表示）
        // スキップ
      } else {
        occurrences.push({
          date: new Date(current),
          entryId: entry.id,
          startTime,
          endTime,
          isException: !!exception,
          exceptionType: exception?.exceptionType,
          overrideTitle: exception?.title,
          overrideDescription: exception?.description,
          overrideStartTime: exception?.instanceStart,
          overrideEndTime: exception?.instanceEnd,
        });
      }
    }

    // 次のオカレンスへ
    const next = getNextOccurrence(current, config, entryStartDate);
    if (!next || isSameDay(next, current)) {
      break;
    }
    current = next;
    count++;
  }

  // 最大反復回数に到達した場合は警告（日次繰り返し≒約2.7年分で到達）
  if (count >= maxIterations) {
    logger.warn(
      `[expandRecurrence] Max iterations (${maxIterations}) reached for entry ${entry.id}. Some occurrences may be truncated.`,
    );
  }

  // moved例外の移動先を追加
  exceptions.forEach((ex) => {
    if (ex.exceptionType === 'moved') {
      const movedDate = new Date(ex.instanceDate);
      if (
        (isAfter(movedDate, rangeStart) || isSameDay(movedDate, rangeStart)) &&
        (isBefore(movedDate, rangeEnd) || isSameDay(movedDate, rangeEnd))
      ) {
        occurrences.push({
          date: movedDate,
          entryId: entry.id,
          startTime,
          endTime,
          isException: true,
          exceptionType: 'moved',
          overrideTitle: ex.title,
          overrideDescription: ex.description,
          overrideStartTime: ex.instanceStart,
          overrideEndTime: ex.instanceEnd,
        });
      }
    }
  });

  // 日付順にソート
  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());

  return occurrences;
}

/**
 * 繰り返しエントリかどうかを判定
 */
export function isRecurringEntry(entry: {
  recurrence_type?: string | null;
  recurrence_rule?: string | null;
}): boolean {
  return !!((entry.recurrence_type && entry.recurrence_type !== 'none') || entry.recurrence_rule);
}
