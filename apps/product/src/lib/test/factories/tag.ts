import type { Database } from '@dayopt/database';

type TagRow = Database['public']['Tables']['tags']['Row'];

/**
 * テスト用のタグデータを生成
 */
export function createMockTag(overrides: Partial<TagRow> = {}): TagRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user-id',
    name: 'Test Tag',
    color: 'blue',
    icon: null,
    is_active: true,
    parent_id: null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
