import 'server-only';

/**
 * Tag Service
 *
 * タグ操作の公開 API（facade）。CRUD / マージ / アーカイブ操作は
 * #2162（tag-model-replacement）の cutover で activities / categories
 * service へ置き換え済みで撤去した。残るのは review が過去データの表示
 * （アーカイブ済みタグ名・色の解決）のために使う読み取り専用 API のみ
 * （Step 5 の分析軸切替までの暫定。docs/projects/tag-model-replacement/overview.md）。
 * 実装は `tag-query-service.ts` に閉じている。
 *
 * キャッシュ戦略: TanStack Queryのクライアントキャッシュ（5分）のみ。
 * サーバーサイドキャッシュ（unstable_cache）は使わない。
 */

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '../types';
import { TagQueryService } from './tag-query-service';

export { TagServiceError } from './tag-service-error';

/** タグ一覧取得オプション */
interface ListTagsOptions {
  userId: string;
  sortField?: 'name' | 'created_at' | 'updated_at' | 'tag_number' | 'sort_order' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

/**
 * Tag Service
 */
export class TagService {
  private readonly queryService: TagQueryService;

  constructor(supabase: SupabaseClient<Database>) {
    this.queryService = new TagQueryService(supabase);
  }

  /**
   * タグ一覧取得
   *
   * @param options - 取得オプション（userId, ソート条件）
   * @returns タグ配列
   */
  async list(options: ListTagsOptions): Promise<Tag[]> {
    return this.queryService.list(options);
  }

  /**
   * アーカイブ済みタグの一覧
   */
  async listArchived(options: { userId: string }): Promise<Tag[]> {
    return this.queryService.listArchived(options.userId);
  }

  /**
   * 通常タグとアーカイブ済みタグを 1 スナップショットで取得する（#1825）
   */
  async listWithArchived(options: { userId: string }): Promise<{ active: Tag[]; archived: Tag[] }> {
    return this.queryService.listWithArchived(options.userId);
  }
}

/**
 * TagService インスタンス作成
 *
 * @param supabase - Supabaseクライアント
 * @returns TagService
 */
export function createTagService(supabase: SupabaseClient<Database>) {
  return new TagService(supabase);
}
