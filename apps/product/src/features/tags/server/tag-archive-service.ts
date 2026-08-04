import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '../types';
import type { TagQueryService } from './tag-query-service';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';
import { getNextSortOrder } from './tag-sort-order';

/**
 * タグのアーカイブ / 復元
 *
 * アーカイブは `archived_at` のセットのみで、Plan / Record には触れない。
 * `is_active = false`（マージ済みの墓標）とは独立した状態
 * （docs/product/log/2026-08-03-tag-archive-design.md）。
 */
export class TagArchiveService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: TagQueryService,
  ) {}

  /**
   * タグをアーカイブする。親タグの場合は未アーカイブの子タグも同時刻で道連れにする
   * （復元時に同一バッチとして識別するため、timestamp は 1 操作で共有する）。
   *
   * @returns アーカイブしたタグと、道連れになった子タグの件数
   */
  async archive(options: {
    userId: string;
    tagId: string;
  }): Promise<{ tag: Tag; archivedChildCount: number }> {
    const { userId, tagId } = options;
    const tag = await this.queryService.getById({ userId, tagId });

    if (tag.archived_at) {
      return { tag, archivedChildCount: 0 };
    }

    const archivedAt = new Date().toISOString();

    const { data: archivedRows, error } = await this.supabase
      .from('tags')
      .update({ archived_at: archivedAt })
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('archived_at', null)
      .or(`id.eq.${tagId},parent_id.eq.${tagId}`)
      .select('id');

    if (error) {
      throw createTagDatabaseError(error, 'UPDATE_FAILED', 'Failed to archive tag', 'archive_tag');
    }
    if (!archivedRows?.some((row) => row.id === tagId)) {
      throw new TagServiceError('NOT_FOUND', `Tag not found: ${tagId}`);
    }

    return {
      tag: { ...tag, archived_at: archivedAt },
      archivedChildCount: archivedRows.length - 1,
    };
  }

  /**
   * アーカイブ済みタグを復元する。
   *
   * - 親タグの復元では、同じ archive 操作で道連れになった子タグ
   *   （`archived_at` が同一時刻）も一緒に復元する
   * - 子タグを個別復元する時、親がアーカイブ中・マージ済み・消滅済みなら
   *   root タグとして復元する（親は巻き戻さない）
   * - 同名の通常タグが既に存在する場合は DUPLICATE_NAME で拒否し、
   *   リネームしてからの復元を促す
   *
   * @returns 復元したタグと、一緒に復元した子タグの件数
   */
  async restore(options: {
    userId: string;
    tagId: string;
  }): Promise<{ tag: Tag; restoredChildCount: number; conflictedChildCount: number }> {
    const { userId, tagId } = options;
    const tag = await this.queryService.getById({ userId, tagId });

    if (!tag.archived_at) {
      return { tag, restoredChildCount: 0, conflictedChildCount: 0 };
    }

    let parentId = tag.parent_id;
    let sortOrder: number | null = null;
    if (parentId) {
      const { data: parent, error: parentError } = await this.supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('id', parentId)
        .eq('is_active', true)
        .is('archived_at', null)
        .maybeSingle();
      if (parentError) {
        throw createTagDatabaseError(
          parentError,
          'FETCH_FAILED',
          'Failed to inspect parent tag',
          'inspect_restore_parent',
        );
      }
      if (!parent) {
        parentId = null;
        sortOrder = await getNextSortOrder(this.supabase, userId, null);
      }
    }

    const { error: restoreError } = await this.supabase
      .from('tags')
      .update({
        archived_at: null,
        parent_id: parentId,
        ...(sortOrder !== null ? { sort_order: sortOrder } : {}),
      })
      .eq('user_id', userId)
      .eq('id', tagId);

    if (restoreError) {
      if (restoreError.code === '23505') {
        throw new TagServiceError('DUPLICATE_NAME', 'A tag with the same name already exists');
      }
      throw createTagDatabaseError(
        restoreError,
        'UPDATE_FAILED',
        'Failed to restore tag',
        'restore_tag',
      );
    }

    let restoredChildCount = 0;
    let conflictedChildCount = 0;
    if (!tag.parent_id) {
      const { data: childRows, error: childrenSelectError } = await this.supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('parent_id', tagId)
        .eq('archived_at', tag.archived_at);

      if (childrenSelectError) {
        throw createTagDatabaseError(
          childrenSelectError,
          'FETCH_FAILED',
          'Failed to inspect child tags',
          'inspect_restore_children',
        );
      }

      // 単一 UPDATE だと子 1 件の同名衝突で statement 全体が失敗し、
      // 道連れになった子タグ全員が黙ってアーカイブに残ってしまう。
      // 子タグ数は小さい前提で 1 件ずつ復元し、衝突した子だけスキップする。
      for (const child of childRows ?? []) {
        const { error: childUpdateError } = await this.supabase
          .from('tags')
          .update({ archived_at: null })
          .eq('user_id', userId)
          .eq('id', child.id);

        if (childUpdateError) {
          // 親の復元自体は完了している。同名衝突はその子だけアーカイブに残す
          if (childUpdateError.code === '23505') {
            conflictedChildCount += 1;
            continue;
          }
          throw createTagDatabaseError(
            childUpdateError,
            'UPDATE_FAILED',
            'Failed to restore child tags',
            'restore_child_tags',
          );
        }
        restoredChildCount += 1;
      }
    }

    return {
      tag: { ...tag, archived_at: null, parent_id: parentId },
      restoredChildCount,
      conflictedChildCount,
    };
  }
}
