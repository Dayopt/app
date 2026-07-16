import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag, TagDeleteStrategy } from '../types';
import { applyTagStrategy, countTagAssociations } from './tag-association-strategy';
import type { TagQueryService } from './tag-query-service';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';
import { getNextSortOrder } from './tag-sort-order';

/**
 * タグ削除（単体 / グループ一括）のビジネスロジック
 */
export class TagDeleteService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: TagQueryService,
  ) {}

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
    const tag = await this.queryService.getById({ userId, tagId });
    const { data: childTags, error: childTagsError } = await this.supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .eq('parent_id', tagId)
      .eq('is_active', true);

    if (childTagsError) {
      throw createTagDatabaseError(
        childTagsError,
        'FETCH_FAILED',
        'Failed to inspect tag children',
        'inspect_tag_children',
      );
    }

    // 関連 Plan / Record がある場合は strategy 必須（暗黙削除させない）
    if (!strategy) {
      const associationCount = await countTagAssociations(this.supabase, userId, [tagId]);
      if (associationCount > 0) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Tag has associated blocks. Specify a strategy: "delete_blocks" or "reassign"',
        );
      }
    }

    if (strategy === 'reassign') {
      if (!targetTagId) {
        throw new TagServiceError('INVALID_INPUT', 'targetTagId is required for reassign strategy');
      }
      // 付け替え先の所有権チェック
      await this.queryService.getById({ userId, tagId: targetTagId });
    }
    await applyTagStrategy({
      userId,
      tagIds: [tagId],
      strategy: strategy ?? 'delete_blocks',
      ...(targetTagId ? { targetTagId } : {}),
    });

    if ((childTags?.length ?? 0) > 0) {
      const nextRootSortOrder = await getNextSortOrder(this.supabase, userId, null);
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
        throw createTagDatabaseError(
          promoteChildrenError,
          'UPDATE_FAILED',
          'Failed to promote child tags',
          'promote_child_tags',
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
      throw createTagDatabaseError(error, 'DELETE_FAILED', 'Failed to delete tag', 'delete_tag');
    }

    return tag;
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
      throw createTagDatabaseError(
        fetchError,
        'FETCH_FAILED',
        'Failed to fetch group tags',
        'fetch_group_tags_for_deletion',
      );
    }

    if (!matchingTags || matchingTags.length === 0) {
      return { deletedCount: 0 };
    }

    const tagIds = matchingTags.map((t) => t.id);

    // 関連 Plan / Record がある場合は strategy 必須（暗黙削除させない）
    if (!strategy) {
      const associationCount = await countTagAssociations(this.supabase, userId, tagIds);
      if (associationCount > 0) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Tags in this group have associated blocks. Specify a strategy: "delete_blocks" or "reassign"',
        );
      }
    }

    if (strategy === 'reassign') {
      if (!targetTagId) {
        throw new TagServiceError('INVALID_INPUT', 'targetTagId is required for reassign strategy');
      }
      await this.queryService.getById({ userId, tagId: targetTagId });
    }
    await applyTagStrategy({
      userId,
      tagIds,
      strategy: strategy ?? 'delete_blocks',
      ...(targetTagId ? { targetTagId } : {}),
    });

    // タグを一括削除
    const { error: deleteError } = await this.supabase
      .from('tags')
      .delete()
      .in('id', tagIds)
      .eq('user_id', userId);

    if (deleteError) {
      throw createTagDatabaseError(
        deleteError,
        'DELETE_FAILED',
        'Failed to delete tag group',
        'delete_tag_group',
      );
    }

    return { deletedCount: tagIds.length };
  }
}
