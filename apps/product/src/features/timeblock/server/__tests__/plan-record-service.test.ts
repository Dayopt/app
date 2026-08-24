import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicRecordSelect } from '@/lib/database';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import { PlanService } from '../plan-service';
import { RecordService } from '../record-service';
import type { TimeblockCommandClient } from '../timeblock-command-client';
import { TimeblockServiceError } from '../timeblock-service-error';
import type { PlanRow, RecordRow } from '../timeblock-types';
import type { ServiceSupabaseClient } from '../types';

const adminRpc = vi.hoisted(() => vi.fn());
const trackProductEvent = vi.hoisted(() => vi.fn());
const trackProductEvents = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics/product-events', () => ({ trackProductEvent, trackProductEvents }));

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ rpc: adminRpc }),
}));

const USER_ID = 'test-user-id';
const TAG_ID = '72cc49b4-7e57-4a85-9346-0e90b2db78e2';
const ACTIVITY_ID = '9f1d7c3e-5b2a-4d18-9c64-8a3f0e1b7d55';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  vi.clearAllMocks();
  adminRpc.mockResolvedValue({ data: null, error: null });
  trackProductEvent.mockResolvedValue(undefined);
  trackProductEvents.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Candidate 6 以降、plans / records への write は service-owned command client だけを通る。
 * unit test も直接 DML の mock ではなく command client の mock で境界を固定する。
 */
function createCommandsMock() {
  return {
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    restorePlan: vi.fn(),
    setPlanSkipped: vi.fn(),
    recordPlan: vi.fn(),
    confirmDay: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    restoreRecord: vi.fn(),
  };
}

function createPlanService(mockSupabase = createMockSupabase(), commands = createCommandsMock()) {
  return {
    mockSupabase,
    commands,
    service: new PlanService(
      mockSupabase as unknown as ServiceSupabaseClient,
      commands as unknown as TimeblockCommandClient,
    ),
  };
}

function createRecordService(mockSupabase = createMockSupabase(), commands = createCommandsMock()) {
  return {
    mockSupabase,
    commands,
    service: new RecordService(
      mockSupabase as unknown as ServiceSupabaseClient,
      commands as unknown as TimeblockCommandClient,
    ),
  };
}

function createPlan(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    created_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    end_at: '2030-03-17T11:00:00.000Z',
    external_calendar_event_id: null,
    id: 'plan-1',
    note: null,
    skipped_at: null,
    source: 'manual',
    start_at: '2030-03-17T10:00:00.000Z',
    tag_id: null,
    activity_id: null,
    title: 'Plan',
    updated_at: '2026-07-01T00:00:00.000Z',
    user_id: USER_ID,
    ...overrides,
  };
}

function createRecord(overrides: Partial<RecordRow> = {}): RecordRow {
  return {
    created_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    end_at: '2026-03-17T11:00:00.000Z',
    external_calendar_event_id: null,
    fulfillment: null,
    id: 'record-1',
    note: null,
    plan_id: null,
    source: 'manual',
    start_at: '2026-03-17T10:00:00.000Z',
    tag_id: null,
    activity_id: null,
    title: 'Record',
    updated_at: '2026-07-01T00:00:00.000Z',
    user_id: USER_ID,
    ...overrides,
  };
}

describe('PlanService.list', () => {
  it('同一userの現役アクティビティ名とtag名をnoteと同じOR条件で検索する', async () => {
    const plan = createPlan({ activity_id: ACTIVITY_ID, title: 'Legacy plan title' });
    const planQuery = createChainableMock([plan]);
    const tagQuery = createChainableMock([{ id: TAG_ID }]);
    const activityQuery = createChainableMock([{ id: ACTIVITY_ID }]);
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : planQuery,
    );

    await expect(
      service.list({ userId: USER_ID, search: 'Focus', sortOrder: 'desc', limit: 21 }),
    ).resolves.toEqual([plan]);

    expect(activityQuery.select).toHaveBeenCalledWith('id');
    expect(activityQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(activityQuery.is).toHaveBeenCalledWith('archived_at', null);
    expect(activityQuery.ilike).toHaveBeenCalledWith('name', '%Focus%');
    expect(tagQuery.select).toHaveBeenCalledWith('id');
    expect(tagQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(tagQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(tagQuery.ilike).toHaveBeenCalledWith('name', '%Focus%');
    expect(planQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(planQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(planQuery.is).not.toHaveBeenCalledWith('skipped_at', null);
    // 旧世代（tag_id）と新世代（activity_id）の和集合。片方だけだと一方が検索から消える
    expect(planQuery.or).toHaveBeenCalledWith(
      `note.ilike.%Focus%,activity_id.in.(${ACTIVITY_ID}),tag_id.in.(${TAG_ID})`,
    );
    expect(planQuery.or).not.toHaveBeenCalledWith(expect.stringContaining('title.ilike'));
    expect(planQuery.order).toHaveBeenCalledWith('start_at', { ascending: false });
    expect(planQuery.limit).toHaveBeenCalledWith(21);
  });

  it('分類検索失敗時は不完全なplan一覧を返さない', async () => {
    const planQuery = createChainableMock([createPlan()]);
    const tagQuery = createChainableMock([], { message: 'tag lookup failed' });
    const activityQuery = createChainableMock([]);
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : planQuery,
    );

    await expect(service.list({ userId: USER_ID, search: 'Focus' })).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to search timeblock classifications',
    });

    expect(planQuery.or).not.toHaveBeenCalled();
  });

  it('検索query失敗時はDB messageを例外へ含めない', async () => {
    const privateError = 'parse failed near note.ilike.%private words%';
    const recordQuery = createChainableMock([], { message: privateError });
    const tagQuery = createChainableMock([]);
    const activityQuery = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : recordQuery,
    );

    const caught = await service
      .list({ userId: USER_ID, search: 'private words' })
      .catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(TimeblockServiceError);
    if (!(caught instanceof TimeblockServiceError)) throw caught;
    expect(caught).toMatchObject({ code: 'FETCH_FAILED', message: 'Failed to fetch records' });
    expect(caught.message).not.toContain(privateError);
  });

  it('user scopeを維持して指定したidに絞り込む', async () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const query = createChainableMock([]);
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(query);

    await expect(service.list({ userId: USER_ID, ids })).resolves.toEqual([]);

    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.in).toHaveBeenCalledWith('id', ids);
  });

  it('idsが空配列ならDBへ問い合わせず空配列を返す', async () => {
    const { service, mockSupabase } = createPlanService();

    await expect(service.list({ userId: USER_ID, ids: [] })).resolves.toEqual([]);

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('RecordService.list', () => {
  it('特殊文字を除去し、tagが一致しない場合もnoteを検索する', async () => {
    const record = createRecord({ note: 'Deep work', title: 'Legacy title' });
    const recordQuery = createChainableMock([record]);
    const tagQuery = createChainableMock([]);
    const activityQuery = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : recordQuery,
    );

    await expect(
      service.list({
        userId: USER_ID,
        search: ' deep.,()\\%*:_work ',
        sortOrder: 'desc',
        limit: 21,
      }),
    ).resolves.toEqual([record]);

    expect(activityQuery.ilike).toHaveBeenCalledWith('name', '%deepwork%');
    expect(tagQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(tagQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(tagQuery.ilike).toHaveBeenCalledWith('name', '%deepwork%');
    expect(recordQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(recordQuery.select).toHaveBeenCalledWith(publicRecordSelect);
    expect(recordQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(recordQuery.or).toHaveBeenCalledWith('note.ilike.%deepwork%');
    expect(recordQuery.or).not.toHaveBeenCalledWith(expect.stringContaining('title.ilike'));
    expect(recordQuery.order).toHaveBeenCalledWith('start_at', { ascending: false });
    expect(recordQuery.limit).toHaveBeenCalledWith(21);
  });

  it('記号だけの検索を無条件一覧へフォールバックさせない', async () => {
    const recordQuery = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(recordQuery);

    await expect(service.list({ userId: USER_ID, search: '.,()\\%*:_ ' })).resolves.toEqual([]);

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(recordQuery.or).toHaveBeenCalledWith('id.is.null');
  });

  it('non-empty一覧にfulfillment_scoreを含めない', async () => {
    const record = createRecord();
    const query = createChainableMock([record]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(query);

    const result = await service.list({ userId: USER_ID });

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('fulfillment_score');
  });

  it('アクティビティ名一致をrecordのOR条件へ加える', async () => {
    const record = createRecord({ activity_id: ACTIVITY_ID });
    const recordQuery = createChainableMock([record]);
    const tagQuery = createChainableMock([]);
    const activityQuery = createChainableMock([{ id: ACTIVITY_ID }]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : recordQuery,
    );

    await expect(service.list({ userId: USER_ID, search: 'Research' })).resolves.toEqual([record]);

    expect(recordQuery.or).toHaveBeenCalledWith(
      `note.ilike.%Research%,activity_id.in.(${ACTIVITY_ID})`,
    );
  });

  it('tag名一致をrecordのOR条件へ加える（cutover 前の旧ブロックを消さない）', async () => {
    const record = createRecord({ tag_id: TAG_ID });
    const recordQuery = createChainableMock([record]);
    const tagQuery = createChainableMock([{ id: TAG_ID }]);
    const activityQuery = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : table === 'activities' ? activityQuery : recordQuery,
    );

    await expect(service.list({ userId: USER_ID, search: 'Research' })).resolves.toEqual([record]);

    expect(recordQuery.or).toHaveBeenCalledWith(`note.ilike.%Research%,tag_id.in.(${TAG_ID})`);
  });

  it('user scopeを維持して指定したplan_idに絞り込む', async () => {
    const planIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    const query = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(query);

    await expect(service.list({ userId: USER_ID, planIds })).resolves.toEqual([]);

    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.in).toHaveBeenCalledWith('plan_id', planIds);
  });

  it('planIdsが空配列ならDBへ問い合わせず空配列を返す', async () => {
    const { service, mockSupabase } = createRecordService();

    await expect(service.list({ userId: USER_ID, planIds: [] })).resolves.toEqual([]);

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('PlanService.create', () => {
  it('作成成功後にplan_createdを記録する', async () => {
    const plan = createPlan();
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock([]));
    commands.createPlan.mockResolvedValue(plan);

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: plan.title,
          start_at: plan.start_at,
          end_at: plan.end_at,
        },
      }),
    ).resolves.toEqual(plan);

    expect(trackProductEvent).toHaveBeenCalledWith({
      eventName: 'plan_created',
      userId: USER_ID,
    });
  });

  it('過去に完了する plan 作成を拒否する', async () => {
    const { service, mockSupabase, commands } = createPlanService();

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Past plan',
          start_at: '2026-03-17T10:00:00.000Z',
          end_at: '2026-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_IN_PAST' });

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(commands.createPlan).not.toHaveBeenCalled();
  });

  it('command boundary経由でplanを作る', async () => {
    const plan = createPlan({ title: 'Future plan' });
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock([]));
    commands.createPlan.mockResolvedValue(plan);

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Future plan',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).resolves.toEqual(plan);

    expect(commands.createPlan).toHaveBeenCalledWith({
      userId: USER_ID,
      title: 'Future plan',
      note: null,
      tagId: null,
      activityId: null,
      externalCalendarEventId: null,
      source: 'manual',
      startAt: '2030-03-17T10:00:00.000Z',
      endAt: '2030-03-17T11:00:00.000Z',
    });
  });

  it('重複はapp guardのTIME_OVERLAP文言を維持し、commandへ到達させない', async () => {
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock([{ id: 'plan-existing' }]));

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Future plan',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({
      code: 'TIME_OVERLAP',
      message: 'Plan time overlaps with existing plans (1)',
    });

    expect(commands.createPlan).not.toHaveBeenCalled();
  });
});

describe('PlanService.update', () => {
  it('過去 plan の時間変更を拒否する', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: { start_at: '2026-03-17T09:00:00.000Z' },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_TIME_LOCKED' });

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('過去 plan を未来へ移動し直す時間変更も拒否する', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: {
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_TIME_LOCKED' });

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('終了が将来の plan を現在以前へ縮める時間変更を拒否する', async () => {
    const existing = createPlan();
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: {
          start_at: '2026-07-15T11:00:00.000Z',
          end_at: '2026-07-15T12:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_IN_PAST' });

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('終了が将来の plan は将来範囲内で時間変更できる', async () => {
    const existing = createPlan();
    const updated = {
      ...existing,
      start_at: '2030-03-17T12:00:00.000Z',
      end_at: '2030-03-17T13:00:00.000Z',
    };
    const { service, mockSupabase, commands } = createPlanService();
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? createChainableMock(existing) : createChainableMock([]);
    });
    commands.updatePlan.mockResolvedValue(updated);

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: { start_at: updated.start_at, end_at: updated.end_at },
      }),
    ).resolves.toMatchObject({ start_at: updated.start_at, end_at: updated.end_at });
  });

  it('過去 plan でもメモの更新は許可する（tagId は入力から除去済みのため既存値を保持する）', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
      tag_id: 'tag-1',
    });
    const updated = { ...existing, note: 'Updated note' };
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commands.updatePlan.mockResolvedValue(updated);

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: { note: 'Updated note' },
      }),
    ).resolves.toMatchObject({ note: 'Updated note', tag_id: 'tag-1' });

    // 部分更新は現在行で補完し、未指定fieldを取り落とさない。tagId は tRPC 入力に存在しない
    // ため常に既存行の tag_id を渡し、書き込み経路からは変更できない。
    expect(commands.updatePlan).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: existing.id,
      expectedUpdatedAt: existing.updated_at,
      title: existing.title,
      note: 'Updated note',
      tagId: 'tag-1',
      activityId: null,
      externalCalendarEventId: existing.external_calendar_event_id,
      source: 'manual',
      startAt: existing.start_at,
      endAt: existing.end_at,
    });
  });

  // legacy route の input は ms 精度の token しか持たない。DB の CAS は microsecond 単位で
  // 比較するため、command へ渡すのは「いま読んだ行の raw updated_at」でなければならない
  it('caller指定のexpectedUpdatedAtではなく現在行のraw tokenをcommandへ渡す', async () => {
    const existing = createPlan({ updated_at: '2026-07-01T00:00:00.123456Z' });
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commands.updatePlan.mockResolvedValue(existing);

    await service.update({
      userId: USER_ID,
      planId: existing.id,
      input: { title: 'Renamed' },
      expectedUpdatedAt: '2026-07-01T00:00:00.123Z',
    });

    expect(commands.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: '2026-07-01T00:00:00.123456Z' }),
    );
  });

  it('caller指定のexpectedUpdatedAtが古い時はCONFLICTでcommandを呼ばない', async () => {
    const existing = createPlan();
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: { title: 'Renamed' },
        expectedUpdatedAt: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(commands.updatePlan).not.toHaveBeenCalled();
  });

  it('存在しないplanはcommandへ降りる前にNOT_FOUNDにする', async () => {
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(null));

    await expect(
      service.update({ userId: USER_ID, planId: 'missing-plan', input: { title: 'Renamed' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(commands.updatePlan).not.toHaveBeenCalled();
  });
});

describe('PlanService.record', () => {
  it('past plan を versioned record command へ渡す', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      external_calendar_event_id: 'external-event-1',
      note: 'note',
      start_at: '2026-03-17T10:00:00.000Z',
      tag_id: 'tag-1',
      activity_id: null,
      title: 'Recorded plan',
      updated_at: '2026-07-01T00:00:00.654321Z',
    });
    const record = createRecord({
      end_at: plan.end_at,
      note: plan.note,
      plan_id: plan.id,
      source: 'from_plan',
      start_at: plan.start_at,
      tag_id: plan.tag_id,
      activity_id: null,
      title: plan.title,
    });
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : []),
    );
    commands.recordPlan.mockResolvedValue(record);

    await expect(service.record({ userId: USER_ID, planId: plan.id })).resolves.toMatchObject({
      plan_id: plan.id,
      source: 'from_plan',
    });
    // Record の内容は DB 側 command が Plan から複製する。app は user と CAS token だけを渡す
    expect(commands.recordPlan).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: plan.id,
      expectedUpdatedAt: plan.updated_at,
    });
    expect(trackProductEvent).toHaveBeenCalledWith({
      eventName: 'record_created',
      userId: USER_ID,
    });
  });

  it('active record が紐づく plan の再記録を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const existingRecord = createRecord({
      end_at: '2026-03-17T13:00:00.000Z',
      plan_id: plan.id,
      start_at: '2026-03-17T12:00:00.000Z',
    });
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : [existingRecord]),
    );

    await expect(service.record({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'ALREADY_RECORDED',
    });

    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    expect(commands.recordPlan).not.toHaveBeenCalled();
  });

  it('存在しないplanはcommandへ降りる前にNOT_FOUNDにする', async () => {
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(null));

    await expect(service.record({ userId: USER_ID, planId: 'missing-plan' })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );

    expect(commands.recordPlan).not.toHaveBeenCalled();
  });
});

describe('PlanService.skip / unskip', () => {
  it('active record が紐づく plan の skip を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : [createRecord({ plan_id: plan.id })]),
    );

    await expect(service.skip({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'ALREADY_RECORDED',
    });

    expect(commands.setPlanSkipped).not.toHaveBeenCalled();
  });

  it('past plan の skip を versioned command へ渡す', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const skipped = { ...plan, skipped_at: '2026-07-15T12:00:00.000Z' };
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : []),
    );
    commands.setPlanSkipped.mockResolvedValue(skipped);

    await expect(service.skip({ userId: USER_ID, planId: plan.id })).resolves.toEqual(skipped);

    expect(commands.setPlanSkipped).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: plan.id,
      expectedUpdatedAt: plan.updated_at,
      skipped: true,
    });
  });

  it('未来 plan の skip は command へ降りる前に SKIP_IN_FUTURE にする', async () => {
    const plan = createPlan();
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(plan));

    await expect(service.skip({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'SKIP_IN_FUTURE',
    });

    expect(commands.setPlanSkipped).not.toHaveBeenCalled();
  });

  it('unskipはskipped planだけをcommandへ渡す', async () => {
    const skipped = createPlan({ skipped_at: '2026-07-14T00:00:00.000Z' });
    const restored = { ...skipped, skipped_at: null };
    const { service, mockSupabase, commands } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(skipped));
    commands.setPlanSkipped.mockResolvedValue(restored);

    await expect(service.unskip({ userId: USER_ID, planId: skipped.id })).resolves.toEqual(
      restored,
    );
    expect(commands.setPlanSkipped).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: skipped.id,
      expectedUpdatedAt: skipped.updated_at,
      skipped: false,
    });

    const notSkipped = createPlan();
    const second = createPlanService();
    second.mockSupabase.from.mockReturnValue(createChainableMock(notSkipped));

    await expect(
      second.service.unskip({ userId: USER_ID, planId: notSkipped.id }),
    ).resolves.toEqual(notSkipped);
    expect(second.commands.setPlanSkipped).not.toHaveBeenCalled();
  });
});

describe('PlanService soft delete', () => {
  it('deleteはuser client、restoreはservice-role clientを使う', async () => {
    const { service, mockSupabase } = createPlanService();
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    await expect(service.delete({ userId: USER_ID, planId: 'plan-1' })).resolves.toEqual({
      success: true,
    });
    await expect(service.restore({ userId: USER_ID, planId: 'plan-1' })).resolves.toEqual({
      success: true,
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('soft_delete_plan', {
      p_plan_id: 'plan-1',
      p_user_id: USER_ID,
    });
    expect(adminRpc).toHaveBeenCalledWith('restore_plan', {
      p_plan_id: 'plan-1',
      p_user_id: USER_ID,
    });
  });
});

describe('PlanService.confirmDay', () => {
  it('confirm_day_plans_to_records RPC へ user と day range を渡す', async () => {
    const record = createRecord({ source: 'from_plan' });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.rpc.mockResolvedValue({ data: [record], error: null });

    await expect(
      service.confirmDay({
        userId: USER_ID,
        input: {
          start_at: '2026-03-17T00:00:00.000Z',
          end_at: '2026-03-18T00:00:00.000Z',
        },
      }),
    ).resolves.toEqual([record]);

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'confirm_day_plans_to_records',
      expect.objectContaining({
        p_end_at: '2026-03-18T00:00:00.000Z',
        p_start_at: '2026-03-17T00:00:00.000Z',
        p_user_id: USER_ID,
      }),
    );
    expect(trackProductEvents).toHaveBeenCalledWith([
      { eventName: 'record_created', userId: USER_ID },
    ]);
  });

  it('同時確定による from_plan 一意制約違反を再記録エラーに変換する', async () => {
    const { service, mockSupabase } = createPlanService();
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    await expect(
      service.confirmDay({
        userId: USER_ID,
        input: {
          start_at: '2026-03-17T00:00:00.000Z',
          end_at: '2026-03-18T00:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
  });
});

describe('RecordService.create', () => {
  it('未来に完了する record 作成を拒否する', async () => {
    const { service, mockSupabase, commands } = createRecordService();

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Future record',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(TimeblockServiceError);

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(commands.createRecord).not.toHaveBeenCalled();
  });

  it('past plan には複数の manual record を紐づけられる', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const record = createRecord({ plan_id: plan.id });
    const { service, mockSupabase, commands } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : []),
    );
    commands.createRecord.mockResolvedValue(record);

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Second segment',
          planId: plan.id,
          start_at: '2026-03-17T12:00:00.000Z',
          end_at: '2026-03-17T13:00:00.000Z',
        },
      }),
    ).resolves.toMatchObject({ plan_id: plan.id });

    // planId 付きでも source は manual のまま。from_plan は one-tap 記録専用
    expect(commands.createRecord).toHaveBeenCalledWith({
      userId: USER_ID,
      title: 'Second segment',
      note: null,
      tagId: null,
      activityId: null,
      planId: plan.id,
      externalCalendarEventId: null,
      source: 'manual',
      startAt: '2026-03-17T12:00:00.000Z',
      endAt: '2026-03-17T13:00:00.000Z',
      fulfillment: null,
    });
    expect(trackProductEvent).toHaveBeenCalledWith({
      eventName: 'record_created',
      userId: USER_ID,
    });
  });

  it('future plan への紐づけを拒否する', async () => {
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(createChainableMock(createPlan()));

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Linked record',
          planId: 'plan-1',
          start_at: '2026-03-17T10:00:00.000Z',
          end_at: '2026-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });

    expect(mockSupabase.from).toHaveBeenCalledWith('plans');
  });

  it('skip済みplanへの紐づけを拒否する', async () => {
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(
      createChainableMock(
        createPlan({
          start_at: '2026-03-17T09:00:00.000Z',
          end_at: '2026-03-17T10:00:00.000Z',
          skipped_at: '2026-03-17T11:00:00.000Z',
        }),
      ),
    );

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Linked record',
          planId: 'plan-1',
          start_at: '2026-03-17T10:15:00.000Z',
          end_at: '2026-03-17T10:45:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(mockSupabase.from).toHaveBeenCalledWith('plans');
  });

  it('plan 紐づけの update でも future plan を拒否する', async () => {
    const existing = createRecord();
    const { service, mockSupabase, commands } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'records' ? existing : createPlan()),
    );

    await expect(
      service.update({
        userId: USER_ID,
        recordId: existing.id,
        input: { planId: 'plan-1' },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });

    expect(commands.updateRecord).not.toHaveBeenCalled();
  });
});

describe('RecordService.update', () => {
  it('部分更新を現在行で補い、raw CAS tokenをcommandへ渡す', async () => {
    const existing = createRecord({
      note: 'old note',
      plan_id: 'plan-1',
      tag_id: TAG_ID,
      activity_id: null,
      updated_at: '2026-07-01T00:00:00.654321Z',
    });
    const updated = { ...existing, title: 'Renamed' };
    const { service, mockSupabase, commands } = createRecordService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commands.updateRecord.mockResolvedValue(updated);

    await expect(
      service.update({
        userId: USER_ID,
        recordId: existing.id,
        input: { title: 'Renamed' },
        expectedUpdatedAt: '2026-07-01T00:00:00.654Z',
      }),
    ).resolves.toEqual(updated);

    expect(commands.updateRecord).toHaveBeenCalledWith({
      userId: USER_ID,
      recordId: existing.id,
      expectedUpdatedAt: existing.updated_at,
      title: 'Renamed',
      note: existing.note,
      tagId: existing.tag_id,
      activityId: null,
      planId: existing.plan_id,
      externalCalendarEventId: existing.external_calendar_event_id,
      source: 'manual',
      startAt: existing.start_at,
      endAt: existing.end_at,
      fulfillment: null,
    });
  });

  it('存在しないrecordはcommandへ降りる前にNOT_FOUNDにする', async () => {
    const { service, mockSupabase, commands } = createRecordService();
    mockSupabase.from.mockReturnValue(createChainableMock(null));

    await expect(
      service.update({ userId: USER_ID, recordId: 'missing-record', input: { title: 'Renamed' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(commands.updateRecord).not.toHaveBeenCalled();
  });

  it('caller指定のexpectedUpdatedAtが古い時はCONFLICTでcommandを呼ばない', async () => {
    const existing = createRecord();
    const { service, mockSupabase, commands } = createRecordService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));

    await expect(
      service.update({
        userId: USER_ID,
        recordId: existing.id,
        input: { title: 'Renamed' },
        expectedUpdatedAt: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(commands.updateRecord).not.toHaveBeenCalled();
  });
});

describe('RecordService soft delete', () => {
  it('deleteはuser client、restoreはservice-role clientを使う', async () => {
    const { service, mockSupabase } = createRecordService();
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    await expect(service.delete({ userId: USER_ID, recordId: 'record-1' })).resolves.toEqual({
      success: true,
    });
    await expect(service.restore({ userId: USER_ID, recordId: 'record-1' })).resolves.toEqual({
      success: true,
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('soft_delete_record', {
      p_record_id: 'record-1',
      p_user_id: USER_ID,
    });
    expect(adminRpc).toHaveBeenCalledWith('restore_record', {
      p_record_id: 'record-1',
      p_user_id: USER_ID,
    });
  });

  it('delete / restore失敗時もRecord語彙でエラーを返す', async () => {
    const { service, mockSupabase } = createRecordService();
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    adminRpc.mockResolvedValue({ data: null, error: { message: 'denied' } });

    await expect(service.delete({ userId: USER_ID, recordId: 'record-1' })).rejects.toThrow(
      'Failed to delete record',
    );
    await expect(service.restore({ userId: USER_ID, recordId: 'record-1' })).rejects.toThrow(
      'Failed to restore record',
    );
  });
});

describe('activity 付与ガードの対称性', () => {
  const ACTIVITY_ID = '9f2b1c34-5d6e-4a7b-8c9d-0e1f2a3b4c5d';

  /**
   * tag を触らず activity だけを付け替える更新でも fail-fast が発火すること。
   *
   * activity の guard を tag の変更条件へネストさせると、このパスだけ TS 層の
   * 事前検証を素通りする。DB 側の assert は効くので実害は無いが、エラーが
   * DT014 -> TAG_ARCHIVED という tag 語彙で返り、timeblock-command-service の
   * 独立 if 実装とも非対称になる。対称性を契約として固定する。
   */
  it('PlanService.update は tagId 不変でも archived activity への付け替えを拒否する', async () => {
    const existing = createPlan({ activity_id: null });
    const planQuery = createChainableMock(existing);
    const activityQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000Z' });
    const mockSupabase = createMockSupabase({
      from: vi.fn((table: string) => (table === 'activities' ? activityQuery : planQuery)),
    });
    const { service, commands } = createPlanService(mockSupabase);

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        // tagId は渡さない = 変更なし。activityId だけを付け替える。
        input: { activityId: ACTIVITY_ID },
      }),
    ).rejects.toBeInstanceOf(TimeblockServiceError);

    expect(commands.updatePlan).not.toHaveBeenCalled();
  });

  it('RecordService.update は tagId 不変でも archived activity への付け替えを拒否する', async () => {
    const existing = createRecord({ activity_id: null });
    const recordQuery = createChainableMock(existing);
    const activityQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000Z' });
    const mockSupabase = createMockSupabase({
      from: vi.fn((table: string) => (table === 'activities' ? activityQuery : recordQuery)),
    });
    const { service, commands } = createRecordService(mockSupabase);

    await expect(
      service.update({
        userId: USER_ID,
        recordId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        input: { activityId: ACTIVITY_ID },
      }),
    ).rejects.toBeInstanceOf(TimeblockServiceError);

    expect(commands.updateRecord).not.toHaveBeenCalled();
  });
});
