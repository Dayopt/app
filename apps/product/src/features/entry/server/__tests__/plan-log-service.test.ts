import { describe, expect, it } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import { LogService } from '../log-service';
import { PlanService } from '../plan-service';
import { TimeModelServiceError } from '../time-model-service-error';
import type { LogRow, PlanRow } from '../time-model-types';
import type { ServiceSupabaseClient } from '../types';

const USER_ID = 'test-user-id';

function createPlanService(mockSupabase = createMockSupabase()) {
  return {
    mockSupabase,
    service: new PlanService(mockSupabase as unknown as ServiceSupabaseClient),
  };
}

function createLogService(mockSupabase = createMockSupabase()) {
  return {
    mockSupabase,
    service: new LogService(mockSupabase as unknown as ServiceSupabaseClient),
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

function createLog(overrides: Partial<LogRow> = {}): LogRow {
  return {
    created_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    end_at: '2026-03-17T11:00:00.000Z',
    external_calendar_event_id: null,
    fulfillment_score: null,
    id: 'log-1',
    note: null,
    plan_id: null,
    source: 'manual',
    start_at: '2026-03-17T10:00:00.000Z',
    tag_id: null,
    title: 'Log',
    updated_at: '2026-07-01T00:00:00.000Z',
    user_id: USER_ID,
    ...overrides,
  };
}

describe('PlanService.create', () => {
  it('過去に完了する plan 作成を拒否する', async () => {
    const { service, mockSupabase } = createPlanService();

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
  });

  it('DB exclusion violation を TIME_OVERLAP に変換する', async () => {
    const { service, mockSupabase } = createPlanService();
    const overlapMock = createChainableMock([]);
    const insertMock = createChainableMock(null, {
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint',
    });
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? overlapMock : insertMock;
    });

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
  });

  it('過去 plan でも title 更新は許可する', async () => {
    const existing = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const updated = { ...existing, title: 'Updated' };
    const { service, mockSupabase } = createPlanService();
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return createChainableMock(callCount === 1 ? existing : updated);
    });

    await expect(
      service.update({
        userId: USER_ID,
        planId: existing.id,
        input: { title: 'Updated' },
      }),
    ).resolves.toMatchObject({ title: 'Updated' });
  });
});

describe('PlanService.record', () => {
  it('past plan の range を from_plan log としてコピーする', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      external_calendar_event_id: 'external-event-1',
      note: 'note',
      start_at: '2026-03-17T10:00:00.000Z',
      tag_id: 'tag-1',
      title: 'Recorded plan',
    });
    const log = createLog({
      end_at: plan.end_at,
      note: plan.note,
      plan_id: plan.id,
      source: 'from_plan',
      start_at: plan.start_at,
      tag_id: plan.tag_id,
      title: plan.title,
    });
    const { service, mockSupabase } = createPlanService();
    let logsCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'plans') return createChainableMock(plan);
      logsCallCount++;
      return createChainableMock(logsCallCount <= 2 ? [] : log);
    });

    await expect(service.record({ userId: USER_ID, planId: plan.id })).resolves.toMatchObject({
      plan_id: plan.id,
      source: 'from_plan',
    });
  });

  it('active log が紐づく plan の再記録を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const existingLog = createLog({
      end_at: '2026-03-17T13:00:00.000Z',
      plan_id: plan.id,
      start_at: '2026-03-17T12:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : [existingLog]),
    );

    await expect(service.record({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'ALREADY_RECORDED',
    });

    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });

  it('同時記録による from_plan 一意制約違反を再記録エラーに変換する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    let logsCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'plans') return createChainableMock(plan);
      logsCallCount++;
      if (logsCallCount <= 2) return createChainableMock([]);
      return createChainableMock(null, {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      });
    });

    await expect(service.record({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'ALREADY_RECORDED',
    });
  });
});

describe('PlanService.skip', () => {
  it('active log が紐づく plan の skip を拒否する', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'plans' ? plan : [createLog({ plan_id: plan.id })]),
    );

    await expect(service.skip({ userId: USER_ID, planId: plan.id })).rejects.toMatchObject({
      code: 'ALREADY_RECORDED',
    });
  });
});

describe('PlanService.confirmDay', () => {
  it('confirm_day_plans_to_logs RPC へ user と day range を渡す', async () => {
    const log = createLog({ source: 'from_plan' });
    const { service, mockSupabase } = createPlanService();
    mockSupabase.rpc.mockResolvedValue({ data: [log], error: null });

    await expect(
      service.confirmDay({
        userId: USER_ID,
        input: {
          start_at: '2026-03-17T00:00:00.000Z',
          end_at: '2026-03-18T00:00:00.000Z',
        },
      }),
    ).resolves.toEqual([log]);

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'confirm_day_plans_to_logs',
      expect.objectContaining({
        p_end_at: '2026-03-18T00:00:00.000Z',
        p_start_at: '2026-03-17T00:00:00.000Z',
        p_user_id: USER_ID,
      }),
    );
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

describe('LogService.create', () => {
  it('未来に完了する log 作成を拒否する', async () => {
    const { service, mockSupabase } = createLogService();

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Future log',
          start_at: '2030-03-17T10:00:00.000Z',
          end_at: '2030-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(TimeModelServiceError);

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('past plan には複数の manual log を紐づけられる', async () => {
    const plan = createPlan({
      end_at: '2026-03-17T11:00:00.000Z',
      start_at: '2026-03-17T10:00:00.000Z',
    });
    const log = createLog({ plan_id: plan.id });
    const { service, mockSupabase } = createLogService();
    let logsCallCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'plans') return createChainableMock(plan);
      logsCallCount++;
      return createChainableMock(logsCallCount === 1 ? [] : log);
    });

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
    const { service, mockSupabase } = createLogService();
    mockSupabase.from.mockReturnValue(createChainableMock(createPlan()));

    await expect(
      service.create({
        userId: USER_ID,
        input: {
          title: 'Linked log',
          planId: 'plan-1',
          start_at: '2026-03-17T10:00:00.000Z',
          end_at: '2026-03-17T11:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });

    expect(mockSupabase.from).toHaveBeenCalledWith('plans');
  });

  it('plan 紐づけの update でも future plan を拒否する', async () => {
    const existing = createLog();
    const { service, mockSupabase } = createLogService();
    mockSupabase.from.mockImplementation((table: string) =>
      createChainableMock(table === 'logs' ? existing : createPlan()),
    );

    await expect(
      service.update({
        userId: USER_ID,
        logId: existing.id,
        input: { planId: 'plan-1' },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_IN_FUTURE' });
  });
});
