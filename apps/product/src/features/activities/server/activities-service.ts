import 'server-only';

/**
 * Activities Service
 *
 * Category / Activity 操作の公開 API（facade）。実装は責務単位の service に
 * 分割されている:
 * - 取得系: `activities-query-service.ts`
 * - 作成・更新: `activities-mutation-service.ts`
 * - アーカイブ / 復元: `activities-archive-service.ts`
 * - 削除: `activities-delete-service.ts`
 *
 * tags と異なりマージ・階層が無いため、対応する service は存在しない。
 */

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity, ActivityTree, Category } from '../types';
import { ActivitiesArchiveService } from './activities-archive-service';
import { ActivitiesDeleteService } from './activities-delete-service';
import {
  ActivitiesMutationService,
  type CreateActivityInput,
  type CreateCategoryInput,
  type UpdateActivityInput,
  type UpdateCategoryInput,
} from './activities-mutation-service';
import { ActivitiesQueryService } from './activities-query-service';

// 公開するのは createActivitiesService だけ。エラー型は
// './activity-service-error' から直接 import する（re-export すると経路が 2 本になる）。
class ActivitiesService {
  private readonly queryService: ActivitiesQueryService;
  private readonly mutationService: ActivitiesMutationService;
  private readonly archiveService: ActivitiesArchiveService;
  private readonly deleteService: ActivitiesDeleteService;

  constructor(supabase: SupabaseClient<Database>) {
    this.queryService = new ActivitiesQueryService(supabase);
    this.mutationService = new ActivitiesMutationService(supabase, this.queryService);
    this.archiveService = new ActivitiesArchiveService(supabase, this.queryService);
    this.deleteService = new ActivitiesDeleteService(supabase, this.queryService);
  }

  // ----- Categories -----

  async listCategories(options: {
    userId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Category[]> {
    return this.queryService.listCategories(options);
  }

  async createCategory(options: { userId: string; input: CreateCategoryInput }): Promise<Category> {
    return this.mutationService.createCategory(options);
  }

  async updateCategory(options: {
    userId: string;
    categoryId: string;
    updates: UpdateCategoryInput;
  }): Promise<Category> {
    return this.mutationService.updateCategory(options);
  }

  async archiveCategory(options: { userId: string; categoryId: string }): Promise<Category> {
    return this.archiveService.archiveCategory(options);
  }

  async restoreCategory(options: { userId: string; categoryId: string }): Promise<Category> {
    return this.archiveService.restoreCategory(options);
  }

  async deleteCategory(options: { userId: string; categoryId: string }): Promise<Category> {
    return this.deleteService.deleteCategory(options);
  }

  // ----- Activities -----

  async listActivities(options: {
    userId: string;
    includeArchived?: boolean | undefined;
  }): Promise<Activity[]> {
    return this.queryService.listActivities(options);
  }

  async createActivity(options: { userId: string; input: CreateActivityInput }): Promise<Activity> {
    return this.mutationService.createActivity(options);
  }

  async updateActivity(options: {
    userId: string;
    activityId: string;
    updates: UpdateActivityInput;
  }): Promise<Activity> {
    return this.mutationService.updateActivity(options);
  }

  async archiveActivity(options: { userId: string; activityId: string }): Promise<Activity> {
    return this.archiveService.archiveActivity(options);
  }

  async restoreActivity(options: { userId: string; activityId: string }): Promise<Activity> {
    return this.archiveService.restoreActivity(options);
  }

  async deleteActivity(options: { userId: string; activityId: string }): Promise<Activity> {
    return this.deleteService.deleteActivity(options);
  }

  // ----- Tree (サイドバー用スナップショット) -----

  async listTree(options: { userId: string }): Promise<ActivityTree> {
    return this.queryService.listTree(options);
  }
}

export function createActivitiesService(supabase: SupabaseClient<Database>): ActivitiesService {
  return new ActivitiesService(supabase);
}
