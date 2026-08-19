import 'server-only';

import type { Database, Row } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTagTree, flattenTagTree } from '../domain/tag-tree';
import type { Tag, TagTreeNode } from '../types';
import { TagServiceError } from './tag-service-error';

type DbTagRow = Row<'tags'>;

function transformDbTag(dbTag: DbTagRow): Tag {
  return {
    id: dbTag.id,
    name: dbTag.name,
    user_id: dbTag.user_id,
    color: dbTag.color,
    icon: dbTag.icon,
    is_active: dbTag.is_active,
    archived_at: dbTag.archived_at,
    parent_id: dbTag.parent_id ?? null,
    sort_order: dbTag.sort_order,
    created_at: dbTag.created_at,
    updated_at: dbTag.updated_at,
  };
}

export class TagQueryService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listHierarchy(userId: string): Promise<TagTreeNode[]> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('archived_at', null);
    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'tags',
        operation: 'list_tag_hierarchy',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch tags', { cause: original });
    }
    return buildTagTree(data.map(transformDbTag));
  }

  async list(options: {
    userId: string;
    sortField?: 'name' | 'created_at' | 'updated_at' | 'tag_number' | 'sort_order' | undefined;
    sortOrder?: 'asc' | 'desc' | undefined;
  }): Promise<Tag[]> {
    if (options.sortField === undefined || options.sortField === 'sort_order') {
      return flattenTagTree(await this.listHierarchy(options.userId));
    }
    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', options.userId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order(options.sortField, {
        ascending: (options.sortOrder ?? 'asc') === 'asc',
        nullsFirst: false,
      })
      .order('name', { ascending: true });
    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'tags',
        operation: 'list_tags',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch tags', { cause: original });
    }
    return data.map(transformDbTag);
  }

  /**
   * 通常タグとアーカイブ済みタグを **1 回の select** で読む（#1825）
   *
   * `list()` と `listArchived()` を並行に呼ぶと 2 つの独立したスナップショット
   * になり、その間にアーカイブが commit されると同じタグが両方に現れて ID が
   * 重複するか、どちらにも現れず過去データの tagId を解決できなくなる。
   * 単一 select なら 1 スナップショットなので、この窓が構造的に消える。
   *
   * 並びは 2 本呼びの時と同じ（通常タグは階層順、その後ろにアーカイブ済みを
   * 新しい順）に保つ。docs/product/specs/tags.md がこの順序を契約にしている。
   *
   * `is_active = false`（マージ済みの墓標）はどちらにも含めない。
   */
  async listWithArchived(userId: string): Promise<{ active: Tag[]; archived: Tag[] }> {
    // PostgREST の max_rows（supabase/config.toml）が 1 クエリごとに効くため、
    // 2 本呼びの時と違って active と archived が同じ上限を分け合う。無言で
    // 欠けると過去データの tagId が解決できなくなるので、総数と突き合わせて
    // 切り捨てを検出する。
    const { data, count, error } = await this.supabase
      .from('tags')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true);
    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'tags',
        operation: 'list_tags_with_archived',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch tags', { cause: original });
    }

    if (count !== null && count > data.length) {
      logger.warn('Tag read was truncated by the row limit', {
        feature: 'tags',
        operation: 'list_tags_with_archived',
        returned: data.length,
        total: count,
      });
    }

    const tags = data.map(transformDbTag);
    return {
      active: flattenTagTree(buildTagTree(tags)),
      archived: tags
        .filter((tag) => tag.archived_at !== null)
        .sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? '')),
    };
  }

  /**
   * アーカイブ済みタグの一覧（新しくアーカイブした順）
   *
   * `is_active = false`（マージ済みの墓標）は含めない。
   */
  async listArchived(userId: string): Promise<Tag[]> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'tags',
        operation: 'list_archived_tags',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch archived tags', {
        cause: original,
      });
    }
    return data.map(transformDbTag);
  }
}
