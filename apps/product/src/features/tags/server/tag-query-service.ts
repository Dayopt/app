import 'server-only';

import type { Database, Row } from '@/lib/database';
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

  async getById(options: {
    userId: string;
    tagId: string;
    includeInactive?: boolean;
  }): Promise<Tag> {
    const query = this.supabase
      .from('tags')
      .select('*')
      .eq('id', options.tagId)
      .eq('user_id', options.userId);
    if (!options.includeInactive) query.eq('is_active', true);
    const { data, error } = await query.maybeSingle();
    if (error && error.code !== 'PGRST116') {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'tags',
        operation: 'get_tag_by_id',
      });
      throw new TagServiceError('FETCH_FAILED', 'Failed to fetch tag', { cause: original });
    }
    if (!data) {
      throw new TagServiceError('NOT_FOUND', `Tag not found: ${options.tagId}`);
    }
    return transformDbTag(data);
  }
}
