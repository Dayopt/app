import 'server-only';

/**
 * Tag Service
 *
 * タグ操作の公開 API（facade）。実装はドメイン単位の service に分割されている:
 * - 取得系: `tag-query-service.ts`
 * - 作成・更新: `tag-mutation-service.ts`
 * - マージ: `tag-merge-service.ts`
 * - 削除: `tag-delete-service.ts`
 * - 並び替え: `tag-reorder-service.ts`
 *
 * キャッシュ戦略:
 * - [一時的に無効化] unstable_cache()によるサーバーサイドキャッシュ
 *   → Next.js 15 + tRPCでrevalidateTag()が正しく動作しないため
 * - TanStack Queryのクライアントキャッシュ（5分）で対応
 */

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag, TagDeleteStrategy, TagTreeNode } from '../types';
import { TagDeleteService } from './tag-delete-service';
import { TagMergeService, type MergeTagsOptions, type MergeTagsResult } from './tag-merge-service';
import {
  TagMutationService,
  type CreateTagInput,
  type UpdateTagInput,
} from './tag-mutation-service';
import { TagQueryService } from './tag-query-service';
import { TagReorderService, type ReorderTagUpdate } from './tag-reorder-service';

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
  private readonly reorderService: TagReorderService;
  private readonly mutationService: TagMutationService;
  private readonly mergeService: TagMergeService;
  private readonly deleteService: TagDeleteService;

  constructor(supabase: SupabaseClient<Database>) {
    this.queryService = new TagQueryService(supabase);
    this.reorderService = new TagReorderService(supabase);
    this.mutationService = new TagMutationService(supabase, this.queryService);
    this.mergeService = new TagMergeService(supabase, this.queryService);
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
   * タグ削除
   *
   * @param options - userId, tagId, strategy（任意）, targetTagId（reassign時必須）
   * @returns 削除されたタグ
   */
  async delete(options: {
    userId: string;
    tagId: string;
    strategy?: TagDeleteStrategy;
    targetTagId?: string;
  }): Promise<Tag> {
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
  async reorder(options: {
    userId: string;
    updates: ReorderTagUpdate[];
  }): Promise<{ count: number }> {
    return this.reorderService.reorder(options);
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
