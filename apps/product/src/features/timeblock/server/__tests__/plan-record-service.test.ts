import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicRecordSelect } from '@/lib/database';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import { PlanService } from '../plan-service';
import { RecordService } from '../record-service';
import { TimeblockServiceError } from '../timeblock-service-error';
import type { PlanRow, RecordRow } from '../timeblock-types';
import type { ServiceSupabaseClient } from '../types';

const commandMocks = vi.hoisted(() => ({
  createPlan: vi.fn(),
  createRecord: vi.fn(),
  confirmDay: vi.fn(),
  deletePlan: vi.fn(),
  deleteRecord: vi.fn(),
  recordPlan: vi.fn(),
  restorePlan: vi.fn(),
  restoreRecord: vi.fn(),
  setPlanSkipped: vi.fn(),
  updatePlan: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock('../timeblock-command-client', () => ({
  createTimeblockCommandClient: () => commandMocks,
}));

const USER_ID = 'test-user-id';
const TAG_ID = '72cc49b4-7e57-4a85-9346-0e90b2db78e2';
const EXPECTED_UPDATED_AT = '2026-07-01T00:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  vi.clearAllMocks();
  commandMocks.createPlan.mockResolvedValue(createPlan());
  commandMocks.createRecord.mockResolvedValue(createRecord());
  commandMocks.confirmDay.mockResolvedValue([]);
  commandMocks.deletePlan.mockResolvedValue(createPlan({ deleted_at: '2026-07-15T12:00:00.000Z' }));
  commandMocks.deleteRecord.mockResolvedValue(
    createRecord({ deleted_at: '2026-07-15T12:00:00.000Z' }),
  );
  commandMocks.recordPlan.mockResolvedValue(
    createRecord({ plan_id: 'plan-1', source: 'from_plan' }),
  );
  commandMocks.restorePlan.mockResolvedValue(createPlan());
  commandMocks.restoreRecord.mockResolvedValue(createRecord());
  commandMocks.setPlanSkipped.mockResolvedValue(
    createPlan({ skipped_at: '2026-07-15T12:00:00.000Z' }),
  );
  commandMocks.updatePlan.mockResolvedValue(createPlan());
  commandMocks.updateRecord.mockResolvedValue(createRecord());
});

afterEach(() => {
  vi.useRealTimers();
});

function createPlanService(mockSupabase = createMockSupabase()) {
  return {
    mockSupabase,
    service: new PlanService(mockSupabase as unknown as ServiceSupabaseClient),
  };
}

function createRecordService(mockSupabase = createMockSupabase()) {
  return {
    mockSupabase,
    service: new RecordService(mockSupabase as unknown as ServiceSupabaseClient),
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
    id: 'record-1',
    note: null,
    plan_id: null,
    source: 'manual',
    start_at: '2026-03-17T10:00:00.000Z',
    tag_id: null,
    title: 'Record',
    updated_at: '2026-07-01T00:00:00.000Z',
    user_id: USER_ID,
    ...overrides,
  };
}

describe('PlanService.list', () => {
  it('同一userのactive tag名をnoteと同じOR条件で検索する', async () => {
    const plan = createPlan({ tag_id: TAG_ID, title: 'Legacy plan title' });
    const planQuery = createChainableMock([plan]);
    const tagQuery = createChainableMock([{ id: TAG_ID }]);
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : planQuery,
    );

    await expect(
      service.list({ userId: USER_ID, search: 'Focus', sortOrder: 'desc', limit: 21 }),
    ).resolves.toEqual([plan]);

    expect(tagQuery.select).toHaveBeenCalledWith('id');
    expect(tagQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(tagQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(tagQuery.ilike).toHaveBeenCalledWith('name', '%Focus%');
    expect(planQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(planQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(planQuery.is).not.toHaveBeenCalledWith('skipped_at', null);
    expect(planQuery.or).toHaveBeenCalledWith(`note.ilike.%Focus%,tag_id.in.(${TAG_ID})`);
    expect(planQuery.or).not.toHaveBeenCalledWith(expect.stringContaining('title.ilike'));
    expect(planQuery.order).toHaveBeenCalledWith('start_at', { ascending: false });
    expect(planQuery.limit).toHaveBeenCalledWith(21);
  });

  it('tag検索失敗時は不完全なplan一覧を返さない', async () => {
    const planQuery = createChainableMock([createPlan()]);
    const tagQuery = createChainableMock([], { message: 'tag lookup failed' });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : planQuery,
    );

    await expect(service.list({ userId: USER_ID, search: 'Focus' })).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to search timeblock tags',
    });

    expect(planQuery.or).not.toHaveBeenCalled();
  });

  it('検索query失敗時はDB messageを例外へ含めない', async () => {
    const privateError = 'parse failed near note.ilike.%private words%';
    const recordQuery = createChainableMock([], { message: privateError });
    const tagQuery = createChainableMock([]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : recordQuery,
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
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : recordQuery,
    );

    await expect(
      service.list({
        userId: USER_ID,
        search: ' deep.,()\\%*:_work ',
        sortOrder: 'desc',
        limit: 21,
      }),
    ).resolves.toEqual([record]);

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

  it('tag名一致をrecordのOR条件へ加える', async () => {
    const record = createRecord({ tag_id: TAG_ID });
    const recordQuery = createChainableMock([record]);
    const tagQuery = createChainableMock([{ id: TAG_ID }]);
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'tags' ? tagQuery : recordQuery,
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
  it('DB clockで過去と判定された plan 作成エラーを返す', async () => {
    const { service } = createPlanService();
    commandMocks.createPlan.mockRejectedValue(
      new TimeblockServiceError('PLAN_IN_PAST', 'Plans must end in the future.'),
    );

    await expect(
      service.create({
        userId: USER_ID,
        preventOverlappingPlans: false,
        input: {
          title: 'Past plan',
          start_at: '2026-03-17T10:00:00.000Z',
          end_at: '2026-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_IN_PAST' });
  });

  it('DB exclusion violation を TIME_OVERLAP に変換する', async () => {
    const { service, mockSupabase } = createPlanService();
    const overlapMock = createChainableMock([]);
    mockSupabase.from.mockReturnValue(overlapMock);
    commandMocks.createPlan.mockRejectedValue(
      new TimeblockServiceError('TIME_OVERLAP', 'This time range overlaps with an existing item.'),
    );

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Future plan',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'TIME_OVERLAP' });
  });
});

describe('PlanService.update', () => {
  it('DB clockで過去と判定された plan の時間変更エラーを返す', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commandMocks.updatePlan.mockRejectedValue(
      new TimeblockServiceError('PLAN_TIME_LOCKED', 'Past plan time is locked.'),
    );

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        preventOverlappingPlans: false,
        input: { start_at: '2026-03-17T09:00:00.000Z' },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_TIME_LOCKED' });

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('DB clockで過去と判定された plan を未来へ移動し直すエラーを返す', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commandMocks.updatePlan.mockRejectedValue(
      new TimeblockServiceError('PLAN_TIME_LOCKED', 'Past plan time is locked.'),
    );

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        preventOverlappingPlans: false,
        input: {
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_TIME_LOCKED' });

    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('DB clockで現在以前となる plan 時間変更エラーを返す', async () => {
    const existing = createPlan();
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commandMocks.updatePlan.mockRejectedValue(
      new TimeblockServiceError('PLAN_IN_PAST', 'Plans must end in the future.'),
    );

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        preventOverlappingPlans: false,
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
    const { service, mockSupabase } = createPlanService();
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createChainableMock(existing);
      if (callCount === 2) return createChainableMock([]);
      return createChainableMock(updated);
    });
    commandMocks.updatePlan.mockResolvedValue(updated);

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        input: { start_at: updated.start_at, end_at: updated.end_at },
      }),
    ).resolves.toMatchObject({ start_at: updated.start_at, end_at: updated.end_at });
  });

  it('過去 plan でもタグとメモの更新は許可する', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const updated = { ...existing, note: 'Updated note', tag_id: 'tag-1' };
    const { service, mockSupabase } = createPlanService();
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return createChainableMock(callCount === 1 ? existing : updated);
    });
    commandMocks.updatePlan.mockResolvedValue(updated);

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        input: { note: 'Updated note', tagId: 'tag-1' },
      }),
    ).resolves.toMatchObject({ note: 'Updated note', tag_id: 'tag-1' });
  });
});

describe('PlanService.record', () => {
  it('past plan の range を from_plan record としてコピーする', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      external_calendar_event_id: 'external-event-1',
      note: 'note',
      start_at: '2026-03-17T10:00:00.000Z',
      tag_id: 'tag-1',
      title: 'Recorded plan',
    });
    const record = createRecord({
      end_at: plan.end_at,
      note: plan.note,
      plan_id: plan.id,
      source: 'from_plan',
      start_at: plan.start_at,
      tag_id: plan.tag_id,
      title: plan.title,
    });
    const { service } = createPlanService();
    commandMocks.recordPlan.mockResolvedValue(record);

    await expect(
      service.record({
        userId: USER_ID,
        planId: plan.id,
        expectedUpdatedAt: plan.updated_at,
      }),
    ).resolves.toMatchObject({
      plan_id: plan.id,
      source: 'from_plan',
    });
    expect(commandMocks.recordPlan).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: plan.id,
      expectedUpdatedAt: plan.updated_at,
    });
  });

  it('active record が紐づく plan の再記録を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service } = createPlanService();
    commandMocks.recordPlan.mockRejectedValue(
      new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.'),
    );

    await expect(
      service.record({
        userId: USER_ID,
        planId: plan.id,
        expectedUpdatedAt: plan.updated_at,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
  });

  it('同時記録による from_plan 一意制約違反を再記録エラーに変換する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service } = createPlanService();
    commandMocks.recordPlan.mockRejectedValue(
      new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.'),
    );

    await expect(
      service.record({
        userId: USER_ID,
        planId: plan.id,
        expectedUpdatedAt: plan.updated_at,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
  });
});

describe('PlanService.skip', () => {
  it('active record が紐づく plan の skip を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockReturnValue(createChainableMock(plan));
    commandMocks.setPlanSkipped.mockRejectedValue(
      new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.'),
    );

    await expect(
      service.skip({
        userId: USER_ID,
        planId: plan.id,
        expectedUpdatedAt: plan.updated_at,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
  });
});

describe('PlanService atomic delete', () => {
  it('delete / restoreへ同じraw versionを渡す', async () => {
    const { service } = createPlanService();

    await service.delete({
      userId: USER_ID,
      planId: 'plan-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
    await service.restore({
      userId: USER_ID,
      planId: 'plan-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });

    expect(commandMocks.deletePlan).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: 'plan-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
    expect(commandMocks.restorePlan).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: 'plan-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
  });
});

describe('PlanService.confirmDay', () => {
  it('service-owned commandへ user と day range を渡す', async () => {
    const record = createRecord({ source: 'from_plan' });
    const { service } = createPlanService();
    commandMocks.confirmDay.mockResolvedValue([record]);

    await expect(
      service.confirmDay({
        userId: USER_ID,
        input: {
          start_at: '2026-03-17T00:00:00.000Z',
          end_at: '2026-03-18T00:00:00.000Z',
        },
      }),
    ).resolves.toEqual([record]);

    expect(commandMocks.confirmDay).toHaveBeenCalledWith({
      endAt: '2026-03-18T00:00:00.000Z',
      startAt: '2026-03-17T00:00:00.000Z',
      userId: USER_ID,
    });
  });

  it('同時確定による from_plan 一意制約違反を再記録エラーに変換する', async () => {
    const { service } = createPlanService();
    commandMocks.confirmDay.mockRejectedValue(
      new TimeblockServiceError('ALREADY_RECORDED', 'Plan already has an active record.'),
    );

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
  it('DB clockで未来と判定された record 作成エラーを返す', async () => {
    const { service } = createRecordService();
    commandMocks.createRecord.mockRejectedValue(
      new TimeblockServiceError('RECORD_IN_FUTURE', 'Records cannot end in the future.'),
    );

    await expect(
      service.create({
        userId: USER_ID,
        preventOverlappingRecords: false,
        input: {
          title: 'Future record',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });
  });

  it('past plan には複数の manual record を紐づけられる', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const record = createRecord({ plan_id: plan.id });
    const { service, mockSupabase } = createRecordService();
    let recordsCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'plans') return createChainableMock(plan);
      recordsCallCount++;
      return createChainableMock(recordsCallCount === 1 ? [] : record);
    });
    commandMocks.createRecord.mockResolvedValue(record);

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
  });

  it('future plan への紐づけを拒否する', async () => {
    const { service } = createRecordService();
    commandMocks.createRecord.mockRejectedValue(
      new TimeblockServiceError('RECORD_IN_FUTURE', 'Future plans cannot have linked records.'),
    );

    await expect(
      service.create({
        userId: USER_ID,
        preventOverlappingRecords: false,
        input: {
          title: 'Linked record',
          planId: 'plan-1',
          start_at: '2026-03-17T10:00:00.000Z',
          end_at: '2026-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });
  });

  it('skip済みplanへの紐づけを拒否する', async () => {
    const { service } = createRecordService();
    commandMocks.createRecord.mockRejectedValue(
      new TimeblockServiceError('INVALID_INPUT', 'Skipped plans cannot have linked records.'),
    );

    await expect(
      service.create({
        userId: USER_ID,
        preventOverlappingRecords: false,
        input: {
          title: 'Linked record',
          planId: 'plan-1',
          start_at: '2026-03-17T10:15:00.000Z',
          end_at: '2026-03-17T10:45:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('plan 紐づけの update でも future plan を拒否する', async () => {
    const existing = createRecord();
    const { service, mockSupabase } = createRecordService();
    mockSupabase.from.mockReturnValue(createChainableMock(existing));
    commandMocks.updateRecord.mockRejectedValue(
      new TimeblockServiceError('RECORD_IN_FUTURE', 'Future plans cannot have linked records.'),
    );

    await expect(
      service.update({
        userId: USER_ID,
        recordId: existing.id,
        expectedUpdatedAt: existing.updated_at,
        input: { planId: 'plan-1' },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });
  });
});

describe('RecordService atomic delete', () => {
  it('delete / restoreへ同じraw versionを渡す', async () => {
    const { service } = createRecordService();

    await service.delete({
      userId: USER_ID,
      recordId: 'record-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
    await service.restore({
      userId: USER_ID,
      recordId: 'record-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });

    expect(commandMocks.deleteRecord).toHaveBeenCalledWith({
      userId: USER_ID,
      recordId: 'record-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
    expect(commandMocks.restoreRecord).toHaveBeenCalledWith({
      userId: USER_ID,
      recordId: 'record-1',
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
  });

  it('command失敗をそのまま返す', async () => {
    const { service } = createRecordService();
    commandMocks.deleteRecord.mockRejectedValue(
      new TimeblockServiceError('CONFLICT', 'This item was updated elsewhere.'),
    );
    commandMocks.restoreRecord.mockRejectedValue(
      new TimeblockServiceError('TIME_OVERLAP', 'This time range overlaps.'),
    );

    await expect(
      service.delete({
        userId: USER_ID,
        recordId: 'record-1',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      service.restore({
        userId: USER_ID,
        recordId: 'record-1',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    ).rejects.toMatchObject({ code: 'TIME_OVERLAP' });
  });
});
