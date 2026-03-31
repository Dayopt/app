import { describe, expect, it } from 'vitest';

import { matchesDateRangeFilter } from './filter';

describe('matchesDateRangeFilter', () => {
  it('allは常にtrue', () => {
    expect(matchesDateRangeFilter('2026-01-01', 'all')).toBe(true);
    expect(matchesDateRangeFilter(null, 'all')).toBe(true);
  });

  it('null/undefinedの日付はallのみマッチ', () => {
    expect(matchesDateRangeFilter(null, 'today')).toBe(false);
    expect(matchesDateRangeFilter(undefined, 'this_week')).toBe(false);
  });

  it('todayは今日の日付にマッチ', () => {
    const today = new Date().toISOString();
    expect(matchesDateRangeFilter(today, 'today')).toBe(true);
  });

  it('todayは昨日の日付にマッチしない', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(matchesDateRangeFilter(yesterday.toISOString(), 'today')).toBe(false);
  });

  it('yesterdayは昨日の日付にマッチ', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(matchesDateRangeFilter(yesterday.toISOString(), 'yesterday')).toBe(true);
  });

  it('this_monthは今月の日付にマッチ', () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    expect(matchesDateRangeFilter(firstOfMonth.toISOString(), 'this_month')).toBe(true);
  });

  it('this_monthは先月の日付にマッチしない', () => {
    // 月末オーバーフロー回避: 先月の1日を使う（3/31 → setMonth(-1) → 2/31 → 3/3 になる問題）
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(matchesDateRangeFilter(lastMonth.toISOString(), 'this_month')).toBe(false);
  });
});
