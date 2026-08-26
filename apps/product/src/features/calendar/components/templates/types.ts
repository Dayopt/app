/**
 * テンプレート（型）UI の mock 型定義（Storybook-only）。
 *
 * v1.0 設計書 §5.4 の契約: テンプレートが保存するのは「組成」「順序」「錨位置」のみ。
 * 寸法（各ブロックの長さ）は持たず、適用時に過去の中央値を着て具現化する
 * （型は使うほど正確になり、腐らない）。
 *
 * この issue の scope は backend / store / tRPC 非配線の Storybook-only なので、
 * ここで定義する型は実データモデルではなく、Story を組み立てるための mock shape。
 * 実装フェーズで tRPC procedure の input/output 型を設計する際は、この型をそのまま
 * 転用せず「組成・順序・錨位置のみを保存する」契約から改めて設計し直すこと
 * （`medianDurationRatio` は保存値ではなく適用時点の具現化結果のプレビュー用モック値）。
 */

import type { CategoryColorName } from '@/features/activities';

export interface TemplateBlockMock {
  id: string;
  activityName: string;
  /** null = 未分類（継承元カテゴリーなし） */
  categoryColor: CategoryColorName | null;
  /** Lucide アイコン名（kebab-case）。null = 色ドットへフォールバック */
  categoryIcon: string | null;
  /**
   * 錨位置: 0〜1 の相対位置（0 = 一日の始まり、1 = 一日の終わり）。
   * 保存されるのはこの錨位置のみで、時刻ラベルには変換して見せない。
   */
  anchorRatio: number;
  /**
   * 適用時に中央値を着た後の長さ比率（0〜1、一日の長さに対する割合）。
   * 型自体は寸法を持たないため、これは具現化後のプレビュー用モック値。
   */
  medianDurationRatio: number;
}

export interface TemplateMock {
  id: string;
  name: string;
  blocks: TemplateBlockMock[];
}
