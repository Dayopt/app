import 'server-only';

import type { Row } from '@/lib/database';
import type { Activity, Category } from '../types';

type DbCategoryRow = Row<'categories'>;
type DbActivityRow = Row<'activities'>;

/** DB のカテゴリー行をフロントエンド用の Category 型に変換 */
export function transformDbCategory(dbCategory: DbCategoryRow): Category {
  return {
    id: dbCategory.id,
    name: dbCategory.name,
    user_id: dbCategory.user_id,
    color: dbCategory.color,
    icon: dbCategory.icon,
    archived_at: dbCategory.archived_at,
    created_at: dbCategory.created_at,
    updated_at: dbCategory.updated_at,
  };
}

/** DB のアクティビティ行をフロントエンド用の Activity 型に変換 */
export function transformDbActivity(dbActivity: DbActivityRow): Activity {
  return {
    id: dbActivity.id,
    name: dbActivity.name,
    user_id: dbActivity.user_id,
    category_id: dbActivity.category_id,
    archived_at: dbActivity.archived_at,
    created_at: dbActivity.created_at,
    updated_at: dbActivity.updated_at,
  };
}
