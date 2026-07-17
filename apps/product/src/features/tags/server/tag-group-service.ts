import 'server-only';

import type { Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractTagSuffixes, partitionByExistingName } from '../domain/tag-ungroup';
import type { Tag } from '../types';
import type { TagMergeService } from './tag-merge-service';
import { transformDbTag, type DbTagRow } from './tag-row-transform';
import { TagServiceError } from './tag-service-error';

/**
 * グループ（コロン記法プレフィックス）操作のビジネスロジック
 */
export class TagGroupService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly mergeService: TagMergeService,
  ) {}

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
      const original = captureUnexpectedDatabaseError(rpcError, {
        feature: 'tags',
        operation: 'rename_tag_group',
      });
      throw new TagServiceError('UPDATE_FAILED', 'Failed to rename tag group', {
        cause: original,
      });
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
      const original = captureUnexpectedDatabaseError(fetchError, {
        feature: 'tags',
        operation: 'fetch_tag_group',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch tag group', { cause: original });
    }

    if (!matchingTags || matchingTags.length === 0) {
      return { count: 0, mergedCount: 0 };
    }

    // 各タグの suffix を算出
    const tagSuffixes = extractTagSuffixes(matchingTags);

    // 全 suffix 名で既存タグを一括検索（衝突チェック）
    const suffixNames = [...new Set(tagSuffixes.map((t) => t.suffix))];
    const { data: existingTags, error: existingTagsError } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .in('name', suffixNames);

    if (existingTagsError) {
      const original = captureUnexpectedDatabaseError(existingTagsError, {
        feature: 'tags',
        operation: 'check_ungroup_conflicts',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to check tag conflicts', {
        cause: original,
      });
    }

    const existingByName = new Map((existingTags ?? []).map((t) => [t.name, t]));

    // 衝突と非衝突を分類
    const { conflicts, nonConflicts } = partitionByExistingName(tagSuffixes, existingByName);

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
      await this.mergeService.merge({
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
        const original = captureUnexpectedDatabaseError(renameError, {
          feature: 'tags',
          operation: 'batch_rename_ungrouped_tags',
        });
        throw new TagServiceError('UPDATE_FAILED', 'Failed to ungroup tags', {
          cause: original,
        });
      }
    }

    // prefix 名の単体タグが存在するか確認（リネーム後の状態で再チェック）
    const willHavePrefix = nonConflicts.some((t) => t.suffix === prefix);
    if (!willHavePrefix) {
      const { data: existingParent, error: parentLookupError } = await this.supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('name', prefix)
        .maybeSingle();

      if (parentLookupError) {
        const original = captureUnexpectedDatabaseError(parentLookupError, {
          feature: 'tags',
          operation: 'find_ungroup_parent_tag',
        });
        throw new TagServiceError('FETCH_FAILED', 'Failed to find parent tag', {
          cause: original,
        });
      }

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
          const original = captureUnexpectedDatabaseError(createError, {
            feature: 'tags',
            operation: 'create_ungroup_parent_tag',
          });
          throw new TagServiceError('CREATE_FAILED', 'Failed to create parent tag', {
            cause: original,
          });
        }
      }
    }

    return { count: nonConflicts.length + mergedCount, mergedCount };
  }
}
