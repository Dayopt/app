import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';

/**
 * セグメント（分析用の保存されたクエリ）の CRUD。
 *
 * セグメントは所属ではなく横断参照なので、`features/activities`（所属軸）ではなく
 * 分析側の feature に置く。保存するのは**アクティビティの集合だけ**で、期間・指標・
 * グルーピングは持たせない（#2162 §6-4。列を足さないこと自体がレポートビルダー化への
 * 制約になる）。
 *
 * 所有者整合は複合 FK（`(segment_id, user_id)` / `(activity_id, user_id)`）が担保する
 * ため、ここでは `.eq('user_id', userId)` のフィルタで足りる。他人のアクティビティを
 * 混ぜる insert は DB 側が FK 違反で弾く（`segment-schema.integration.test.ts` が固定）。
 */

type SegmentsServiceErrorCode =
  | 'FETCH_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'INVALID_INPUT';

export class SegmentsServiceError extends ServiceError {
  constructor(code: SegmentsServiceErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'SegmentsServiceError';
  }
}

/** PostgreSQL の一意制約違反。同名セグメントの作成で返る。 */
const UNIQUE_VIOLATION = '23505';
/** PostgreSQL の FK 違反。他人のアクティビティを混ぜようとした時に返る。 */
const FOREIGN_KEY_VIOLATION = '23503';

function createDatabaseError(
  error: unknown,
  code: Extract<
    SegmentsServiceErrorCode,
    'FETCH_FAILED' | 'CREATE_FAILED' | 'UPDATE_FAILED' | 'DELETE_FAILED'
  >,
  message: string,
  operation: string,
): SegmentsServiceError {
  const original = captureUnexpectedDatabaseError(error, {
    feature: 'segments',
    operation,
  });
  return new SegmentsServiceError(code, message, { cause: original });
}

/** 呼び出し側が受け取るセグメント。`activityIds` の順序は名前順ではなく DB の返り順。 */
interface Segment {
  id: string;
  name: string;
  activityIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface PostgrestLikeError {
  code?: string;
}

function errorCodeOf(error: unknown): string | undefined {
  return (error as PostgrestLikeError | null)?.code;
}

class SegmentsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * セグメント一覧をメンバーシップ込みで返す。
   *
   * メンバーが 0 件のセグメントも `activityIds: []` として返す。分析側が
   * 「今週の『深い仕事』は 0h」を過去比較として出せるようにするため、行ごと落とさない。
   */
  async list(options: { userId: string }): Promise<Segment[]> {
    const { data, error } = await this.supabase
      .from('segments')
      .select('id, name, created_at, updated_at, segment_activities(activity_id)')
      .eq('user_id', options.userId)
      .order('name', { ascending: true });

    if (error) {
      throw createDatabaseError(error, 'FETCH_FAILED', 'Failed to fetch segments', 'list_segments');
    }

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      activityIds: row.segment_activities.map((m) => m.activity_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async create(options: {
    userId: string;
    name: string;
    activityIds: readonly string[];
  }): Promise<Segment> {
    const { data, error } = await this.supabase
      .from('segments')
      .insert({ user_id: options.userId, name: options.name })
      .select('id, name, created_at, updated_at')
      .single();

    if (error) {
      if (errorCodeOf(error) === UNIQUE_VIOLATION) {
        throw new SegmentsServiceError('DUPLICATE_NAME', 'Segment name already exists');
      }
      throw createDatabaseError(
        error,
        'CREATE_FAILED',
        'Failed to create segment',
        'create_segment',
      );
    }

    await this.replaceMembers({
      userId: options.userId,
      segmentId: data.id,
      activityIds: options.activityIds,
    });

    return {
      id: data.id,
      name: data.name,
      activityIds: [...options.activityIds],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async rename(options: { userId: string; segmentId: string; name: string }): Promise<void> {
    const { data, error } = await this.supabase
      .from('segments')
      .update({ name: options.name })
      .eq('id', options.segmentId)
      .eq('user_id', options.userId)
      .select('id')
      .maybeSingle();

    if (error) {
      if (errorCodeOf(error) === UNIQUE_VIOLATION) {
        throw new SegmentsServiceError('DUPLICATE_NAME', 'Segment name already exists');
      }
      throw createDatabaseError(
        error,
        'UPDATE_FAILED',
        'Failed to rename segment',
        'rename_segment',
      );
    }
    if (!data) {
      throw new SegmentsServiceError('NOT_FOUND', 'Segment not found');
    }
  }

  /** メンバーを入れ替える。差分計算はせず、消してから入れ直す（件数が小さいため）。 */
  async replaceMembers(options: {
    userId: string;
    segmentId: string;
    activityIds: readonly string[];
  }): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from('segment_activities')
      .delete()
      .eq('segment_id', options.segmentId)
      .eq('user_id', options.userId);

    if (deleteError) {
      throw createDatabaseError(
        deleteError,
        'UPDATE_FAILED',
        'Failed to clear segment members',
        'replace_segment_members',
      );
    }

    if (options.activityIds.length === 0) return;

    const { error: insertError } = await this.supabase.from('segment_activities').insert(
      options.activityIds.map((activityId) => ({
        user_id: options.userId,
        segment_id: options.segmentId,
        activity_id: activityId,
      })),
    );

    if (insertError) {
      // 他人のアクティビティ、または存在しないアクティビティ。複合 FK が弾いた側。
      if (errorCodeOf(insertError) === FOREIGN_KEY_VIOLATION) {
        throw new SegmentsServiceError('INVALID_INPUT', 'Unknown or unowned activity');
      }
      throw createDatabaseError(
        insertError,
        'UPDATE_FAILED',
        'Failed to set segment members',
        'replace_segment_members',
      );
    }
  }

  /** セグメントを削除する。メンバーシップは CASCADE で消え、アクティビティ本体は残る。 */
  async remove(options: { userId: string; segmentId: string }): Promise<void> {
    const { data, error } = await this.supabase
      .from('segments')
      .delete()
      .eq('id', options.segmentId)
      .eq('user_id', options.userId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw createDatabaseError(
        error,
        'DELETE_FAILED',
        'Failed to delete segment',
        'delete_segment',
      );
    }
    if (!data) {
      throw new SegmentsServiceError('NOT_FOUND', 'Segment not found');
    }
  }
}

export function createSegmentsService(supabase: SupabaseClient<Database>) {
  return new SegmentsService(supabase);
}
