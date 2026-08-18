import 'server-only';

/**
 * Tag Service
 *
 * タグ操作の公開 API（facade）。実装はドメイン単位の service に分割されている:
 * - 取得系: `tag-query-service.ts`
 * - 作成・更新: `tag-mutation-service.ts`
 * - マージ: `tag-merge-service.ts`
 * - アーカイブ / 復元: `tag-archive-service.ts`
 * - 削除: `tag-delete-service.ts`
 *
 * キャッシュ戦略:
 * - [一時的に無効化] unstable_cache()によるサーバーサイドキャッシュ
 *   → Next.js 15 + tRPCでrevalidateTag()が正しく動作しないため
 * - TanStack Queryのクライアントキャッシュ（5分）で対応
 */

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag, TagTreeNode } from '../types';
import { TagArchiveService } from './tag-archive-service';
import { TagDeleteService } from './tag-delete-service';
import { TagMergeService, type MergeTagsOptions, type MergeTagsResult } from './tag-merge-service';
import {
  TagMutationService,
  type CreateTagInput,
  type UpdateTagInput,
} from './tag-mutation-service';
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
  private readonly mutationService: TagMutationService;
  private readonly mergeService: TagMergeService;
  private readonly archiveService: TagArchiveService;
  private readonly deleteService: TagDeleteService;

  constructor(supabase: SupabaseClient<Database>) {
    this.queryService = new TagQueryService(supabase);
    this.mutationService = new TagMutationService(supabase, this.queryService);
    this.mergeService = new TagMergeService(supabase, this.queryService);
    this.archiveService = new TagArchiveService(supabase, this.queryService);
    this.deleteService = new TagDeleteService(supabase, this.queryService);
  }

  async listHierarchy(options: { userId: string }): Promise<TagTreeNode[]> {
    return this.queryService.listHierarchy(options.userId);
  }

  /**
   * タグ一覧取得
   *
   * Note: サーバーサイドキャッシュ（unstable_cache）は一時的に無効化。
   * Next.js 15 + tRPCではrevalidateTag()がtRPCコンテキストで正しく動作せず、
   * タグ作成後もキャッシュが古いデータを返す問題があるため。
   * TanStack Queryのクライアントキャッシュ（5分）で十分にパフォーマンスは確保できる。
   *
   * @param options - 取得オプション（userId, ソート条件）
   * @returns タグ配列
   */
  async list(options: ListTagsOptions): Promise<Tag[]> {
    return this.queryService.list(options);
  }

  /**
   * タグID指定で取得
   *
   * @param options - userId と tagId
   * @returns タグ
   */
  async getById(options: {
    userId: string;
    tagId: string;
    includeInactive?: boolean;
  }): Promise<Tag> {
    return this.queryService.getById(options);
  }

  /**
   * タグ作成
   *
   * @param options - userId と作成データ
   * @returns 作成されたタグ
   */
  async create(options: { userId: string; input: CreateTagInput }): Promise<Tag> {
    return this.mutationService.create(options);
  }

  /**
   * タグ更新
   *
   * @param options - userId, tagId と更新データ
   * @returns 更新されたタグ
   */
  async update(options: { userId: string; tagId: string; updates: UpdateTagInput }): Promise<Tag> {
    return this.mutationService.update(options);
  }

  /**
   * タグマージ（atomic）
   *
   * @param options - マージオプション
   * @returns マージ結果
   */
  async merge(options: MergeTagsOptions): Promise<MergeTagsResult> {
    return this.mergeService.merge(options);
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

  /**
   * タグをアーカイブする（親タグは子タグを道連れにする）
   */
  async archive(options: {
    userId: string;
    tagId: string;
  }): Promise<{ tag: Tag; archivedChildCount: number }> {
    return this.archiveService.archive(options);
  }

  /**
   * アーカイブ済みタグを復元する
   */
  async restore(options: {
    userId: string;
    tagId: string;
  }): Promise<{ tag: Tag; restoredChildCount: number; conflictedChildCount: number }> {
    return this.archiveService.restore(options);
  }

  /**
   * タグ削除（関連 Plan / Record は FK で未分類化される）
   *
   * @returns 削除されたタグ
   */
  async delete(options: { userId: string; tagId: string }): Promise<Tag> {
    return this.deleteService.delete(options);
  }

  /**
   * タグ並び替え（バッチ更新）
   *
   * sort_orderをバッチ更新します。
   * 楽観的更新との併用を想定。
   *
   * @param options - userId と更新配列
   * @returns 更新されたタグ数
   */
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
