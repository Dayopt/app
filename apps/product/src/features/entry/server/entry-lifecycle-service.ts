import 'server-only';

import { EntryServiceError } from './entry-service-error';
import type { DeleteEntryOptions, ServiceSupabaseClient } from './types';

export class EntryLifecycleService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  async delete(options: DeleteEntryOptions): Promise<{ success: boolean }> {
    const { error } = await this.supabase.rpc('soft_delete_entry', {
      p_entry_id: options.entryId,
      p_user_id: options.userId,
    });
    if (error) {
      throw new EntryServiceError('DELETE_FAILED', `Failed to delete entry: ${error.message}`);
    }
    return { success: true };
  }

  async bulkDelete(options: { userId: string; entryIds: string[] }): Promise<number> {
    const { data, error } = await this.supabase.rpc('bulk_soft_delete_entries', {
      p_entry_ids: options.entryIds,
      p_user_id: options.userId,
    });
    if (error) {
      throw new EntryServiceError('DELETE_FAILED', 'エントリーの一括削除に失敗した');
    }
    return data ?? 0;
  }

  async restore(options: DeleteEntryOptions): Promise<{ success: boolean }> {
    const { error } = await this.supabase.rpc('restore_entry', {
      p_entry_id: options.entryId,
      p_user_id: options.userId,
    });
    if (error) {
      throw new EntryServiceError('RESTORE_FAILED', `Failed to restore entry: ${error.message}`);
    }
    return { success: true };
  }
}
