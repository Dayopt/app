import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicRecordRow, Row } from '@/lib/database';

import { createTimeblockDuplicateDraft } from '../../../lib/timeblock-duplicate';
import { TimeblockInspectorForm } from '../TimeblockInspectorForm';

const mocks = vi.hoisted(() => ({
  enqueueSave: vi.fn(),
  flushSave: vi.fn(),
  savePatch: undefined as
    ((patch: { note?: string | null; tagId?: string | null }) => Promise<unknown>) | undefined,
  toastError: vi.fn(),
  createPlanMutate: vi.fn(),
  createRecordMutate: vi.fn(),
  updatePlanMutateAsync: vi.fn(),
  fetchPlanById: vi.fn(),
  isConflict: false,
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
      enqueue: mocks.enqueueSave,
      flush: mocks.flushSave,
    };
  },
}));

vi.mock('../../../hooks/useTimeblockWriteMutations', () => ({
  isTimeblockConflictError: () => mocks.isConflict,
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
      skipPlan: mutation,
      unskipPlan: mutation,
      updateRecord: mutation,
      updatePlan: { ...mutation, mutateAsync: mocks.updatePlanMutateAsync },
    };
  },
}));

vi.mock('../../inspector/fields', () => ({
  TagRow: ({ menuItems }: { menuItems?: Array<{ key: string; onSelect: () => void }> }) => (
    <>
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
    mocks.fetchPlanById.mockReset();
    mocks.savePatch = undefined;
    mocks.isConflict = false;
    mocks.onCreateTimeOverlap = undefined;
    mocks.onUpdateTimeOverlap = undefined;
    mocks.cachedPlans = [];
    mocks.cachedRecords = [];
    mocks.flushSave.mockResolvedValue(undefined);
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

  it('競合後の最新行取得にも失敗した場合はInspectorをfail closedにする', async () => {
    const conflict = new Error('conflict');
    mocks.isConflict = true;
    mocks.updatePlanMutateAsync.mockRejectedValue(conflict);
    mocks.fetchPlanById.mockRejectedValue(new Error('fetch failed'));
    render(<TimeblockInspectorForm kind="plan" plan={futurePlan} onDeleted={vi.fn()} />);

    await act(async () => {
      await expect(mocks.savePatch?.({ note: '競合する保存' })).rejects.toBe(conflict);
    });

    expect(mocks.fetchPlanById).toHaveBeenCalledWith(futurePlan.id);
    expect(screen.getByText('timeblock.editor.toast.conflict')).toBeInTheDocument();

    mocks.enqueueSave.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'move-to-future' }));
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
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
