import 'server-only';

import type { Database, Insert, Update } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '../types';
import type { TagQueryService } from './tag-query-service';
import { transformDbTag } from './tag-row-transform';
import { TagServiceError } from './tag-service-error';
import { getNextSortOrder, makeRoomAtTop } from './tag-sort-order';

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

/**
 * タグ作成・更新のビジネスロジック
 */
export class TagMutationService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: TagQueryService,
  ) {}

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
      const parentTag = await this.queryService.getById({ userId, tagId: parentId });

      if (parentTag.parent_id !== null) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Cannot create a child under a tag that already has a parent',
        );
      }
    }

    await makeRoomAtTop(this.supabase, userId, parentId);

    // タグデータ作成（sort_order = 0で先頭に追加）
    const tagData: Insert<'tags'> = {
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
    const existingTag = await this.queryService.getById({ userId, tagId });

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
    const updateData: Update<'tags'> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.parentId !== undefined) {
      const nextParentId = updates.parentId;

      if (nextParentId === tagId) {
        throw new TagServiceError('INVALID_INPUT', 'A tag cannot be its own parent');
      }

      if (nextParentId) {
        const nextParent = await this.queryService.getById({ userId, tagId: nextParentId });
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
        updateData.sort_order = await getNextSortOrder(this.supabase, userId, nextParentId);
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
}
