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

    // 同名衝突は子へ触れる前に弾く。子を先に復元する構造では、ここで弾かないと
    // 「子だけ復元済み・親はアーカイブのまま」がユーザーに見える状態として残る。
    // 一意制約が archived_at IS NULL の行だけを見る partial index なので、
    // アーカイブ中に同名タグを作れてしまう（tags.md）。つまりこの衝突は稀な
    // レースではなく通常フローで起こりうる。
    await this.assertRestoredNameAvailable(userId, tag, parentId);

    // 子 → 親の順で復元する。逆順にすると、親の archived_at が消えた時点で
    // 「同じアーカイブ操作で道連れになった子」を特定する手がかりが失われ、
    // 途中で失敗するとリトライしても残りの子を永久に復元できない（#1826）。
    // この順序なら親が archived_at を保持したままなので、リトライは冒頭の
    // 早期 return を通過し、復元済みの子は下の select 条件から自然に外れる。
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
      //
      // 書き込むのは archived_at だけに保つ。parent_id を触ると
      // check_tag_has_children が発火し、さらにこの時点では親がまだ
      // アーカイブ中なので、子が root タグとして切り離される。
      for (const child of childRows ?? []) {
        const { error: childUpdateError } = await this.supabase
          .from('tags')
          .update({ archived_at: null })
          .eq('user_id', userId)
          .eq('id', child.id);

        if (childUpdateError) {
          // 同名衝突はその子だけアーカイブに残し、残りの復元は続ける
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
        // preflight を通り抜けたレース。子は復元済みで親はアーカイブのまま
        // 残るが、リネーム後に再復元すれば残りが収束する。
        throw new TagServiceError('DUPLICATE_NAME', 'A tag with the same name already exists');
      }
      throw createTagDatabaseError(
        restoreError,
        'UPDATE_FAILED',
        'Failed to restore tag',
        'restore_tag',
      );
    }

    return {
      tag: { ...tag, archived_at: null, parent_id: parentId },
      restoredChildCount,
      conflictedChildCount,
    };
  }

  /**
   * 復元後の名前が既存の通常タグとぶつからないかを、どこにも書き込む前に確かめる。
   *
   * 一意制約 (`tags_user_root_name_unique` / `tags_user_parent_name_unique`) は
   * `archived_at IS NULL` の行だけを対象にする partial index なので、対象タグが
   * アーカイブ中の間に同名タグを新規作成できる。復元時の衝突はその結果であって
   * 例外的なレースではない。
   *
   * これは最終保証ではなく早期リターン。通り抜けたレースは親 UPDATE の 23505 が
   * 受け止める。
   */
  private async assertRestoredNameAvailable(
    userId: string,
    tag: Tag,
    parentId: string | null,
  ): Promise<void> {
    const siblings = this.supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .eq('name', tag.name)
      .eq('is_active', true)
      .is('archived_at', null);

    const { data: conflict, error } = await (
      parentId === null ? siblings.is('parent_id', null) : siblings.eq('parent_id', parentId)
    ).maybeSingle();

    if (error) {
      throw createTagDatabaseError(
        error,
        'FETCH_FAILED',
        'Failed to inspect restore name conflict',
        'inspect_restore_name_conflict',
      );
    }
    if (conflict) {
      throw new TagServiceError('DUPLICATE_NAME', 'A tag with the same name already exists');
    }
  }
}
