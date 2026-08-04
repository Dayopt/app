import 'server-only';

import type { Database } from '@/lib/database';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '../types';
import type { TagQueryService } from './tag-query-service';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';

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

/**
 * タグマージのビジネスロジック
 */
export class TagMergeService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: TagQueryService,
  ) {}

  /**
   * タグマージ（atomic）
   *
   * `merge_tags_with_hierarchy` RPC で関連 Timeblock を移動し、children を再 parent する。
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
      this.queryService.getById({ userId, tagId: sourceTagId }),
      this.queryService.getById({ userId, tagId: targetTagId }),
    ]);

    // target がアーカイブ済みなら拒否する。アーカイブは「選択候補から隠す」状態なので、
    // 新規タグ付与だけでなくマージ先としての利用も拒否する（別タブでアーカイブされた後の
    // 古いマージダイアログや直接の tags.merge 呼び出しで全 Plan / Record が
    // アーカイブ済みタグへ移ってしまうのを防ぐ）。source がアーカイブ済みなのは許可する
    // （アーカイブ済みタグをアクティブなタグへ統合する正当な操作のため）。
    if (targetTag.archived_at) {
      throw new TagServiceError('TAG_ARCHIVED', 'Cannot merge into an archived tag');
    }

    const { count: sourceChildrenCount, error: sourceChildrenError } = await this.supabase
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('parent_id', sourceTagId)
      .eq('is_active', true);

    if (sourceChildrenError) {
      throw createTagDatabaseError(
        sourceChildrenError,
        'FETCH_FAILED',
        'Failed to inspect source tag children',
        'inspect_source_tag_children',
      );
    }

    if ((sourceChildrenCount ?? 0) > 0 && targetTag.parent_id !== null) {
      throw new TagServiceError('INVALID_INPUT', 'Cannot merge a parent tag into a child tag.');
    }

    const adminClient = createServiceRoleClient();
    const { data: rpcData, error: rpcError } = await adminClient.rpc('merge_tags_with_hierarchy', {
      p_user_id: userId,
      p_source_tag_id: sourceTagId,
      p_target_tag_id: targetTagId,
    });

    if (rpcError) {
      throw createTagDatabaseError(
        rpcError,
        'MERGE_FAILED',
        'Failed to merge tags atomically',
        'merge_tags',
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
}
