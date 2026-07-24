import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicRecordRow, Row } from '@/lib/database';

import { createTimeblockDuplicateDraft } from '../../../lib/timeblock-duplicate';
import { TimeblockInspectorForm } from '../TimeblockInspectorForm';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const mocks = vi.hoisted(() => ({
  enqueueSave: vi.fn(),
  flushSave: vi.fn(),
  discardPending: vi.fn(),
  hasPendingChanges: vi.fn(() => false),
  savePatch: undefined as
    ((patch: { note?: string | null; tagId?: string | null }) => Promise<unknown>) | undefined,
  toastError: vi.fn(),
  createPlanMutate: vi.fn(),
  createRecordMutate: vi.fn(),
  updatePlanMutateAsync: vi.fn(),
  skipPlanMutateAsync: vi.fn(),
  removeMissingTimeblock: vi.fn(),
  fetchPlanById: vi.fn(),
  isConflict: false,
  isNotFound: false,
  onCreateTimeOverlap: undefined as (() => void) | undefined,
  onUpdateTimeOverlap: undefined as
    | ((input: {
        id: string;
        data: { start_at?: string | undefined; end_at?: string | undefined };
      }) => void)
    | undefined,
  cachedPlans: [] as Array<{ id: string; start_at: string; end_at: string }>,
  cachedRecords: [] as Array<{ id: string; start_at: string; end_at: string }>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: ({ predicate }: { predicate: (query: { queryKey: unknown }) => boolean }) => {
      const entries: Array<[unknown, Array<{ id: string; start_at: string; end_at: string }>]> = [
        [[['plans', 'list'], { input: {} }], mocks.cachedPlans],
        [[['records', 'list'], { input: {} }], mocks.cachedRecords],
      ];
      return entries.filter(([queryKey]) => predicate({ queryKey }));
    },
  }),
}));

vi.mock('@/features/tags', () => ({
  getTagColorClasses: vi.fn(),
  resolveTagColor: (color: string | null | undefined) => color ?? 'gray',
  useCreateTag: () => ({ mutateAsync: vi.fn() }),
  useTagsMap: () => ({ getTagById: vi.fn() }),
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
  },
}));

vi.mock('../../../hooks/useCoalescedTimeblockSave', () => ({
  useCoalescedTimeblockSave: (
    savePatch: (patch: { note?: string | null; tagId?: string | null }) => Promise<unknown>,
  ) => {
    mocks.savePatch = savePatch;
    return {
      discardPending: mocks.discardPending,
      enqueue: mocks.enqueueSave,
      flush: mocks.flushSave,
      hasPendingChanges: mocks.hasPendingChanges,
    };
  },
}));

vi.mock('../../../hooks/useTimeblockWriteMutations', () => ({
  isTimeblockConflictError: () => mocks.isConflict,
  isTimeblockNotFoundError: () => mocks.isNotFound,
  removeMissingTimeblockFromCache: mocks.removeMissingTimeblock,
  useTimeblockWriteMutations: (options?: {
    onCreateTimeOverlap?: () => void;
    onUpdateTimeOverlap?: (input: {
      id: string;
      data: { start_at?: string | undefined; end_at?: string | undefined };
    }) => void;
  }) => {
    mocks.onCreateTimeOverlap = options?.onCreateTimeOverlap;
    mocks.onUpdateTimeOverlap = options?.onUpdateTimeOverlap;
    const mutation = {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    };
    return {
      createRecord: { ...mutation, mutate: mocks.createRecordMutate },
      createPlan: { ...mutation, mutate: mocks.createPlanMutate },
      deleteRecord: mutation,
      deletePlan: mutation,
      fetchPlanById: mocks.fetchPlanById,
      fetchRecordById: vi.fn(),
      restoreRecord: mutation,
      restorePlan: mutation,
      skipPlan: { ...mutation, mutateAsync: mocks.skipPlanMutateAsync },
      unskipPlan: mutation,
      updateRecord: mutation,
      updatePlan: { ...mutation, mutateAsync: mocks.updatePlanMutateAsync },
    };
  },
}));

vi.mock('../../inspector/fields', () => ({
  TagRow: ({
    tagId,
    menuItems,
  }: {
    tagId?: string | null;
    menuItems?: Array<{ key: string; onSelect: () => void }>;
  }) => (
    <>
      <output data-testid="current-tag">{tagId ?? 'none'}</output>
      {menuItems?.map((item) => (
        <button key={item.key} type="button" onClick={item.onSelect}>
          {item.key}
        </button>
      ))}
    </>
  ),
}));

vi.mock('../TimeblockRecordActions', () => ({
  RecordPlanButton: ({
    beforeRecord,
    onRecorded,
  }: {
    beforeRecord: () => Promise<void>;
    onRecorded?: (recordId: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => void beforeRecord()}>
        prepare-record
      </button>
      <button type="button" onClick={() => onRecorded?.('record-created')}>
        complete-record
      </button>
    </>
  ),
}));

vi.mock('../TimeblockRelationshipSection', () => ({
  TimeblockRelationshipSection: () => null,
}));

vi.mock('../TimeblockEditor', () => ({
  isValidTimeModelRange: ({ startAt, endAt }: { startAt: Date; endAt: Date }) =>
    startAt.getTime() < endAt.getTime(),
  TimeblockEditor: ({
    value,
    onDateTimeChange,
    onNoteChange,
    dateTimeError,
  }: {
    value: {
      note: string;
      tagId: string | null;
      startAt: Date;
      endAt: Date;
      source?: 'plan' | 'record';
    };
    onDateTimeChange: (next: {
      note: string;
      tagId: string | null;
      startAt: Date;
      endAt: Date;
      source?: 'plan' | 'record';
    }) => void;
    onNoteChange: (note: string) => void;
    dateTimeError?: string;
  }) => (
    <>
      <output data-testid="current-note">{value.note}</output>
      <output data-testid="current-start">{value.startAt.toISOString()}</output>
      <output data-testid="current-end">{value.endAt.toISOString()}</output>
      {dateTimeError ? <output data-testid="date-time-error">{dateTimeError}</output> : null}
      <button
        type="button"
        onClick={() =>
          onDateTimeChange({
            ...value,
            startAt: new Date('2026-07-15T11:00:00.000Z'),
            endAt: new Date('2026-07-15T12:00:00.000Z'),
          })
        }
      >
        move-to-now
      </button>
      <button type="button" onClick={() => onNoteChange('最新メモ')}>
        edit-note
      </button>
      <button
        type="button"
        onClick={() =>
          onDateTimeChange({
            ...value,
            startAt: new Date('2026-07-15T15:00:00.000Z'),
            endAt: new Date('2026-07-15T16:00:00.000Z'),
          })
        }
      >
        move-to-future
      </button>
      <button
        type="button"
        onClick={() =>
          onDateTimeChange({
            ...value,
            startAt: new Date('2026-07-15T07:00:00.000Z'),
            endAt: new Date('2026-07-15T08:00:00.000Z'),
          })
        }
      >
        move-to-past
      </button>
    </>
  ),
}));

const futurePlan = {
  id: 'plan-1',
  user_id: 'user-1',
  tag_id: '00000000-0000-4000-8000-000000000001',
  external_calendar_event_id: null,
  title: 'Future plan',
  note: null,
  start_at: '2026-07-15T13:00:00.000Z',
  end_at: '2026-07-15T14:00:00.000Z',
  skipped_at: null,
  source: 'manual',
  deleted_at: null,
  created_at: '2026-07-15T10:00:00.000Z',
  updated_at: '2026-07-15T10:00:00.000Z',
} satisfies Row<'plans'>;

const pastPlan = {
  ...futurePlan,
  start_at: '2026-07-15T10:00:00.000Z',
  end_at: '2026-07-15T11:00:00.000Z',
} satisfies Row<'plans'>;

const externallyUpdatedPlan = {
  ...futurePlan,
  tag_id: '00000000-0000-4000-8000-000000000002',
  note: '外部で更新されたメモ',
  start_at: '2026-07-15T16:00:00.000Z',
  end_at: '2026-07-15T17:00:00.000Z',
  updated_at: '2026-07-15T12:01:00.000Z',
} satisfies Row<'plans'>;

const relatedRecord = {
  id: 'record-1',
  user_id: 'user-1',
  tag_id: '00000000-0000-4000-8000-000000000001',
  plan_id: pastPlan.id,
  external_calendar_event_id: null,
  title: 'Recorded work',
  note: null,
  start_at: '2026-07-15T10:00:00.000Z',
  end_at: '2026-07-15T11:00:00.000Z',
  source: 'from_plan',
  deleted_at: null,
  created_at: '2026-07-15T10:00:00.000Z',
  updated_at: '2026-07-15T10:00:00.000Z',
} satisfies PublicRecordRow;

describe('TimeblockInspectorForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    vi.clearAllMocks();
    mocks.createPlanMutate.mockReset();
    mocks.createRecordMutate.mockReset();
    mocks.updatePlanMutateAsync.mockReset();
    mocks.skipPlanMutateAsync.mockReset();
    mocks.fetchPlanById.mockReset();
    mocks.savePatch = undefined;
    mocks.isConflict = false;
    mocks.isNotFound = false;
    mocks.onCreateTimeOverlap = undefined;
    mocks.onUpdateTimeOverlap = undefined;
    mocks.cachedPlans = [];
    mocks.cachedRecords = [];
    mocks.flushSave.mockResolvedValue(undefined);
    mocks.hasPendingChanges.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未来Planの終了を現在以前へ変更せず、保存キューにも送らない', () => {
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    expect(screen.getByTestId('current-end')).toHaveTextContent('2026-07-15T14:00:00.000Z');

    fireEvent.click(screen.getByRole('button', { name: 'move-to-now' }));

    expect(screen.getByTestId('current-end')).toHaveTextContent('2026-07-15T14:00:00.000Z');
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('timeblock.editor.timeLocked');
  });

  it('Planを別のPlanと重なる時間へ変更するとインライン表示し、保存しない', () => {
    mocks.cachedPlans = [
      futurePlan,
      {
        id: 'plan-2',
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
    ];
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    expect(screen.getByTestId('date-time-error')).toHaveTextContent(
      'timeblock.errors.planTimeOverlap',
    );
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('Recordを別のRecordと重なる時間へ変更するとインライン表示し、保存しない', () => {
    mocks.cachedRecords = [
      relatedRecord,
      {
        id: 'record-2',
        start_at: '2026-07-15T07:00:00.000Z',
        end_at: '2026-07-15T08:00:00.000Z',
      },
    ];
    render(<TimeblockInspectorForm kind="record" record={relatedRecord} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'move-to-past' }));

    expect(screen.getByTestId('date-time-error')).toHaveTextContent(
      'timeblock.errors.recordTimeOverlap',
    );
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('PlanとRecordの相互重複は許可して保存する', () => {
    mocks.cachedPlans = [futurePlan];
    mocks.cachedRecords = [
      {
        id: 'record-2',
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
    ];
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    expect(screen.queryByTestId('date-time-error')).not.toBeInTheDocument();
    expect(mocks.enqueueSave).toHaveBeenCalledWith({
      start_at: '2026-07-15T15:00:00.000Z',
      end_at: '2026-07-15T16:00:00.000Z',
    });
  });

  it('編集中の行自身は重複から除外する', () => {
    mocks.cachedPlans = [
      {
        id: futurePlan.id,
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
    ];
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    expect(screen.queryByTestId('date-time-error')).not.toBeInTheDocument();
    expect(mocks.enqueueSave).toHaveBeenCalledOnce();
  });

  it('競合後に空き時間へ変更するとエラーを解除して保存する', () => {
    mocks.cachedPlans = [
      futurePlan,
      {
        id: 'plan-2',
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
    ];
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));
    expect(screen.getByTestId('date-time-error')).toBeInTheDocument();

    mocks.cachedPlans = [futurePlan];
    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    expect(screen.queryByTestId('date-time-error')).not.toBeInTheDocument();
    expect(mocks.enqueueSave).toHaveBeenCalledWith({
      start_at: '2026-07-15T15:00:00.000Z',
      end_at: '2026-07-15T16:00:00.000Z',
    });
  });

  it('serverが現在の時間変更を重複拒否した場合もインライン表示する', () => {
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    act(() =>
      mocks.onUpdateTimeOverlap?.({
        id: futurePlan.id,
        data: {
          start_at: '2026-07-15T15:00:00.000Z',
          end_at: '2026-07-15T16:00:00.000Z',
        },
      }),
    );

    expect(screen.getByTestId('date-time-error')).toHaveTextContent(
      'timeblock.errors.planTimeOverlap',
    );
  });

  it('cleanな外部更新は表示値と次回CAS versionを同じsnapshotへ同期する', async () => {
    const { rerender } = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );

    rerender(
      <TimeblockInspectorForm kind="plan" plan={externallyUpdatedPlan} onDeleted={vi.fn()} />,
    );

    expect(screen.getByTestId('current-note')).toHaveTextContent('外部で更新されたメモ');
    expect(screen.getByTestId('current-tag')).toHaveTextContent(externallyUpdatedPlan.tag_id);
    expect(screen.getByTestId('current-start')).toHaveTextContent(externallyUpdatedPlan.start_at);
    expect(screen.getByTestId('current-end')).toHaveTextContent(externallyUpdatedPlan.end_at);
    expect(mocks.discardPending).not.toHaveBeenCalled();

    mocks.updatePlanMutateAsync.mockResolvedValue({
      ...externallyUpdatedPlan,
      updated_at: '2026-07-15T12:02:00.000Z',
    });
    await act(async () => {
      await mocks.savePatch?.({ note: '次の保存' });
    });

    expect(mocks.updatePlanMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: externallyUpdatedPlan.updated_at }),
    );
  });

  it('debounce中の外部更新はdraftを保持してwriteをfreezeする', () => {
    const { rerender } = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));

    rerender(
      <TimeblockInspectorForm kind="plan" plan={externallyUpdatedPlan} onDeleted={vi.fn()} />,
    );

    expect(screen.getByTestId('current-note')).toHaveTextContent('最新メモ');
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();
    expect(mocks.discardPending).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(600));
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('未開始の保存差分がある外部更新はqueueを破棄してfreezeする', () => {
    mocks.hasPendingChanges.mockReturnValue(true);
    const { rerender } = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );

    rerender(
      <TimeblockInspectorForm kind="plan" plan={externallyUpdatedPlan} onDeleted={vi.fn()} />,
    );

    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();
    expect(mocks.discardPending).toHaveBeenCalledOnce();
  });

  it('保存できない時間draftも外部更新で上書きせずfreezeする', () => {
    mocks.cachedPlans = [
      futurePlan,
      {
        id: 'plan-2',
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
    ];
    const { rerender } = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));

    rerender(
      <TimeblockInspectorForm kind="plan" plan={externallyUpdatedPlan} onDeleted={vi.fn()} />,
    );

    expect(screen.getByTestId('current-end')).toHaveTextContent('2026-07-15T16:00:00.000Z');
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();
    expect(mocks.discardPending).toHaveBeenCalledOnce();
  });

  it('外部更新後に進行中saveが成功してもwriteを再開しない', async () => {
    const activeSave = createDeferred<Row<'plans'>>();
    mocks.updatePlanMutateAsync.mockReturnValue(activeSave.promise);
    const { rerender } = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );

    const savePromise = mocks.savePatch?.({ note: '保存中' });
    rerender(
      <TimeblockInspectorForm kind="plan" plan={externallyUpdatedPlan} onDeleted={vi.fn()} />,
    );
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();

    activeSave.resolve({
      ...futurePlan,
      note: '保存中',
      updated_at: '2026-07-15T12:00:30.000Z',
    });
    await act(async () => {
      await savePromise;
      await mocks.savePatch?.({ tagId: null });
    });

    expect(mocks.updatePlanMutateAsync).toHaveBeenCalledOnce();
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();
  });

  it('CAS競合ではserver snapshotを自動取得せずdraftを保持してfreezeする', async () => {
    const conflict = new Error('conflict');
    mocks.isConflict = true;
    mocks.updatePlanMutateAsync.mockRejectedValue(conflict);
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));

    await act(async () => {
      await expect(mocks.savePatch?.({ note: '競合する保存' })).rejects.toBe(conflict);
    });

    expect(mocks.fetchPlanById).not.toHaveBeenCalled();
    expect(screen.getByTestId('current-note')).toHaveTextContent('最新メモ');
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();
  });

  it('外部削除ではdebounceと待機queueを破棄し、unmountでもdraftを送らない', () => {
    const view = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));

    view.rerender(
      <TimeblockInspectorForm
        kind="plan"
        plan={futurePlan}
        availability="unavailable"
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText('timeblock.inspector.notFound')).toBeInTheDocument();
    expect(mocks.discardPending).toHaveBeenCalledOnce();
    expect(mocks.removeMissingTimeblock).toHaveBeenCalledWith(
      expect.any(Object),
      'plans',
      futurePlan.id,
    );

    act(() => vi.advanceTimersByTime(600));
    view.unmount();
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('unavailable後の遅いsuccessでは同じmountを再び編集可能にしない', () => {
    const { rerender } = render(
      <TimeblockInspectorForm
        kind="plan"
        plan={futurePlan}
        availability="unavailable"
        onDeleted={vi.fn()}
      />,
    );

    rerender(
      <TimeblockInspectorForm
        kind="plan"
        plan={externallyUpdatedPlan}
        availability="available"
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText('timeblock.inspector.notFound')).toBeInTheDocument();
    expect(mocks.removeMissingTimeblock).toHaveBeenCalledWith(
      expect.any(Object),
      'plans',
      futurePlan.id,
    );
    expect(screen.queryByTestId('current-note')).not.toBeInTheDocument();
  });

  it('通常closeではdirty noteを一度だけ保存キューへ渡す', () => {
    const view = render(
      <TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));

    view.unmount();

    expect(mocks.enqueueSave).toHaveBeenCalledOnce();
    expect(mocks.enqueueSave).toHaveBeenCalledWith({ note: '最新メモ' });
  });

  it('action準備中の外部更新ではflush完了後のskipへ進まない', async () => {
    const pendingFlush = createDeferred<void>();
    mocks.flushSave.mockReturnValue(pendingFlush.promise);
    const externallyUpdatedPastPlan = {
      ...pastPlan,
      note: '外部更新',
      updated_at: '2026-07-15T12:01:00.000Z',
    };
    const { rerender } = render(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{ kind: 'plan', status: 'success', records: [], onRetry: vi.fn() }}
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'skip' }));

    rerender(
      <TimeblockInspectorForm
        kind="plan"
        plan={externallyUpdatedPastPlan}
        relationships={{ kind: 'plan', status: 'success', records: [], onRetry: vi.fn() }}
        onDeleted={vi.fn()}
      />,
    );
    pendingFlush.resolve();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.skipPlanMutateAsync).not.toHaveBeenCalled();
  });

  it('save中のNOT_FOUNDでもunavailableへ遷移して後続writeを止める', async () => {
    const notFoundError = new Error('not found');
    mocks.isNotFound = true;
    mocks.updatePlanMutateAsync.mockRejectedValue(notFoundError);
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    await act(async () => {
      await expect(mocks.savePatch?.({ note: '削除済みへの保存' })).rejects.toBe(notFoundError);
    });

    expect(screen.getByText('timeblock.inspector.notFound')).toBeInTheDocument();
    expect(mocks.removeMissingTimeblock).toHaveBeenCalledWith(
      expect.any(Object),
      'plans',
      futurePlan.id,
    );

    await act(async () => {
      await mocks.savePatch?.({ tagId: null });
    });
    expect(mocks.updatePlanMutateAsync).toHaveBeenCalledOnce();
  });

  it('記録前にdebounceを止め、最新のタグとメモをsnapshot保存する', () => {
    render(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{ kind: 'plan', status: 'success', records: [], onRetry: vi.fn() }}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));
    expect(mocks.enqueueSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'prepare-record' }));

    expect(mocks.flushSave).toHaveBeenCalledWith({
      note: '最新メモ',
      tagId: '00000000-0000-4000-8000-000000000001',
    });

    act(() => vi.advanceTimersByTime(600));
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('関係取得を解決するまで記録導線を出さず、0件成功時だけ表示する', () => {
    const { rerender } = render(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{ kind: 'plan', status: 'loading', records: [], onRetry: vi.fn() }}
        onOpenRelationship={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'prepare-record' })).not.toBeInTheDocument();

    rerender(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{ kind: 'plan', status: 'success', records: [], onRetry: vi.fn() }}
        onOpenRelationship={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'prepare-record' })).toBeInTheDocument();
  });

  it('関連RecordがあるPlanには記録導線を重ねて表示しない', () => {
    render(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{
          kind: 'plan',
          status: 'success',
          records: [relatedRecord],
          onRetry: vi.fn(),
        }}
        onOpenRelationship={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'prepare-record' })).not.toBeInTheDocument();
  });

  it('記録成功後のRecord IDをInspector切替へ渡す', () => {
    const onOpenRelationship = vi.fn();
    render(
      <TimeblockInspectorForm
        kind="plan"
        plan={pastPlan}
        relationships={{ kind: 'plan', status: 'success', records: [], onRetry: vi.fn() }}
        onOpenRelationship={onOpenRelationship}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'complete-record' }));
    expect(onOpenRelationship).toHaveBeenCalledWith('record-created', 'record');
  });

  it('詳細メニューから現在の入力内容を複製下書きへ渡す', () => {
    const onStartDuplicate = vi.fn();
    render(
      <TimeblockInspectorForm
        kind="plan"
        plan={futurePlan}
        onStartDuplicate={onStartDuplicate}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'edit-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }));

    expect(onStartDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: futurePlan.id,
        kind: 'plan',
        title: futurePlan.title,
        note: '最新メモ',
        tagId: futurePlan.tag_id,
        startAt: futurePlan.start_at,
        endAt: futurePlan.end_at,
      }),
    );
  });

  it('Plan複製の時間重複をインライン表示し、日時変更後に独立したPlanを作成する', () => {
    const onDuplicateCreated = vi.fn();
    const duplicateDraft = createTimeblockDuplicateDraft({
      sourceId: futurePlan.id,
      kind: 'plan',
      title: futurePlan.title,
      note: futurePlan.note,
      tagId: futurePlan.tag_id,
      startAt: new Date(futurePlan.start_at),
      endAt: new Date(futurePlan.end_at),
    });
    mocks.createPlanMutate.mockImplementationOnce(() => mocks.onCreateTimeOverlap?.());

    render(
      <TimeblockInspectorForm
        kind="plan"
        duplicateDraft={duplicateDraft}
        onDuplicateCreated={onDuplicateCreated}
        onDeleted={vi.fn()}
      />,
    );

    const createButton = screen.getByRole('button', {
      name: 'timeblock.editor.duplicate.create',
    });
    expect(createButton).toBeEnabled();
    expect(screen.queryByTestId('date-time-error')).not.toBeInTheDocument();

    fireEvent.click(createButton);
    expect(screen.getByTestId('date-time-error')).toHaveTextContent(
      'timeblock.errors.planTimeOverlap',
    );
    expect(createButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));
    expect(screen.queryByTestId('date-time-error')).not.toBeInTheDocument();
    expect(createButton).toBeEnabled();

    mocks.createPlanMutate.mockImplementation(
      (_input, options: { onSuccess?: (created: { id: string }) => void }) =>
        options.onSuccess?.({ id: 'plan-copy' }),
    );
    fireEvent.click(createButton);

    expect(mocks.createPlanMutate).toHaveBeenLastCalledWith(
      {
        title: futurePlan.title,
        tagId: futurePlan.tag_id,
        start_at: '2026-07-15T15:00:00.000Z',
        end_at: '2026-07-15T16:00:00.000Z',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onDuplicateCreated).toHaveBeenCalledWith('plan-copy', 'plan');
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
  });

  it('Record複製はplanIdを持たない独立Recordを作成する', () => {
    const onDuplicateCreated = vi.fn();
    const duplicateDraft = createTimeblockDuplicateDraft({
      sourceId: relatedRecord.id,
      kind: 'record',
      title: relatedRecord.title,
      note: relatedRecord.note,
      tagId: relatedRecord.tag_id,
      startAt: new Date(relatedRecord.start_at),
      endAt: new Date(relatedRecord.end_at),
    });
    mocks.createRecordMutate.mockImplementation(
      (_input, options: { onSuccess?: (created: { id: string }) => void }) =>
        options.onSuccess?.({ id: 'record-copy' }),
    );

    render(
      <TimeblockInspectorForm
        kind="record"
        duplicateDraft={duplicateDraft}
        onDuplicateCreated={onDuplicateCreated}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move-to-past' }));
    fireEvent.click(screen.getByRole('button', { name: 'timeblock.editor.duplicate.create' }));

    const input = mocks.createRecordMutate.mock.calls[0]?.[0];
    expect(input).toEqual({
      title: relatedRecord.title,
      tagId: relatedRecord.tag_id,
      start_at: '2026-07-15T07:00:00.000Z',
      end_at: '2026-07-15T08:00:00.000Z',
    });
    expect(input).not.toHaveProperty('planId');
    expect(onDuplicateCreated).toHaveBeenCalledWith('record-copy', 'record');
  });
});
