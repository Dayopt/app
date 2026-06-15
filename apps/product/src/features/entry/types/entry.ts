// Entry型定義（Canonical source）
// plans + records を統合した entries テーブルに対応

import type { EntryOrigin, EntryState } from '@dayopt/domain';

/**
 * Entry の共通 domain type は @dayopt/domain を source of truth にする。
 * この feature API は既存 import を壊さないための re-export。
 */
export type { EntryOrigin, EntryState };

/**
 * エントリ基本型（entries テーブルに対応）
 *
 * 「Time waits for no one」原則:
 * - 未来の時間帯 = 予定（upcoming）
 * - 現在の時間帯 = 進行中（active）
 * - 過去の時間帯 = 記録（past）
 * ステータスは時間位置から自動判定（getEntryState）
 */
interface Entry {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  origin: EntryOrigin;
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  planned_duration_minutes: number | null;
  /** @deprecated 充実度軸は廃止（#1324）。DB カラム drop までの暫定フィールド。読み書きしない */
  fulfillment_score: number | null;
  /** 計画したがやらなかった（自動記録モデル）。非 null = 実績集計から除外 */
  skipped_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * タグID付きエントリ（リレーション取得時）
 * 1エントリ1タグ制約
 */
export interface EntryWithTags extends Entry {
  tagId: string | null;
}
