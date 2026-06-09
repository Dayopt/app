import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { InteractionState } from '../../../../../domain/interaction/types';
import type { CalendarEvent } from '../../../../../types/calendar.types';

import { buildResizePreviewEntry, EntryRenderer } from '../EntryRenderer';

vi.mock('@/features/tags', () => ({
  getTagColorClasses: () => ({
    cssVar: 'var(--entry-default)',
    cssVarTint: 'var(--entry-default-tint)',
    dot: 'bg-entry-default',
  }),
  useTagsMap: () => ({
    getTagById: () => undefined,
  }),
}));

const baseEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'Resize target',
  description: '',
  startDate: new Date('2026-01-15T10:00:00.000Z'),
  endDate: new Date('2026-01-15T11:00:00.000Z'),
  actualStartDate: new Date('2026-01-15T10:00:00.000Z'),
  actualEndDate: new Date('2026-01-15T11:00:00.000Z'),
  displayStartDate: new Date('2026-01-15T10:00:00.000Z'),
  displayEndDate: new Date('2026-01-15T11:00:00.000Z'),
  status: 'open',
  color: 'blue',
  tagId: null,
  createdAt: new Date('2026-01-15T09:00:00.000Z'),
  updatedAt: new Date('2026-01-15T09:00:00.000Z'),
  duration: 60,
  isMultiDay: false,
  origin: 'planned',
};

const resizingState: InteractionState = {
  mode: 'resizing',
  entryId: 'entry-1',
  startPoint: { clientX: 0, clientY: 0 },
  currentPoint: { clientX: 0, clientY: 60 },
  originalPosition: { top: 100, height: 60, left: 0, width: 100 },
  direction: 'bottom',
  snappedHeight: 120,
  previewTime: {
    start: new Date('2026-01-15T10:00:00.000Z'),
    end: new Date('2026-01-15T12:00:00.000Z'),
  },
  isOverlapping: false,
};

function renderEntryRenderer() {
  return render(
    <EntryRenderer
      entry={baseEntry}
      style={{ top: '100px', height: '60px' }}
      hourHeight={60}
      enableCrossDayDrag={false}
      dayIndex={0}
      isDragging={false}
      isResizing={true}
      entryDragging={false}
      entryResizing={true}
      interactionState={resizingState}
      globalDraggedEntryId={null}
      isSourceColumnMovingAway={false}
      onPointerDown={vi.fn()}
      onTouchStart={vi.fn()}
      onResizeStart={vi.fn()}
      entries={[baseEntry]}
    />,
  );
}

function renderPlanOnlyEntryRenderer() {
  const planOnlyEntry: CalendarEvent = {
    ...baseEntry,
    entryState: 'past',
    actualStartDate: null,
    actualEndDate: null,
  };

  return render(
    <EntryRenderer
      entry={planOnlyEntry}
      style={{ top: '100px', height: '60px' }}
      hourHeight={60}
      enableCrossDayDrag={false}
      dayIndex={0}
      isDragging={false}
      isResizing={false}
      entryDragging={false}
      entryResizing={false}
      interactionState={{ mode: 'idle' }}
      globalDraggedEntryId={null}
      isSourceColumnMovingAway={false}
      onPointerDown={vi.fn()}
      onTouchStart={vi.fn()}
      onResizeStart={vi.fn()}
      entries={[planOnlyEntry]}
    />,
  );
}

function renderEntryRendererWith({
  entry,
  entries,
  onGapClick,
}: {
  entry: CalendarEvent;
  entries: CalendarEvent[];
  onGapClick?: (startMinutes: number, endMinutes: number) => void;
}) {
  return render(
    <EntryRenderer
      entry={entry}
      style={{ top: '100px', height: '60px' }}
      hourHeight={60}
      enableCrossDayDrag={false}
      dayIndex={0}
      isDragging={false}
      isResizing={false}
      entryDragging={false}
      entryResizing={false}
      interactionState={{ mode: 'idle' }}
      globalDraggedEntryId={null}
      isSourceColumnMovingAway={false}
      onPointerDown={vi.fn()}
      onTouchStart={vi.fn()}
      onResizeStart={vi.fn()}
      onGapClick={onGapClick}
      entries={entries}
    />,
  );
}

describe('EntryRenderer', () => {
  it('リサイズ中はplanned layerとresize frameをpreview高さへ追従させる', () => {
    const { container } = renderEntryRenderer();

    expect(container.querySelector<HTMLElement>('[data-entry-planned-layer]')).toHaveStyle({
      height: '120px',
    });
    expect(container.querySelector<HTMLElement>('[data-entry-resize-frame]')).toHaveStyle({
      height: '120px',
    });
  });

  it('planned のリサイズ preview は actual を固定して超過量を再計算する', () => {
    const overtimeEntry: CalendarEvent = {
      ...baseEntry,
      actualEndDate: new Date('2026-01-15T11:10:00.000Z'),
    };
    const previewState: InteractionState = {
      ...resizingState,
      snappedHeight: 65,
      previewTime: {
        start: new Date('2026-01-15T10:00:00.000Z'),
        end: new Date('2026-01-15T11:05:00.000Z'),
      },
    };
    const previewEntry = buildResizePreviewEntry(overtimeEntry, previewState);

    expect(previewEntry.endDate?.toISOString()).toBe('2026-01-15T11:05:00.000Z');
    expect(previewEntry.actualEndDate?.toISOString()).toBe('2026-01-15T11:10:00.000Z');

    const { container } = render(
      <EntryRenderer
        entry={overtimeEntry}
        style={{ top: '100px', height: '70px' }}
        hourHeight={60}
        enableCrossDayDrag={false}
        dayIndex={0}
        isDragging={false}
        isResizing={true}
        entryDragging={false}
        entryResizing={true}
        interactionState={previewState}
        globalDraggedEntryId={null}
        isSourceColumnMovingAway={false}
        onPointerDown={vi.fn()}
        onTouchStart={vi.fn()}
        onResizeStart={vi.fn()}
        entries={[overtimeEntry]}
      />,
    );

    expect(
      container.querySelector<HTMLElement>('[data-entry-overtime-accent]')?.parentElement,
    ).toHaveStyle({ height: '5px' });
  });

  it('actual が無い planned entry は予定レイヤーだけをグリッド高さに揃える', () => {
    const { container } = renderPlanOnlyEntryRenderer();

    expect(container.querySelector<HTMLElement>('[data-entry-wrapper="true"]')).toHaveStyle({
      top: '100px',
      height: '60px',
    });
    expect(container.querySelector<HTMLElement>('[data-entry-card]')).toHaveStyle({
      top: '0px',
      height: '60px',
    });
    expect(container.querySelector<HTMLElement>('[data-entry-planned-layer]')).toHaveStyle({
      top: '0px',
      height: '60px',
    });
    expect(container.querySelector('[data-entry-actual-layer]')).toBeNull();
  });

  it('planned の前半 gap が既存の予定外記録で埋まっている場合は作成導線を隠す', () => {
    const plannedEntry: CalendarEvent = {
      ...baseEntry,
      startDate: new Date(2026, 0, 15, 10, 0),
      endDate: new Date(2026, 0, 15, 11, 0),
      actualStartDate: new Date(2026, 0, 15, 10, 30),
      actualEndDate: new Date(2026, 0, 15, 11, 0),
      displayStartDate: new Date(2026, 0, 15, 10, 0),
      displayEndDate: new Date(2026, 0, 15, 11, 0),
    };
    const gapRecord: CalendarEvent = {
      ...baseEntry,
      id: 'gap-record',
      origin: 'unplanned',
      startDate: new Date(2026, 0, 15, 10, 0),
      endDate: new Date(2026, 0, 15, 10, 30),
      actualStartDate: new Date(2026, 0, 15, 10, 0),
      actualEndDate: new Date(2026, 0, 15, 10, 30),
      displayStartDate: new Date(2026, 0, 15, 10, 0),
      displayEndDate: new Date(2026, 0, 15, 10, 30),
      duration: 30,
    };
    const onGapClick = vi.fn();

    const { container } = renderEntryRendererWith({
      entry: plannedEntry,
      entries: [plannedEntry, gapRecord],
      onGapClick,
    });

    const topGap = container.querySelector<HTMLElement>('[data-entry-gap="top"]');

    expect(topGap).toHaveAttribute('aria-hidden', 'true');
    expect(topGap).not.toHaveAttribute('role');
    expect(container.querySelector('[data-entry-gap-action]')).not.toBeInTheDocument();
  });
});
