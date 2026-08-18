import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity, Category } from '../types';
import type { ActivitiesQueryService } from './activities-query-service';
import { createActivitiesDatabaseError } from './activity-service-error';

/**
 * Category / Activity 削除のビジネスロジック。
 *
 * カテゴリー削除は `activities_category_owner_fkey` の
 * `ON DELETE SET NULL (category_id)` が所属 activity を未分類へ落とす
 * （migration §7 の複合 FK invariant が保証）。tags の子タグ昇格のような
 * アプリ側の明示的な promote 処理は不要。
 */
export class ActivitiesDeleteService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly queryService: ActivitiesQueryService,
  ) {}

  async deleteCategory(options: { userId: string; categoryId: string }): Promise<Category> {
    const { userId, categoryId } = options;
    const category = await this.queryService.getCategoryById({
      userId,
      categoryId,
      includeArchived: true,
    });

    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', userId);

    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'DELETE_FAILED',
        'Failed to delete category',
        'delete_category',
      );
    }

    return category;
  }

  async deleteActivity(options: { userId: string; activityId: string }): Promise<Activity> {
    const { userId, activityId } = options;
    const activity = await this.queryService.getActivityById({
      userId,
      activityId,
      includeArchived: true,
    });

    const { error } = await this.supabase
      .from('activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', userId);

    if (error) {
      throw createActivitiesDatabaseError(
        error,
        'DELETE_FAILED',
        'Failed to delete activity',
        'delete_activity',
      );
    }

    return activity;
  }
}
