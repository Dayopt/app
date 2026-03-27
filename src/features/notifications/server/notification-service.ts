/**
 * Notification Service
 *
 * 通知のビジネスロジックを集約したサービス層
 */

import { ServiceError } from '@/platform/trpc/errors';

import type {
  CreateNotificationOptions,
  DeleteNotificationsOptions,
  ListNotificationsOptions,
  MarkAllAsReadOptions,
  NotificationRow,
  ServiceSupabaseClient,
  UpdateNotificationOptions,
} from './types';

/**
 * 通知サービスクラス
 */
export class NotificationService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * 通知一覧を取得（entry titleをJOIN）
   */
  async list(options: ListNotificationsOptions) {
    const { userId, isRead, type, limit = 50, offset = 0 } = options;

    let query = this.supabase
      .from('notifications')
      .select('*, entries(title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isRead !== undefined) {
      query = query.eq('is_read', isRead);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      throw new NotificationServiceError(
        'FETCH_FAILED',
        `通知一覧の取得に失敗しました: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * 未読数を取得
   */
  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      throw new NotificationServiceError(
        'FETCH_FAILED',
        `未読数の取得に失敗しました: ${error.message}`,
      );
    }

    return count ?? 0;
  }

  /**
   * 通知を取得
   */
  async getById(userId: string, notificationId: string): Promise<NotificationRow> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotificationServiceError('NOT_FOUND', '通知が見つかりません');
      }
      throw new NotificationServiceError(
        'FETCH_FAILED',
        `通知の取得に失敗しました: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * 通知を作成
   */
  async create(options: CreateNotificationOptions): Promise<NotificationRow> {
    const { userId, type, entryId } = options;

    const { data: result, error } = await this.supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        entry_id: entryId,
      })
      .select()
      .single();

    if (error) {
      throw new NotificationServiceError(
        'CREATE_FAILED',
        `通知の作成に失敗しました: ${error.message}`,
      );
    }

    return result;
  }

  /**
   * 通知を更新
   */
  async update(options: UpdateNotificationOptions): Promise<NotificationRow> {
    const { userId, notificationId, isRead, readAt } = options;

    const updateData: Record<string, boolean | string | null> = {};
    if (isRead !== undefined) updateData.is_read = isRead;
    if (readAt !== undefined) updateData.read_at = readAt;

    const { data, error } = await this.supabase
      .from('notifications')
      .update(updateData)
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotificationServiceError('NOT_FOUND', '通知が見つかりません');
      }
      throw new NotificationServiceError(
        'UPDATE_FAILED',
        `通知の更新に失敗しました: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationRow> {
    return this.update({
      userId,
      notificationId,
      isRead: true,
      readAt: new Date().toISOString(),
    });
  }

  /**
   * 全通知を既読にする
   */
  async markAllAsRead(options: MarkAllAsReadOptions): Promise<{ count: number }> {
    const { userId, type } = options;

    let query = this.supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query.select();

    if (error) {
      throw new NotificationServiceError(
        'UPDATE_FAILED',
        `一括既読化に失敗しました: ${error.message}`,
      );
    }

    return { count: data?.length ?? 0 };
  }

  /**
   * 通知を削除
   */
  async delete(userId: string, notificationId: string): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw new NotificationServiceError(
        'DELETE_FAILED',
        `通知の削除に失敗しました: ${error.message}`,
      );
    }

    return { success: true };
  }

  /**
   * 通知を一括削除
   */
  async bulkDelete(options: DeleteNotificationsOptions): Promise<{ count: number }> {
    const { userId, ids } = options;

    const { data, error } = await this.supabase
      .from('notifications')
      .delete()
      .in('id', ids)
      .eq('user_id', userId)
      .select();

    if (error) {
      throw new NotificationServiceError(
        'DELETE_FAILED',
        `通知の一括削除に失敗しました: ${error.message}`,
      );
    }

    return { count: data?.length ?? 0 };
  }

  /**
   * 既読通知を全削除
   */
  async deleteAllRead(userId: string): Promise<{ count: number }> {
    const { data, error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('is_read', true)
      .select();

    if (error) {
      throw new NotificationServiceError(
        'DELETE_FAILED',
        `既読通知の削除に失敗しました: ${error.message}`,
      );
    }

    return { count: data?.length ?? 0 };
  }
}

/**
 * 通知サービスエラー
 */
export class NotificationServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'NotificationServiceError';
  }
}

/**
 * サービスインスタンスを作成
 */
export function createNotificationService(supabase: ServiceSupabaseClient): NotificationService {
  return new NotificationService(supabase);
}
