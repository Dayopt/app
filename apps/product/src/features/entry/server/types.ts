/**
 * Entries Service Types
 *
 * サービス層で使用する型定義（plans + records 統合後）
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Row } from '@/lib/database';
import type { CreateEntryInput, EntryFilter, UpdateEntryInput } from '../schemas/entry';

/**
 * サービス関数で使用するSupabaseクライアント型
 */
export type ServiceSupabaseClient = SupabaseClient<Database>;

/**
 * エントリのデータベース行型
 */
export type EntryRow = Row<'entries'>;

/**
 * エントリ（タグID付き）
 * entries.tag_id が直接存在するので、tagId はエイリアス
 */
export interface EntryWithTags extends EntryRow {
  tagId: string | null;
}

/**
 * エントリ一覧取得のオプション
 */
export interface ListEntriesOptions extends EntryFilter {
  userId: string;
}

/**
 * エントリ作成のオプション
 */
export interface CreateEntryOptions {
  userId: string;
  input: CreateEntryInput;
  preventOverlappingEntries?: boolean;
  /** ユーザーのタイムゾーン（日時正規化に使用。デフォルト: 'UTC'） */
  timezone?: string | undefined;
}

/**
 * エントリ更新のオプション
 */
export interface UpdateEntryOptions {
  userId: string;
  entryId: string;
  input: UpdateEntryInput;
  preventOverlappingEntries?: boolean;
  /** 楽観的ロック: クライアントが認識している updated_at（不一致なら CONFLICT） */
  expectedUpdatedAt?: string | undefined;
  /** ユーザーのタイムゾーン（日時正規化に使用。デフォルト: 'UTC'） */
  timezone?: string | undefined;
}

/**
 * planned entry を unplanned entry に明示変換するオプション
 */
export interface ConvertPlannedToUnplannedOptions {
  userId: string;
  entryId: string;
}

/**
 * unplanned entry を planned entry に明示変換するオプション
 */
export interface ConvertUnplannedToPlannedOptions {
  userId: string;
  entryId: string;
}

/**
 * エントリ更新の結果（auto-shrink された隣接エントリを含む）
 */
export interface UpdateEntryResult extends EntryRow {
  adjustedEntries: EntryRow[];
}

/**
 * エントリ削除のオプション
 */
export interface DeleteEntryOptions {
  userId: string;
  entryId: string;
}

/**
 * エントリ取得のオプション
 */
export interface GetEntryByIdOptions {
  userId: string;
  entryId: string;
  includeTags?: boolean;
}
