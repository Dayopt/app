import 'server-only';

import type { Row } from '@/lib/database';
import type { Tag } from '../types';

/** DB タグ行の型 */
type DbTagRow = Row<'tags'>;

/**
 * DBのタグ行をフロントエンド用の Tag 型に変換
 */
export function transformDbTag(dbTag: DbTagRow): Tag {
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
