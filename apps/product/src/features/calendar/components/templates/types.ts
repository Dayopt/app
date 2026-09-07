/**
 * テンプレート（型）UI の表示モデル。
 *
 * v1.0 設計書 §5.4 の契約: テンプレートが保存するのは「組成」「順序」「錨位置」のみ。
 * 寸法（各ブロックの長さ）は持たず、適用時に過去の中央値を着て具現化する
 * （型は使うほど正確になり、腐らない）。
 *
 * ここに出てくる比率（`anchorRatio` / `medianDurationRatio`）は**保存値ではなく描画用の
 * 派生値**。保存されているのは `anchor_minute`（local midnight からの分）で、長さは
 * server が毎回「直近 4 週の中央値 or 既定長」から計算して返す（#2567）。
 * 実データからの変換は `toTemplateView.ts` が持つ。
 */

import type { CategoryColorName } from '@/features/activities';

export interface TemplateBlockView {
  id: string;
  activityName: string;
  /** null = 未分類（継承元カテゴリーなし） */
  categoryColor: CategoryColorName | null;
  /** Lucide アイコン名（kebab-case）。null = 色ドットへフォールバック */
  categoryIcon: string | null;
  /**
   * 錨位置: 0〜1 の相対位置（0 = 一日の始まり、1 = 一日の終わり）。
   * 時刻ラベルには変換して見せない。
   */
  anchorRatio: number;
  /**
   * 適用時に中央値を着た後の長さ比率（0〜1、一日の長さに対する割合）。
   * 型自体は寸法を持たないため、これは具現化後のプレビュー値。
   */
  medianDurationRatio: number;
}

export interface TemplateView {
  id: string;
  name: string;
  blocks: TemplateBlockView[];
}
