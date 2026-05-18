import 'server-only';

/**
 * Tag Service
 *
 * タグCRUD操作のビジネスロジック層
 *
 * 主な機能:
 * - タグ一覧取得（ソート対応）
 * - タグ作成
 * - タグ更新（リネーム、色変更）
 * - タグマージ（関連付け移行 + ソース削除）
 * - タグ削除
 *
 * キャッシュ戦略:
 * - [一時的に無効化] unstable_cache()によるサーバーサイドキャッシュ
 *   → Next.js 15 + tRPCでrevalidateTag()が正しく動作しないため
 * - TanStack Queryのクライアントキャッシュ（5分）で対応
 */

import type { Database } from '@/lib/database.types';
import { ServiceError } from '@/lib/trpc/errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTagTree, flattenTagTree } from '../lib/tag-tree';
import type { Tag, TagDeleteStrategy, TagTreeNode } from '../types';

/** DB タグ行の型 */
type DbTagRow = Database['public']['Tables']['tags']['Row'];

/**
 * DBのタグ行をフロントエンド用の Tag 型に変換
 */
function transformDbTag(dbTag: DbTagRow): Tag {
  return {
    id: dbTag.id,
    name: dbTag.name,
    user_id: dbTag.user_id,
    color: dbTag.color,
    icon: dbTag.icon,
    is_active: dbTag.is_active,
    parent_id: dbTag.parent_id ?? null,
    sort_order: dbTag.sort_order,
    created_at: dbTag.created_at,
    updated_at: dbTag.updated_at,
  };
}

/** タグ作成入力 */
export interface CreateTagInput {
  name: string;
  color?: string | undefined;
  icon?: string | undefined;
  parentId?: string | null | undefined;
}

/** タグ更新入力 */
export interface UpdateTagInput {
  name?: string | undefined;
  color?: string | undefined;
  icon?: string | null | undefined;
  parentId?: string | null | undefined;
}

/** タグ一覧取得オプション */
export interface ListTagsOptions {
  userId: string;
  sortField?: 'name' | 'created_at' | 'updated_at' | 'tag_number' | 'sort_order' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

/** タグマージオプション */
export interface MergeTagsOptions {
  userId: string;
  sourceTagId: string;
  targetTagId: string;
  mergeAssociations?: boolean | undefined;
  deleteSource?: boolean | undefined;
}

/** タグマージ結果 */
export interface MergeTagsResult {
  success: true;
  mergedAssociations: number;
  targetTag: Tag;
}

/** タグ並び替え更新 */
export interface ReorderTagUpdate {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

/**
 * Tag Service エラー
 */
export class TagServiceError extends ServiceError {
  constructor(
    code:
      | 'FETCH_FAILED'
      | 'CREATE_FAILED'
      | 'UPDATE_FAILED'
      | 'DELETE_FAILED'
      | 'NOT_FOUND'
      | 'DUPLICATE_NAME'
      | 'INVALID_INPUT'
      | 'MERGE_FAILED'
      | 'SAME_TAG_MERGE'
      | 'TARGET_NOT_FOUND'
      | 'UNGROUP_CONFLICTS'
      | 'GROUP_NAME_CONFLICT',
    message: string,
  ) {
    super(code, message);
    this.name = 'TagServiceError';
  }
}

/**
 * Tag Service
 */
export class TagService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  private async listRows(userId: string): Promise<DbTagRow[]> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${error.message}`);
    }

    return data;
  }

  private async getNextSortOrder(userId: string, parentId: string | null): Promise<number> {
    const query = this.supabase
      .from('tags')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (parentId) {
      query.eq('parent_id', parentId);
    } else {
      query.is('parent_id', null);
    }

    const { data, error } = await query.order('sort_order', { ascending: false }).limit(1);

    if (error) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to resolve sibling sort order: ${error.message}`,
      );
    }

    const maxSortOrder = data?.[0]?.sort_order ?? -1;
    return maxSortOrder + 1;
  }

  private async makeRoomAtTop(userId: string, parentId: string | null): Promise<void> {
    const query = this.supabase
      .from('tags')
      .select('id, sort_order')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (parentId) {
      query.eq('parent_id', parentId);
    } else {
      query.is('parent_id', null);
    }

    const { data: siblings, error } = await query.order('sort_order', { ascending: true });

    if (error) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to resolve sibling sort order: ${error.message}`,
      );
    }

    if (!siblings || siblings.length === 0) return;

    const { error: reorderError } = await this.supabase.rpc('batch_reorder_tags_hierarchy', {
      p_user_id: userId,
      p_tag_ids: siblings.map((tag) => tag.id),
      p_parent_ids: siblings.map(() => parentId) as never,
      p_sort_orders: siblings.map((tag) => tag.sort_order + 1),
    });

    if (reorderError) {
      throw new TagServiceError(
        'UPDATE_FAILED',
        `Failed to shift tag sort orders: ${reorderError.message}`,
      );
    }
  }

  async listHierarchy(options: { userId: string }): Promise<TagTreeNode[]> {
    const rows = await this.listRows(options.userId);
    return buildTagTree(rows.map(transformDbTag));
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
    const { userId, sortField, sortOrder } = options;

    if (sortField === undefined || sortField === 'sort_order') {
      const hierarchy = await this.listHierarchy({ userId });
      return flattenTagTree(hierarchy);
    }

    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order(sortField, {
        ascending: (sortOrder ?? 'asc') === 'asc',
        nullsFirst: false,
      })
      .order('name', { ascending: true });

    if (error) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${error.message}`);
    }

    return data.map(transformDbTag);
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
    const { userId, tagId, includeInactive = false } = options;

    const query = this.supabase.from('tags').select('*').eq('id', tagId).eq('user_id', userId);

    if (!includeInactive) {
      query.eq('is_active', true);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      throw new TagServiceError('NOT_FOUND', `Tag not found: ${tagId}`);
    }

    return transformDbTag(data);
  }

  /**
   * タグ作成
   *
   * @param options - userId と作成データ
   * @returns 作成されたタグ
   */
  async create(options: { userId: string; input: CreateTagInput }): Promise<Tag> {
    const { userId, input } = options;

    // バリデーション
    if (!input.name || input.name.trim().length === 0) {
      throw new TagServiceError('INVALID_INPUT', 'Tag name is required');
    }

    if (input.name.trim().length > 50) {
      throw new TagServiceError('INVALID_INPUT', 'Tag name must be 50 characters or less');
    }

    const parentId = input.parentId ?? null;

    if (parentId) {
      // 2 階層モデルを保つため「親自身がすでに子タグである」場合のみ弾く。
      // 「親が子を持っているか」ではない (sibling は何個でも作れる)。
      const parentTag = await this.getById({ userId, tagId: parentId });

      if (parentTag.parent_id !== null) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Cannot create a child under a tag that already has a parent',
        );
      }
    }

    await this.makeRoomAtTop(userId, parentId);

    // タグデータ作成（sort_order = 0で先頭に追加）
    const tagData: Database['public']['Tables']['tags']['Insert'] = {
      user_id: userId,
      name: input.name.trim(),
      color: input.color || 'blue',
      icon: input.icon ?? null,
      is_active: true,
      parent_id: parentId,
      sort_order: 0,
    };

    const { data, error } = await this.supabase.from('tags').insert(tagData).select().single();

    if (error) {
      if (error.code === '23505') {
        throw new TagServiceError('DUPLICATE_NAME', 'Tag with this name already exists');
      }
      throw new TagServiceError('CREATE_FAILED', `Failed to create tag: ${error.message}`);
    }

    return transformDbTag(data);
  }

  /**
   * タグ更新
   *
   * @param options - userId, tagId と更新データ
   * @returns 更新されたタグ
   */
  async update(options: { userId: string; tagId: string; updates: UpdateTagInput }): Promise<Tag> {
    const { userId, tagId, updates } = options;

    // 所有権チェック（エラーが発生すれば NOT_FOUND になる）
    const existingTag = await this.getById({ userId, tagId });

    // バリデーション
    if (updates.name !== undefined) {
      if (updates.name.trim().length === 0) {
        throw new TagServiceError('INVALID_INPUT', 'Tag name cannot be empty');
      }
      if (updates.name.trim().length > 50) {
        throw new TagServiceError('INVALID_INPUT', 'Tag name must be 50 characters or less');
      }
    }

    // 更新データ準備
    const updateData: Database['public']['Tables']['tags']['Update'] = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.parentId !== undefined) {
      const nextParentId = updates.parentId;

      if (nextParentId === tagId) {
        throw new TagServiceError('INVALID_INPUT', 'A tag cannot be its own parent');
      }

      if (nextParentId) {
        const nextParent = await this.getById({ userId, tagId: nextParentId });
        if (nextParent.parent_id !== null) {
          throw new TagServiceError(
            'INVALID_INPUT',
            'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.',
          );
        }

        const { count: childCount, error: childCountError } = await this.supabase
          .from('tags')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('parent_id', tagId)
          .eq('is_active', true);

        if (childCountError) {
          throw new TagServiceError(
            'FETCH_FAILED',
            `Failed to verify tag children: ${childCountError.message}`,
          );
        }

        if ((childCount ?? 0) > 0) {
          throw new TagServiceError(
            'INVALID_INPUT',
            'Cannot move a tag with children to be a child of another tag.',
          );
        }
      }

      updateData.parent_id = nextParentId;
      if (nextParentId !== existingTag.parent_id) {
        updateData.sort_order = await this.getNextSortOrder(userId, nextParentId);
      }
    }

    const { data, error } = await this.supabase
      .from('tags')
      .update(updateData)
      .eq('id', tagId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new TagServiceError('DUPLICATE_NAME', 'Tag with this name already exists');
      }
      throw new TagServiceError('UPDATE_FAILED', `Failed to update tag: ${error.message}`);
    }

    return transformDbTag(data);
  }

  /**
   * グループ（コロン記法プレフィックス）の一括リネーム
   *
   * 例: oldPrefix="開発" → newPrefix="仕事" の場合
   *   "開発:api" → "仕事:api"
   *   "開発:frontend" → "仕事:frontend"
   *
   * @param options - userId, oldPrefix, newPrefix
   * @returns 更新されたタグ配列
   */
  async renameGroup(options: {
    userId: string;
    oldPrefix: string;
    newPrefix: string;
  }): Promise<Tag[]> {
    const { userId, oldPrefix, newPrefix } = options;

    if (oldPrefix === newPrefix) {
      return [];
    }

    // RPC で1クエリにバッチリネーム
    const { data: updatedTags, error: rpcError } = await this.supabase.rpc('rename_tag_group', {
      p_user_id: userId,
      p_old_prefix: oldPrefix,
      p_new_prefix: newPrefix,
    });

    if (rpcError) {
      if (rpcError.code === '23505') {
        throw new TagServiceError('DUPLICATE_NAME', 'A tag with the new name already exists');
      }
      throw new TagServiceError('UPDATE_FAILED', `Failed to rename group: ${rpcError.message}`);
    }

    if (!updatedTags || updatedTags.length === 0) {
      return [];
    }

    return (updatedTags as DbTagRow[]).map(transformDbTag);
  }

  /**
   * グループ解除（コロン記法プレフィックスを除去）
   *
   * 例: prefix="AA" の場合
   *   "AA:api" → "api"（非衝突: リネーム）
   *   "AA:BB"  → "BB" が既存 → BB に統合（mergeConflicts=true 時）
   *
   * prefix 名の単体タグが存在しなければ自動作成して残す。
   *
   * @param options - userId, prefix, mergeConflicts
   * @returns 更新されたタグ数とマージされたタグ数
   */
  async ungroupTags(options: {
    userId: string;
    prefix: string;
    mergeConflicts?: boolean;
  }): Promise<{ count: number; mergedCount: number }> {
    const { userId, prefix, mergeConflicts = false } = options;

    // prefix: で始まるタグを全取得
    const { data: matchingTags, error: fetchError } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .like('name', `${prefix}:%`);

    if (fetchError) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to fetch group tags: ${fetchError.message}`,
      );
    }

    if (!matchingTags || matchingTags.length === 0) {
      return { count: 0, mergedCount: 0 };
    }

    // 各タグの suffix を算出
    const tagSuffixes = matchingTags.map((tag) => {
      const colonIndex = tag.name.indexOf(':');
      return {
        tag,
        suffix: colonIndex !== -1 ? tag.name.slice(colonIndex + 1) : tag.name,
      };
    });

    // 全 suffix 名で既存タグを一括検索（衝突チェック）
    const suffixNames = [...new Set(tagSuffixes.map((t) => t.suffix))];
    const { data: existingTags } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .in('name', suffixNames);

    const existingByName = new Map((existingTags ?? []).map((t) => [t.name, t]));

    // 衝突と非衝突を分類
    const conflicts = tagSuffixes.filter((t) => existingByName.has(t.suffix));
    const nonConflicts = tagSuffixes.filter((t) => !existingByName.has(t.suffix));

    // 衝突があるが mergeConflicts が false → エラー（衝突リストを返す）
    if (conflicts.length > 0 && !mergeConflicts) {
      throw new TagServiceError('UNGROUP_CONFLICTS', conflicts.map((c) => c.suffix).join(', '));
    }

    // 衝突タグをマージ（既存の merge RPC で entries.tag_id 移行 + ソース削除）
    // NOTE: 複数マージのうち途中で失敗した場合、処理済み分はロールバックされない。
    // merge() は RPC ベースのトランザクションのため個別は安全だが、全体は非トランザクション。
    let mergedCount = 0;
    for (const conflict of conflicts) {
      const targetTag = existingByName.get(conflict.suffix)!;
      await this.merge({
        userId,
        sourceTagId: conflict.tag.id,
        targetTagId: targetTag.id,
      });
      mergedCount++;
    }

    // 非衝突タグをRPCで1クエリにバッチリネーム（suffix 部分のみに）
    if (nonConflicts.length > 0) {
      const { error: renameError } = await this.supabase.rpc('batch_rename_tags', {
        p_user_id: userId,
        p_tag_ids: nonConflicts.map(({ tag }) => tag.id),
        p_new_names: nonConflicts.map(({ suffix }) => suffix),
      });

      if (renameError) {
        throw new TagServiceError(
          'UPDATE_FAILED',
          `Failed to ungroup tags: ${renameError.message}`,
        );
      }
    }

    // prefix 名の単体タグが存在するか確認（リネーム後の状態で再チェック）
    const willHavePrefix = nonConflicts.some((t) => t.suffix === prefix);
    if (!willHavePrefix) {
      const { data: existingParent } = await this.supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('name', prefix)
        .maybeSingle();

      if (!existingParent) {
        const representativeColor = matchingTags[0]?.color ?? 'blue';
        const representativeIcon = matchingTags[0]?.icon ?? null;
        const { error: createError } = await this.supabase
          .from('tags')
          .insert({
            user_id: userId,
            name: prefix,
            color: representativeColor,
            icon: representativeIcon,
            is_active: true,
            sort_order: 0,
          })
          .select()
          .single();

        if (createError && createError.code !== '23505') {
          throw new TagServiceError(
            'CREATE_FAILED',
            `Failed to create parent tag: ${createError.message}`,
          );
        }
      }
    }

    return { count: nonConflicts.length + mergedCount, mergedCount };
  }

  /**
   * グループ削除（コロン記法プレフィックスのタグを一括削除）
   *
   * 例: prefix="開発" の場合
   *   "開発:api", "開発:frontend" を全削除
   *   関連する entries も処理
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
    const { userId, prefix, strategy, targetTagId } = options;

    // prefix: で始まるタグを全取得
    const { data: matchingTags, error: fetchError } = await this.supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .like('name', `${prefix}:%`);

    if (fetchError) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to fetch group tags: ${fetchError.message}`,
      );
    }

    if (!matchingTags || matchingTags.length === 0) {
      return { deletedCount: 0 };
    }

    const tagIds = matchingTags.map((t) => t.id);

    // 関連エントリがある場合は strategy 必須（参照ありのタグは暗黙削除させない）
    if (!strategy) {
      const { count } = await this.supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .in('tag_id', tagIds)
        .eq('user_id', userId);

      if (count && count > 0) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Tags in this group have associated entries. Specify a strategy: "delete_entries" or "reassign"',
        );
      }
    }

    if (strategy === 'reassign') {
      if (!targetTagId) {
        throw new TagServiceError('INVALID_INPUT', 'targetTagId is required for reassign strategy');
      }
      await this.getById({ userId, tagId: targetTagId });

      // entries.tag_id を targetTagId に付け替え
      const { error: reassignError } = await this.supabase
        .from('entries')
        .update({ tag_id: targetTagId })
        .in('tag_id', tagIds)
        .eq('user_id', userId);

      if (reassignError) {
        throw new TagServiceError(
          'UPDATE_FAILED',
          `Failed to reassign entries: ${reassignError.message}`,
        );
      }
    } else {
      // delete_entries または strategy なし — 関連エントリを直接削除
      const { error: entriesError } = await this.supabase
        .from('entries')
        .delete()
        .in('tag_id', tagIds)
        .eq('user_id', userId);

      if (entriesError) {
        throw new TagServiceError(
          'DELETE_FAILED',
          `Failed to delete entries: ${entriesError.message}`,
        );
      }
    }

    // タグを一括削除
    const { error: deleteError } = await this.supabase
      .from('tags')
      .delete()
      .in('id', tagIds)
      .eq('user_id', userId);

    if (deleteError) {
      throw new TagServiceError('DELETE_FAILED', `Failed to delete group: ${deleteError.message}`);
    }

    return { deletedCount: tagIds.length };
  }

  /**
   * タグマージ（atomic）
   *
   * `merge_tags_with_hierarchy` RPC で entries 移動 + children 再 parent +
   * source 非アクティブ化を 1 transaction にまとめて実行する。途中失敗時は全体
   * rollback されるため partial state は発生しない。
   *
   * @param options - マージオプション
   * @returns マージ結果
   */
  async merge(options: MergeTagsOptions): Promise<MergeTagsResult> {
    const { userId, sourceTagId, targetTagId } = options;

    if (sourceTagId === targetTagId) {
      throw new TagServiceError('SAME_TAG_MERGE', 'Cannot merge a tag with itself');
    }

    // 早期 validation: 両 tag の存在 + child→parent merge ガード。
    // 同じガードは RPC 内部にもあるが、TS 側でも実施することで意味のあるエラー
    // メッセージ (`TagServiceError` の code) を呼び出し側に渡せる。
    const [, targetTag] = await Promise.all([
      this.getById({ userId, tagId: sourceTagId }),
      this.getById({ userId, tagId: targetTagId }),
    ]);

    const { count: sourceChildrenCount, error: sourceChildrenError } = await this.supabase
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('parent_id', sourceTagId)
      .eq('is_active', true);

    if (sourceChildrenError) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to inspect source tag children: ${sourceChildrenError.message}`,
      );
    }

    if ((sourceChildrenCount ?? 0) > 0 && targetTag.parent_id !== null) {
      throw new TagServiceError('INVALID_INPUT', 'Cannot merge a parent tag into a child tag.');
    }

    const { data: rpcData, error: rpcError } = await this.supabase.rpc(
      'merge_tags_with_hierarchy',
      {
        p_user_id: userId,
        p_source_tag_id: sourceTagId,
        p_target_tag_id: targetTagId,
      },
    );

    if (rpcError) {
      throw new TagServiceError(
        'MERGE_FAILED',
        `Failed to merge tags atomically: ${rpcError.message}`,
      );
    }

    const migrated =
      (rpcData as { migrated?: number; children_reparented?: number } | null)?.migrated ?? 0;

    return {
      success: true,
      mergedAssociations: migrated,
      targetTag,
    };
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
    const { userId, tagId, strategy, targetTagId } = options;

    // 所有権チェック
    const tag = await this.getById({ userId, tagId });
    const { data: childTags, error: childTagsError } = await this.supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .eq('parent_id', tagId)
      .eq('is_active', true);

    if (childTagsError) {
      throw new TagServiceError(
        'FETCH_FAILED',
        `Failed to inspect tag children: ${childTagsError.message}`,
      );
    }

    // 関連エントリがある場合は strategy 必須（参照ありのタグは暗黙削除させない）
    if (!strategy) {
      const { count } = await this.supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', tagId)
        .eq('user_id', userId);

      if (count && count > 0) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Tag has associated entries. Specify a strategy: "delete_entries" or "reassign"',
        );
      }
    }

    if (strategy === 'reassign') {
      if (!targetTagId) {
        throw new TagServiceError('INVALID_INPUT', 'targetTagId is required for reassign strategy');
      }
      // 付け替え先の所有権チェック
      await this.getById({ userId, tagId: targetTagId });

      // entries.tag_id を targetTagId に付け替え
      const { error: reassignError } = await this.supabase
        .from('entries')
        .update({ tag_id: targetTagId })
        .eq('tag_id', tagId)
        .eq('user_id', userId);

      if (reassignError) {
        throw new TagServiceError(
          'UPDATE_FAILED',
          `Failed to reassign entries: ${reassignError.message}`,
        );
      }
    } else {
      // delete_entries または strategy なし（0件タグ）
      // 関連エントリを直接削除
      await this.supabase.from('entries').delete().eq('tag_id', tagId).eq('user_id', userId);
    }

    if ((childTags?.length ?? 0) > 0) {
      const nextRootSortOrder = await this.getNextSortOrder(userId, null);
      const childUpdateResults = await Promise.all(
        childTags.map((child, index) =>
          this.supabase
            .from('tags')
            .update({ parent_id: null, sort_order: nextRootSortOrder + index })
            .eq('user_id', userId)
            .eq('id', child.id),
        ),
      );

      const promoteChildrenError = childUpdateResults.find((result) => result.error)?.error;
      if (promoteChildrenError) {
        throw new TagServiceError(
          'UPDATE_FAILED',
          `Failed to promote child tags: ${promoteChildrenError.message}`,
        );
      }
    }

    // タグ削除
    const { error } = await this.supabase
      .from('tags')
      .delete()
      .eq('id', tagId)
      .eq('user_id', userId);

    if (error) {
      throw new TagServiceError('DELETE_FAILED', `Failed to delete tag: ${error.message}`);
    }

    return tag;
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
    const { userId, updates } = options;

    if (updates.length === 0) {
      return { count: 0 };
    }

    // 所有権チェック: 更新対象のタグがすべてユーザーのものか確認
    const tagIds = updates.map((u) => u.id);
    const { data: existingTags, error: fetchError } = await this.supabase
      .from('tags')
      .select('id,parent_id')
      .eq('user_id', userId)
      .in('id', tagIds);

    if (fetchError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to verify tags: ${fetchError.message}`);
    }

    const existingIds = new Set(existingTags?.map((t) => t.id) || []);
    const invalidIds = tagIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new TagServiceError('NOT_FOUND', `Tags not found: ${invalidIds.join(', ')}`);
    }

    const currentById = new Map(existingTags?.map((tag) => [tag.id, tag.parent_id ?? null]) ?? []);
    for (const update of updates) {
      if (update.parent_id === update.id) {
        throw new TagServiceError('INVALID_INPUT', 'A tag cannot be its own parent');
      }
      if (update.parent_id && currentById.get(update.parent_id) !== null) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.',
        );
      }
    }

    const { data: updatedCount, error: rpcError } = await this.supabase.rpc(
      'batch_reorder_tags_hierarchy',
      {
        p_user_id: userId,
        p_tag_ids: updates.map((u) => u.id),
        p_parent_ids: updates.map((u) => u.parent_id) as never,
        p_sort_orders: updates.map((u) => u.sort_order),
      },
    );

    if (rpcError) {
      throw new TagServiceError('UPDATE_FAILED', `Failed to reorder tags: ${rpcError.message}`);
    }

    return { count: typeof updatedCount === 'number' ? updatedCount : updates.length };
  }

  /**
   * タグ使用統計取得
   *
   * DB側集計関数 get_tag_stats を使用（5クエリ → 1 RPC に最適化）
   *
   * @param options - userId
   * @returns タグ統計の配列
   */
  async getStats(options: { userId: string }): Promise<TagStatsRow[]> {
    const { userId } = options;

    // タグ基本情報を取得
    const { data: tags, error: tagsError } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (tagsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${tagsError.message}`);
    }

    if (!tags || tags.length === 0) {
      return [];
    }

    // DB側集計関数で plan_count, record_count, last_used を一括取得
    const { data: statsRows, error: statsError } = await this.supabase.rpc('get_tag_stats', {
      p_user_id: userId,
    });

    if (statsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tag stats: ${statsError.message}`);
    }

    // RPC結果をMapに変換
    const statsMap = new Map<string, { entry_count: number; last_used: string | null }>();
    for (const row of statsRows ?? []) {
      statsMap.set(row.tag_id, {
        entry_count: row.entry_count,
        last_used: row.last_used,
      });
    }

    const statsData: TagStatsRow[] = tags.map((tag) => {
      const stats = statsMap.get(tag.id);
      const entryCount = stats?.entry_count ?? 0;
      return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        entry_count: entryCount,
        last_used_at: stats?.last_used ?? null,
      };
    });

    statsData.sort((a, b) => b.entry_count - a.entry_count);

    return statsData;
  }
}

export type { TagDeleteStrategy } from '../types';

/** タグ統計の型 */
export interface TagStatsRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  entry_count: number;
  last_used_at: string | null;
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
