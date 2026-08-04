import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '../types';
import type { TagQueryService } from './tag-query-service';
import { createTagDatabaseError } from './tag-service-error';
import { getNextSortOrder } from './tag-sort-order';

/**
 * タグ削除のビジネスロジック
 *
 * タグ行を削除するだけで、関連 Plan / Record には触れない。
 * `plans.tag_id` / `records.tag_id` の FK は ON DELETE SET NULL のため、
 * 時間データは残って未分類（tag_id = NULL）になる（#1576）。
 */
export class TagDeleteService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: TagQueryService,
  ) {}

  /**
   * タグ削除
   *
   * 通常の子タグは root へ昇格させる。アーカイブ済みの子タグは
   * `tags.parent_id` の FK（ON DELETE SET NULL）で root のまま
   * アーカイブに残る。
   *
   * @returns 削除されたタグ
   */
  async delete(options: { userId: string; tagId: string }): Promise<Tag> {
    const { userId, tagId } = options;

    // 所有権チェック
    const tag = await this.queryService.getById({ userId, tagId });
    const { data: childTags, error: childTagsError } = await this.supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .eq('parent_id', tagId)
      .eq('is_active', true)
      .is('archived_at', null);

    if (childTagsError) {
      throw createTagDatabaseError(
        childTagsError,
        'FETCH_FAILED',
        'Failed to inspect tag children',
        'inspect_tag_children',
      );
    }

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
