/**
 * Timeblock カードの本体背景 tint を計算する純粋関数。
 *
 * TimeblockCard の actual layer 背景（`color-mix(in oklch, accentColor 18%, var(--background))`）と
 * 同一の式を、ドラッグ／タグパレット／ドラフトのプレビュー側でも共有するための single source。
 * プレビューと確定後カードの背景色がズレないよう、必ずこの関数経由で算出する。
 *
 * @param color - tint のベース色（`var(--tag-blue)` などの CSS color トークン）
 */
export function timeblockTintColor(color: string): string {
  return `color-mix(in oklch, ${color} 18%, var(--background))`;
}
