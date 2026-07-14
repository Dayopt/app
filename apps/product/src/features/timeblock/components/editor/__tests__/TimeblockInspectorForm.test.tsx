import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Row } from '@/lib/database';

import { TimeblockInspectorForm } from '../TimeblockInspectorForm';

const mocks = vi.hoisted(() => ({
  enqueueSave: vi.fn(),
  flushSave: vi.fn(),
  toastError: vi.fn(),
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
  useCoalescedTimeblockSave: () => ({
    enqueue: mocks.enqueueSave,
    flush: mocks.flushSave,
  }),
}));

vi.mock('../../../hooks/useTimeblockWriteMutations', () => ({
  useTimeblockWriteMutations: () => {
    const mutation = {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    };
    return {
      deleteRecord: mutation,
      deletePlan: mutation,
      restoreRecord: mutation,
      restorePlan: mutation,
      skipPlan: mutation,
      unskipPlan: mutation,
      updateRecord: mutation,
      updatePlan: mutation,
    };
  },
}));

vi.mock('../../inspector/fields', () => ({
  TagRow: () => null,
}));

vi.mock('../TimeblockRecordActions', () => ({
  RecordPlanButton: ({ beforeRecord }: { beforeRecord: () => Promise<void> }) => (
    <button type="button" onClick={() => void beforeRecord()}>
      prepare-record
    </button>
  ),
}));

vi.mock('../TimeblockEditor', () => ({
  isValidTimeModelRange: ({ startAt, endAt }: { startAt: Date; endAt: Date }) =>
    startAt.getTime() < endAt.getTime(),
  TimeblockEditor: ({
    value,
    onDateTimeChange,
    onNoteChange,
  }: {
    value: {
      note: string;
      tagId: string | null;
      startAt: Date;
      endAt: Date;
      source: 'plan' | 'record';
    };
    onDateTimeChange: (next: {
      note: string;
      tagId: string | null;
      startAt: Date;
      endAt: Date;
      source: 'plan' | 'record';
    }) => void;
    onNoteChange: (note: string) => void;
  }) => (
    <>
      <output data-testid="current-end">{value.endAt.toISOString()}</output>
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

describe('TimeblockInspectorForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    vi.clearAllMocks();
    mocks.flushSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('未来Planの終了を現在以前へ変更せず、保存キューにも送らない', () => {
    render(
      <TimeblockInspectorForm
        kind="plan"
        plan={futurePlan}
        isRecorded={false}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByTestId('current-end')).toHaveTextContent('2026-07-15T14:00:00.000Z');

    fireEvent.click(screen.getByRole('button', { name: 'move-to-now' }));

    expect(screen.getByTestId('current-end')).toHaveTextContent('2026-07-15T14:00:00.000Z');
    expect(mocks.enqueueSave).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('timeblock.editor.timeLocked');
  });

  it('記録前にdebounceを止め、最新のタグとメモをsnapshot保存する', () => {
    render(
      <TimeblockInspectorForm kind="plan" plan={pastPlan} isRecorded={false} onDeleted={vi.fn()} />,
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
});
