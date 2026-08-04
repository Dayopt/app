import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toParentIdsRpcArg } from './tag-rpc-args';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';

export interface ReorderTagUpdate {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

export class TagReorderService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async reorder(options: {
    userId: string;
    updates: ReorderTagUpdate[];
  }): Promise<{ count: number }> {
    const { userId, updates } = options;
    if (updates.length === 0) return { count: 0 };

    const tagIds = updates.map((update) => update.id);
    const { data: existingTags, error: fetchError } = await this.supabase
      .from('tags')
      .select('id,parent_id,archived_at')
      .eq('user_id', userId)
      .in('id', tagIds);
    if (fetchError) {
      throw createTagDatabaseError(
        fetchError,
        'FETCH_FAILED',
        'Failed to verify tags',
        'verify_reordered_tags',
      );
    }

    const existingIds = new Set(existingTags?.map((tag) => tag.id) ?? []);
    const invalidIds = tagIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new TagServiceError('NOT_FOUND', `Tags not found: ${invalidIds.join(', ')}`);
    }

    const currentById = new Map(existingTags?.map((tag) => [tag.id, tag.parent_id ?? null]) ?? []);
    // アーカイブ判定は tag-mutation-service.ts の update()（archived 親への move 拒否）・
    // tag-merge-service.ts の merge()（archived target への merge 拒否）と同じ「TS 側で
    // 早期検証し、意味のある TagServiceError code を返す」方針を踏襲する。batch_reorder_
    // tags_hierarchy RPC（PL/pgSQL）は凍結資産のため検証を追加しない（architecture.md）。
    // RPC 内で検証しても TOCTOU 自体は解消できない一方、既存ガードと検証層を揃えることで
    // 挙動の一貫性を優先する。
    //
    // 別タブでアーカイブされた後に古い drag payload が届くと、(a) アーカイブ済みタグ自身の
    // 並び替え、(b) アクティブなタグがアーカイブ済み親の子になる、の 2 通りで階層が壊れる
    // ため、reorder 対象タグ自身と親候補の両方を検証する。
    const archivedById = new Map(
      existingTags?.map((tag) => [tag.id, Boolean(tag.archived_at)]) ?? [],
    );
    for (const update of updates) {
      if (update.parent_id === update.id) {
        throw new TagServiceError('INVALID_INPUT', 'A tag cannot be its own parent');
      }
      if (archivedById.get(update.id)) {
        throw new TagServiceError('TAG_ARCHIVED', 'Cannot reorder an archived tag');
      }
      if (update.parent_id) {
        if (currentById.get(update.parent_id) !== null) {
          throw new TagServiceError(
            'INVALID_INPUT',
            'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.',
          );
        }
        if (archivedById.get(update.parent_id)) {
          throw new TagServiceError('TAG_ARCHIVED', 'Cannot move a tag under an archived tag');
        }
      }
    }

    const { data: updatedCount, error: rpcError } = await this.supabase.rpc(
      'batch_reorder_tags_hierarchy',
      {
        p_user_id: userId,
        p_tag_ids: updates.map((update) => update.id),
        p_parent_ids: toParentIdsRpcArg(updates.map((update) => update.parent_id)),
        p_sort_orders: updates.map((update) => update.sort_order),
      },
    );
    if (rpcError) {
      throw createTagDatabaseError(
        rpcError,
        'UPDATE_FAILED',
        'Failed to reorder tags',
        'reorder_tags',
      );
    }
    return { count: typeof updatedCount === 'number' ? updatedCount : updates.length };
  }
}
