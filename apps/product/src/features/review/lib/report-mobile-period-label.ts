import { format, isSameMonth } from 'date-fns';

import type { Locale } from 'date-fns';

import type { ReportGranularity } from './report-period';

/**
 * モバイルヘッダーの期間ラベル。
 *
 * **週と月は年を出さない**（2026-09-07 User 指示）。カレンダーのモバイルヘッダーが
 * 「9月6日 Sat」と年を持たないのに揃える — 狭い面で毎回 4 桁を読ませる価値が無い。
 * 年粒度だけは年そのものが対象なので残す（落とすと出すものが無くなる）。
 *
 * **同じ月に収まる週は月を 1 回しか出さない**（2026-09-07 User 指示）:「9月14日〜20日」。
 * 月をまたぐ週だけ両側に月を付ける:「8月31日〜9月6日」。
 *
 * 共有の `DateRangeDisplay` は触らない。あちらの範囲テキストは
 * `common.dates.formats.dayRange*` 経由で必ず年を含み、カレンダーのデスクトップも
 * 同じ経路を使っているため、年を抜くとあちらの表示まで変わる。
 *
 * 書式は locale ごとに切り替える。`patterns` は呼び出し側が i18n から渡す
 * （`report.mobile.periodFormat.*`）。
 */
export function formatReportMobilePeriod(options: {
  granularity: ReportGranularity;
  periodStart: Date;
  periodEnd: Date;
  dateFnsLocale: Locale;
  patterns: {
    /** 週の 1 日分（年なし）。例: `M月d日` / `MMM d` */
    weekDay: string;
    /** 同月に収まる週の終端（月を省く）。例: `d日` / `d` */
    weekDayShort: string;
    /** 週の範囲テンプレート。`{start}` `{end}` を含む */
    weekRange: string;
    /** 月（年なし）。例: `M月` / `MMMM` */
    month: string;
    /** 年。例: `yyyy'年'` / `yyyy` */
    year: string;
  };
}): string {
  const { granularity, periodStart, periodEnd, dateFnsLocale, patterns } = options;
  const opts = { locale: dateFnsLocale };

  if (granularity === 'year') return format(periodStart, patterns.year, opts);
  if (granularity === 'month') return format(periodStart, patterns.month, opts);

  // 同月なら終端から月を落とす（「9月14日〜20日」）。またぐ時だけ両側に付ける
  const endPattern = isSameMonth(periodStart, periodEnd) ? patterns.weekDayShort : patterns.weekDay;

  return patterns.weekRange
    .replace('{start}', format(periodStart, patterns.weekDay, opts))
    .replace('{end}', format(periodEnd, endPattern, opts));
}
