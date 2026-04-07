import type { Database } from '@/lib/database.types';

type EntryRow = Database['public']['Tables']['entries']['Row'];

/**
 * テスト用のエントリデータを生成
 */
export function createMockEntry(overrides: Partial<EntryRow> = {}): EntryRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user-id',
    title: 'Test Entry',
    description: null,
    origin: 'planned',
    start_time: null,
    end_time: null,
    actual_start_time: null,
    actual_end_time: null,
    backed_up_start_time: null,
    backed_up_end_time: null,
    duration_minutes: null,
    fulfillment_score: null,
    reminder_minutes: null,
    reminder_at: null,
    reminder_sent: false,
    reviewed_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
