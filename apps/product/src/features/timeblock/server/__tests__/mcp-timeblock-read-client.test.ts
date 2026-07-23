import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const not = vi.hoisted(() => vi.fn());
const order = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient,
}));

vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError: vi.fn() }));

import {
  createTimeblockTrashReadClient,
  TimeblockTrashReadError,
} from '../mcp-timeblock-read-client';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Deleted block',
  note: null,
  tag_id: null,
  plan_id: null,
  start_at: '2026-07-23T01:00:00.000Z',
  end_at: '2026-07-23T02:00:00.000Z',
  source: 'api',
  skipped_at: null,
  deleted_at: '2026-07-23T03:00:00.000Z',
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T03:00:00.000Z',
};

describe('TimeblockTrashReadClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select, eq, not, order, limit };
    createClient.mockReturnValue({ from });
    from.mockReturnValue(query);
    select.mockReturnValue(query);
    eq.mockReturnValue(query);
    not.mockReturnValue(query);
    order.mockReturnValue(query);
    limit.mockResolvedValue({ data: [row], error: null });
  });

  it.each([
    ['plans', 'listDeletedPlans'],
    ['records', 'listDeletedRecords'],
  ] as const)('%s trashを必ずownerとdeleted stateへ固定する', async (table, method) => {
    const client = createTimeblockTrashReadClient();

    await expect(client[method]('user-1', 25)).resolves.toEqual([row]);

    expect(from).toHaveBeenCalledWith(table);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(not).toHaveBeenCalledWith('deleted_at', 'is', null);
    expect(order).toHaveBeenNthCalledWith(1, 'deleted_at', { ascending: false });
    expect(order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(limit).toHaveBeenCalledWith(25);
    const projection = select.mock.calls[0]?.[0];
    expect(projection).not.toContain('user_id');
    expect(projection).not.toContain('external_calendar_event_id');
  });

  it('DB errorをstable errorへ変換してraw objectを外へ出さない', async () => {
    const databaseError = { code: 'XX000', message: 'private database detail' };
    limit.mockResolvedValueOnce({ data: null, error: databaseError });

    const error = await createTimeblockTrashReadClient()
      .listDeletedPlans('user-1', 50)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(TimeblockTrashReadError);
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain(databaseError.message);
  });
});
