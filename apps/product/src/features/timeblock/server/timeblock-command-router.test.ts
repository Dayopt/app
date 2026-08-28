import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const methods = vi.hoisted(() => ({
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
}));

vi.mock('./timeblock-command-service', () => ({
  createTimeblockCommandService: () => methods,
}));

import { appRouter } from '@/app/api/trpc/_server/app-router';
import { planCommandsRouter } from './plan-commands-router';
import { recordCommandsRouter } from './record-commands-router';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const PLAN_ID = '00000000-0000-4000-8000-0000000000b1';
const RECORD_ID = '00000000-0000-4000-8000-0000000000c1';
const VERSION = '2026-07-29T00:00:00.123456Z';
const createPlanCaller = createCallerFactory(planCommandsRouter);
const createRecordCaller = createCallerFactory(recordCommandsRouter);

function planCaller() {
  return createPlanCaller(createMockContext({ userId: USER_ID }));
}

function recordCaller() {
  return createRecordCaller(createMockContext({ userId: USER_ID }));
}

describe('timeblock command routers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.values(methods)) method.mockResolvedValue({});
  });

  it('root routerでlegacy query/writeとversioned commandを別namespaceに保つ', () => {
    const procedureNames = Object.keys(appRouter._def.procedures);

    expect(procedureNames).toEqual(
      expect.arrayContaining([
        'plans.update',
        'records.update',
        'planCommands.update',
        'recordCommands.update',
      ]),
    );
  });

  // 「未認証は UNAUTHORIZED」の契約は write-fence-coverage.test.ts が全 procedure 横断で
  // 機械検証する（#2187 E-3）。ここでの個別 assert（planCommands.create）は重複だったため削除した。

  it('versioned Plan inputを必須にし、session userをserviceへbindする', async () => {
    await expect(
      planCaller().update({
        id: PLAN_ID,
        data: { title: 'Changed' },
        expectedUpdatedAt: VERSION,
      }),
    ).resolves.toEqual({});

    expect(methods.updatePlan).toHaveBeenCalledWith({
      userId: USER_ID,
      id: PLAN_ID,
      input: { title: 'Changed' },
      expectedUpdatedAt: VERSION,
    });

    await expect(
      // Runtime validation is intentionally checked independently of TypeScript.
      planCaller().update({ id: PLAN_ID, data: { title: 'Missing version' } } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('versioned Record deleteへsession userとraw tokenを渡す', async () => {
    await recordCaller().delete({ id: RECORD_ID, expectedUpdatedAt: VERSION });

    expect(methods.deleteRecord).toHaveBeenCalledWith({
      userId: USER_ID,
      id: RECORD_ID,
      expectedUpdatedAt: VERSION,
    });
  });

  // p_user_id は Plan / Record の owner 境界そのもので、authenticated の直接 DML を
  // 剥がした後は RLS が第2の防波堤として効かない。守りは 2 段（zod の unknown key
  // strip と router の spread 順）で、この test は「2 段とも外れた時だけ落ちる」形で
  // その合成を固定する。片方だけ残っていれば pass する点は意図通り。
  it('client入力のuserIdはsession userを上書きしない', async () => {
    const forgedUserId = '00000000-0000-4000-8000-0000000000ff';

    await recordCaller().delete({
      id: RECORD_ID,
      expectedUpdatedAt: VERSION,
      userId: forgedUserId,
    } as never);
    expect(methods.deleteRecord).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }));

    await planCaller().skip({
      id: PLAN_ID,
      expectedUpdatedAt: VERSION,
      userId: forgedUserId,
    } as never);
    expect(methods.setPlanSkipped).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, skipped: true }),
    );
  });

  it('confirm dayはDSTの25時間を許可し、26時間超を拒否する', async () => {
    await expect(
      planCaller().confirmDay({
        start_at: '2026-10-31T00:00:00.000Z',
        end_at: '2026-11-01T01:00:00.000Z',
      }),
    ).resolves.toEqual({});

    await expect(
      planCaller().confirmDay({
        start_at: '2026-10-31T00:00:00.000Z',
        end_at: '2026-11-01T03:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
