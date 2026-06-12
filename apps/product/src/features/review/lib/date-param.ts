import { format } from 'date-fns';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';

/**
 * Review の URL 日付パラメータ（?d=YYYY-MM-DD）の単一実装
 *
 * 書き込みは必ずローカル日付で行う。`date.toISOString().split('T')[0]` は
 * UTC 基準のため、UTC より進んだ TZ（JST 等）では朝の操作で前日にずれる。
 */

/** YYYY-MM-DD（ローカル日付）で ?d= 用文字列を作る */
function formatReviewDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** YYYY-MM-DD を正午基準で解釈（DST・TZ 変換で日付が前後しにくい基準値）。不正値は今日 */
export function parseReviewDateParam(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** タグ詳細ページへのパスを現在の粒度・日付付きで組み立てる */
export function buildReviewTagPath(
  locale: string,
  tagId: string,
  date: Date,
  granularity: string,
): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatReviewDateParam(date),
  });
  return `/${locale}/review/tags/${tagId}?${params.toString()}`;
}

/** Review メインページへのパスを粒度・日付付きで組み立てる */
export function buildReviewMainPath(locale: string, date: Date, granularity: string): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatReviewDateParam(date),
  });
  return `/${locale}/review?${params.toString()}`;
}

/**
 * 現在の粒度・日付を ?g=&d= として URL に書き込む（client 専用）
 *
 * replaceState を使う（フィルタ的状態のため履歴には積まない）。
 * store 更新と URL 書き込みはこの関数を通して常にセットで行う。
 */
export function writeReviewSearchParams(
  pathname: string,
  granularity: ReviewGranularity,
  date: Date,
): void {
  const params = new URLSearchParams(window.location.search);
  params.set('g', granularity);
  params.set('d', formatReviewDateParam(date));
  window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
}
