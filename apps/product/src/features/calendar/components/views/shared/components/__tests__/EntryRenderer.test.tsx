import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { InteractionState } from '../../../../../domain/interaction/types';
import type { CalendarEvent } from '../../../../../types/calendar.types';

import { EntryRenderer } from '../EntryRenderer';

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
});
