import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Row } from '@/lib/database';

import { TimeblockCommandClient } from '../timeblock-command-client';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error('database command failed'),
}));

const plan: Row<'plans'> = {
  created_at: '2026-07-23T00:00:00.000001Z',
  deleted_at: null,
  end_at: '2026-07-24T02:00:00.000000Z',
  external_calendar_event_id: null,
  id: '00000000-0000-4000-8000-000000000001',
  note: null,
  skipped_at: null,
  source: 'manual',
  start_at: '2026-07-24T01:00:00.000000Z',
  tag_id: null,
  title: 'Plan',
  updated_at: '2026-07-23T00:00:00.000001Z',
  user_id: '00000000-0000-4000-8000-000000000002',
};

describe('TimeblockCommandClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typed create commandへtenantとnullable fieldを閉じ込める', async () => {
    rpc.mockResolvedValue({ data: [plan], error: null });
    const client = new TimeblockCommandClient();

    await expect(
      client.createPlan({
        userId: plan.user_id,
        title: plan.title,
        note: null,
        tagId: null,
        externalCalendarEventId: null,
        source: 'manual',
        startAt: plan.start_at,
        endAt: plan.end_at,
      }),
    ).resolves.toEqual(plan);

    expect(rpc).toHaveBeenCalledWith('create_plan_command_v1', {
      p_end_at: plan.end_at,
      p_external_calendar_event_id: null,
      p_note: null,
      p_source: 'manual',
      p_start_at: plan.start_at,
      p_tag_id: null,
      p_title: plan.title,
      p_user_id: plan.user_id,
    });
  });

  it('deadlockを一度だけ再試行し、最終DB outcomeをdomain errorへ変換する', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock' } })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23P01', message: 'exclusion violation with private detail' },
      });
    const client = new TimeblockCommandClient();

    await expect(
      client.createPlan({
        userId: plan.user_id,
        title: plan.title,
        note: null,
        tagId: null,
        externalCalendarEventId: null,
        source: 'manual',
        startAt: plan.start_at,
        endAt: plan.end_at,
      }),
    ).rejects.toMatchObject({
      code: 'TIME_OVERLAP',
      message: 'This time range overlaps with an existing item.',
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('exact CAS conflictをstable domain codeで返す', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'DT002', message: 'private version' } });
    const client = new TimeblockCommandClient();

    await expect(
      client.updatePlan({
        userId: plan.user_id,
        planId: plan.id,
        expectedUpdatedAt: plan.updated_at,
        title: plan.title,
        note: plan.note,
        tagId: plan.tag_id,
        externalCalendarEventId: plan.external_calendar_event_id,
        source: 'manual',
        startAt: plan.start_at,
        endAt: plan.end_at,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it.each(['55P03', '57014'])(
    '%sを観測対象外のretryable conflictへ変換する',
    async (databaseCode) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: databaseCode, message: 'private lock detail' },
      });
      const client = new TimeblockCommandClient();

      await expect(
        client.createPlan({
          userId: plan.user_id,
          title: plan.title,
          note: null,
          tagId: null,
          externalCalendarEventId: null,
          source: 'manual',
          startAt: plan.start_at,
          endAt: plan.end_at,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    },
  );

  it('未来PlanへのRecordリンクをRecord自身の未来エラーと区別する', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'DT013', message: 'private linked Plan detail' },
    });
    const client = new TimeblockCommandClient();

    await expect(
      client.createRecord({
        userId: plan.user_id,
        title: 'Linked Record',
        note: null,
        tagId: null,
        planId: plan.id,
        externalCalendarEventId: null,
        source: 'api',
        startAt: '2026-07-22T01:00:00.000000Z',
        endAt: '2026-07-22T02:00:00.000000Z',
      }),
    ).rejects.toMatchObject({
      code: 'PLAN_NOT_RECORDABLE',
      message: 'Records can only link to completed plans.',
    });
  });

  it('confirm-dayの対象がなければ空配列を返す', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const client = new TimeblockCommandClient();

    await expect(
      client.confirmDay({
        userId: plan.user_id,
        startAt: '2026-07-22T00:00:00.000000Z',
        endAt: '2026-07-23T00:00:00.000000Z',
      }),
    ).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('confirm_day_plans_command_v1', {
      p_end_at: '2026-07-23T00:00:00.000000Z',
      p_start_at: '2026-07-22T00:00:00.000000Z',
      p_user_id: plan.user_id,
    });
  });
});
