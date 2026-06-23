import type { Row } from '@/lib/database';

type TagRow = Row<'tags'>;

/** @public Storybook preset factory. */
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
