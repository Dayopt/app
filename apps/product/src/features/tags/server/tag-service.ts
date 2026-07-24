import 'server-only';

/**
 * Tag Service
 *
 * タグ操作の公開 API（facade）。実装はドメイン単位の service に分割されている:
 * - 取得系: `tag-query-service.ts`
 * - 作成・更新: `tag-mutation-service.ts`
 * - マージ: `tag-merge-service.ts`
 * - 削除（単体 / グループ）: `tag-delete-service.ts`
 * - グループ操作（リネーム / 解除）: `tag-group-service.ts`
 * - 並び替え: `tag-reorder-service.ts`
 * - 統計: `tag-statistics-service.ts`
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
import { TagGroupService } from './tag-group-service';
import { TagMergeService, type MergeTagsOptions, type MergeTagsResult } from './tag-merge-service';
import {
  TagMutationService,
  type CreateTagInput,
  type UpdateTagInput,
} from './tag-mutation-service';
import { TagQueryService } from './tag-query-service';
import { TagReorderService, type ReorderTagUpdate } from './tag-reorder-service';
import { TagStatisticsService, type TagStatsRow } from './tag-statistics-service';

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
  private readonly statisticsService: TagStatisticsService;
  private readonly mutationService: TagMutationService;
  private readonly mergeService: TagMergeService;
  private readonly deleteService: TagDeleteService;
  private readonly groupService: TagGroupService;

  constructor(supabase: SupabaseClient<Database>) {
    this.queryService = new TagQueryService(supabase);
    this.reorderService = new TagReorderService(supabase);
    this.statisticsService = new TagStatisticsService(supabase);
    this.mutationService = new TagMutationService(supabase, this.queryService);
    this.mergeService = new TagMergeService(supabase, this.queryService);
    this.deleteService = new TagDeleteService(supabase, this.queryService);
    this.groupService = new TagGroupService(supabase, this.mergeService);
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

  /** MCP read adapter向けにDB projectionを公開fieldへ限定する。 */
  async listForMcp(options: { userId: string; signal?: AbortSignal }): Promise<Tag[]> {
    return this.queryService.listForMcp(options.userId, options.signal);
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
   * グループ（コロン記法プレフィックス）の一括リネーム
   *
   * @param options - userId, oldPrefix, newPrefix
   * @returns 更新されたタグ配列
   */
  async renameGroup(options: {
    userId: string;
    oldPrefix: string;
    newPrefix: string;
  }): Promise<Tag[]> {
    return this.groupService.renameGroup(options);
  }

  /**
   * グループ解除（コロン記法プレフィックスを除去）
   *
   * @param options - userId, prefix, mergeConflicts
   * @returns 更新されたタグ数とマージされたタグ数
   */
  async ungroupTags(options: {
    userId: string;
    prefix: string;
    mergeConflicts?: boolean;
  }): Promise<{ count: number; mergedCount: number }> {
    return this.groupService.ungroupTags(options);
  }

  /**
   * グループ削除（コロン記法プレフィックスのタグを一括削除）
   *
   * @param options - userId, prefix, strategy（任意）, targetTagId（reassign時必須）
   * @returns 削除されたタグ数
   */
  async deleteGroup(options: {
    userId: string;
    prefix: string;
    strategy?: TagDeleteStrategy;
    targetTagId?: string;
  }): Promise<{ deletedCount: number }> {
    return this.deleteService.deleteGroup(options);
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

  /**
   * タグ使用統計取得
   *
   * Record を正としてタグ使用数・最終利用日時を集計する
   *
   * @param options - userId
   * @returns タグ統計の配列
   */
  async getStats(options: { userId: string }): Promise<TagStatsRow[]> {
    return this.statisticsService.getStatsFromRecords(options.userId);
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
