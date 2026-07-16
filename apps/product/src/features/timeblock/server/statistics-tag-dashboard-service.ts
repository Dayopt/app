import 'server-only';

/**
 * 統計 service — タグ詳細ダッシュボード（旧 `tagStatisticsRouter.getTagDashboard`）
 */

import { databaseTables } from '@/lib/database';
import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import {
  buildTagDashboard,
  type TagDashboardTagRow,
  type TagDashboardTimeblockRow,
} from '../domain/tag-dashboard';

import type { StatPlanRow, StatRecordRow } from './statistics-fetchers';
import type { ServiceSupabaseClient } from './types';

export interface TagDashboardInput {
  tagId: string;
  startDate: string;
  endDate: string;
  limit: number;
}

export class StatisticsTagDashboardService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  async getTagDashboard(userId: string, { tagId, startDate, endDate, limit }: TagDashboardInput) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const [tag, records, plans] = await Promise.all([
      this.fetchTagById(userId, tagId),
      this.fetchRecordsOverlapping(userId, tagId, startDate, endDate),
      this.fetchPlansOverlapping(userId, tagId, startDate, endDate),
    ]);

    const plansById = new Map(plans.map((plan) => [plan.id, plan]));

    // 1 plan に複数 record（分割記録）が紐づく場合、予定時間の二重計上を避けるため
    // 「代表 record」1 件だけに planned range を割り当てる。from_plan があればそれを優先する。
    const primaryRecordIdByPlanId = new Map<string, string>();
    for (const record of records) {
      if (record.plan_id == null) continue;
      const currentId = primaryRecordIdByPlanId.get(record.plan_id);
      if (!currentId) {
        primaryRecordIdByPlanId.set(record.plan_id, record.id);
        continue;
      }
      if (record.source === 'from_plan') {
        primaryRecordIdByPlanId.set(record.plan_id, record.id);
      }
    }

    const rows: TagDashboardTimeblockRow[] = records.map((record) => {
      const plan = record.plan_id ? plansById.get(record.plan_id) : undefined;
      const isPrimary =
        record.plan_id != null && primaryRecordIdByPlanId.get(record.plan_id) === record.id;
      return {
        id: record.id,
        title: record.title,
        description: record.note,
        start_time: isPrimary && plan ? plan.start_at : null,
        end_time: isPrimary && plan ? plan.end_at : null,
        actual_start_time: record.start_at,
        actual_end_time: record.end_at,
        tag_id: record.tag_id,
      };
    });

    // 未記録・未 skip の plan は「予定のみ」の行として残す（実績時間は 0）。
    const recordedPlanIds = new Set(
      records.map((record) => record.plan_id).filter((id): id is string => id != null),
    );
    for (const plan of plans) {
      if (recordedPlanIds.has(plan.id) || plan.skipped_at) continue;
      rows.push({
        id: plan.id,
        title: plan.title,
        description: plan.note,
        start_time: plan.start_at,
        end_time: plan.end_at,
        actual_start_time: null,
        actual_end_time: null,
        tag_id: plan.tag_id,
      });
    }

    return buildTagDashboard({ tag, rows, limit, timezone });
  }

  private async fetchTagById(userId: string, tagId: string): Promise<TagDashboardTagRow> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('id', tagId)
      .eq('is_active', true)
      .single();
    if (error || !data) throw new Error(`Tag not found: ${error?.message ?? tagId}`);
    return data;
  }

  private async fetchRecordsOverlapping(
    userId: string,
    tagId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<StatRecordRow & { title: string; note: string | null }>> {
    const { data, error } = await this.supabase
      .from(databaseTables.records)
      .select('id, title, note, tag_id, plan_id, source, start_at, end_at')
      .eq('user_id', userId)
      .eq('tag_id', tagId)
      .is('deleted_at', null)
      .lt('start_at', endDate)
      .gt('end_at', startDate)
      .order('start_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch records for tag dashboard: ${error.message}`);
    return data ?? [];
  }

  private async fetchPlansOverlapping(
    userId: string,
    tagId: string,
    startDate: string,
    endDate: string,
  ): Promise<
    Array<StatPlanRow & { title: string; note: string | null; skipped_at: string | null }>
  > {
    const { data, error } = await this.supabase
      .from('plans')
      .select('id, title, note, tag_id, start_at, end_at, skipped_at')
      .eq('user_id', userId)
      .eq('tag_id', tagId)
      .is('deleted_at', null)
      .lt('start_at', endDate)
      .gt('end_at', startDate)
      .order('start_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch plans for tag dashboard: ${error.message}`);
    return data ?? [];
  }
}
