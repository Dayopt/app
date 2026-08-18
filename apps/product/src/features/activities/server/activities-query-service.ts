import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity, ActivityTree, Category } from '../types';
import { transformDbActivity, transformDbCategory } from './activity-row-transform';
import { ActivitiesServiceError, createActivitiesDatabaseError } from './activity-service-error';

/**
 * Category / Activity の取得系ロジック。
 *
 * 所有者チェックは複合 FK（activities.category_id, user_id）が担保するため、
 * ここでは `.eq('user_id', userId)` のフィルタのみで足りる
 * （migration コメント §所有者整合参照）。
 */
export class ActivitiesQueryService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listCategories(options: {
    userId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Category[]> {
    const query = this.supabase
      .from('categories')
      .select('*')
      .eq('user_id', options.userId)
      .order('name', { ascending: true });

    if (!options.includeArchived) {
      query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'FETCH_FAILED',
        'Failed to fetch categories',
        'list_categories',
      );
    }
    return data.map(transformDbCategory);
  }

  async getCategoryById(options: {
    userId: string;
    categoryId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Category> {
    const query = this.supabase
      .from('categories')
      .select('*')
      .eq('id', options.categoryId)
      .eq('user_id', options.userId);
    if (!options.includeArchived) query.is('archived_at', null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'FETCH_FAILED',
        'Failed to fetch category',
        'get_category_by_id',
      );
    }
    if (!data) {
      throw new ActivitiesServiceError('NOT_FOUND', `Category not found: ${options.categoryId}`);
    }
    return transformDbCategory(data);
  }

  async listActivities(options: {
    userId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Activity[]> {
    const query = this.supabase
      .from('activities')
      .select('*')
      .eq('user_id', options.userId)
      .order('name', { ascending: true });

    if (!options.includeArchived) {
      query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'FETCH_FAILED',
        'Failed to fetch activities',
        'list_activities',
      );
    }
    return data.map(transformDbActivity);
  }

  async getActivityById(options: {
    userId: string;
    activityId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Activity> {
    const query = this.supabase
      .from('activities')
      .select('*')
      .eq('id', options.activityId)
      .eq('user_id', options.userId);
    if (!options.includeArchived) query.is('archived_at', null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'FETCH_FAILED',
        'Failed to fetch activity',
        'get_activity_by_id',
      );
    }
    if (!data) {
      throw new ActivitiesServiceError('NOT_FOUND', `Activity not found: ${options.activityId}`);
    }
    return transformDbActivity(data);
  }

  /**
   * サイドバー用スナップショット: カテゴリー + 所属 Activity + 未分類 Activity を
   * 1 回の 2 select（categories, activities）で読む。N+1 を避けるため、
   * カテゴリーごとに個別 select しない。
   *
   * アーカイブ済みの行は含めない（サイドバーは通常表示専用）。ただし現役の
   * アクティビティは、所属カテゴリーがアーカイブ済みでも未分類として必ず出す。
   */
  async listTree(options: { userId: string }): Promise<ActivityTree> {
    const [categoriesResult, activitiesResult] = await Promise.all([
      this.supabase
        .from('categories')
        .select('*')
        .eq('user_id', options.userId)
        .is('archived_at', null)
        .order('name', { ascending: true }),
      this.supabase
        .from('activities')
        .select('*')
        .eq('user_id', options.userId)
        .is('archived_at', null)
        .order('name', { ascending: true }),
    ]);

    if (categoriesResult.error) {
      throw createActivitiesDatabaseError(
        categoriesResult.error,
        'FETCH_FAILED',
        'Failed to fetch categories',
        'list_tree_categories',
      );
    }
    if (activitiesResult.error) {
      throw createActivitiesDatabaseError(
        activitiesResult.error,
        'FETCH_FAILED',
        'Failed to fetch activities',
        'list_tree_activities',
      );
    }

    const categories = categoriesResult.data.map(transformDbCategory);
    const activities = activitiesResult.data.map(transformDbActivity);

    // カテゴリーのアーカイブは所属アクティビティを道連れにしない。その結果
    // 「現役アクティビティだが所属カテゴリーはアーカイブ済み」という行があり、
    // 見出しが出ない以上どのカテゴリー配下にも置けない。未分類へ寄せる。
    // ここで拾わないとサイドバーから黙って消える（予定・記録には残ったまま）。
    const visibleCategoryIds = new Set(categories.map((category) => category.id));

    const activitiesByCategory = new Map<string, Activity[]>();
    const uncategorized: Activity[] = [];
    for (const activity of activities) {
      if (activity.category_id === null || !visibleCategoryIds.has(activity.category_id)) {
        uncategorized.push(activity);
        continue;
      }
      const bucket = activitiesByCategory.get(activity.category_id);
      if (bucket) {
        bucket.push(activity);
      } else {
        activitiesByCategory.set(activity.category_id, [activity]);
      }
    }

    return {
      categories: categories.map((category) => ({
        category,
        activities: activitiesByCategory.get(category.id) ?? [],
      })),
      uncategorized,
    };
  }
}
