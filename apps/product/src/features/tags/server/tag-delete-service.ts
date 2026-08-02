import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag, TagDeleteStrategy } from '../types';
import { applyTagStrategy, countTagAssociations } from './tag-association-strategy';
import type { TagQueryService } from './tag-query-service';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';
import { getNextSortOrder } from './tag-sort-order';

/**
 * タグ削除のビジネスロジック
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
}
