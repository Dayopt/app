import type { Database } from '@dayopt/database';

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
    start_time: '2026-03-17T09:00:00.000Z',
    end_time: '2026-03-17T10:00:00.000Z',
    actual_start_time: '2026-03-17T09:00:00.000Z',
    actual_end_time: '2026-03-17T10:00:00.000Z',
    duration_minutes: null,
    fulfillment_score: null,
    deleted_at: null,
    tag_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
