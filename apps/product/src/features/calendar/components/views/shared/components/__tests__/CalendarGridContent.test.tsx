import type React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '../../../../../types/calendar.types';

vi.mock('@/features/tags', () => ({
  useTagsMap: () => ({ getTagById: () => null }),
}));

vi.mock('@/features/timeblock', () => ({
  TimeblockCard: () => null,
  useTimeblockWriteMutations: () => ({ createRecord: { mutate: vi.fn() } }),
}));

vi.mock('@/lib/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

vi.mock('@/features/calendar/interaction', () => ({
  useInteraction: () => ({
    state: { mode: 'idle' },
    handlers: {
      handlePointerDown: vi.fn(),
      handleTouchStart: vi.fn(),
      handleResizeStart: vi.fn(),
    },
  }),
}));

vi.mock('@/features/calendar/interaction/GhostRenderer', () => ({
  GhostRenderer: () => null,
}));

vi.mock('@/features/calendar/stores/useTagDraftStore', () => ({
  useTagDraftStore: (selector: (state: { draft: null }) => unknown) => selector({ draft: null }),
}));

vi.mock('@/features/calendar/components/views/shared/hooks/useResponsiveHourHeight', () => ({
  useResponsiveHourHeight: () => 60,
}));

vi.mock('../CalendarDragSelection', () => ({
  CalendarDragSelection: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../DraftTimeblock', () => ({ DraftTimeblock: () => null }));
vi.mock('../InlineTagPalette', () => ({ InlineTagPalette: () => null }));

vi.mock('../TwoLaneTimeblockRenderer', () => ({
  TwoLaneTimeblockRenderer: ({
    entry,
    showDayDiffMarker,
  }: {
    entry: CalendarEvent;
    showDayDiffMarker?: boolean;
  }) => (
    <div
      data-testid={`two-lane-${entry.id}`}
      data-day-diff-marker={showDayDiffMarker ? 'true' : 'false'}
    />
  ),
}));

import { buildDragPreviewEntry, CalendarGridContent } from '../CalendarGridContent';

describe('CalendarGridContent', () => {
  it('drag preview は planned と actual のズレを保って表示用 entry を作る', () => {
    const entry = {
      id: 'entry-1',
      title: 'dev',
      startDate: new Date('2026-06-04T13:00:00.000Z'),
      endDate: new Date('2026-06-04T15:00:00.000Z'),
      displayStartDate: new Date('2026-06-04T13:00:00.000Z'),
      displayEndDate: new Date('2026-06-04T15:00:00.000Z'),
      plannedStartDate: new Date('2026-06-04T13:00:00.000Z'),
      plannedEndDate: new Date('2026-06-04T15:00:00.000Z'),
      actualStartDate: new Date('2026-06-04T13:30:00.000Z'),
      actualEndDate: new Date('2026-06-04T16:45:00.000Z'),
      status: 'open' as const,
      color: 'blue',
      tagId: 'tag-1',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      duration: 120,
      isMultiDay: false,
      origin: 'planned' as const,
      timeblockState: 'upcoming' as const,
    };

    const previewEntry = buildDragPreviewEntry(entry, {
      start: new Date('2026-06-04T15:00:00.000Z'),
      end: new Date('2026-06-04T17:00:00.000Z'),
    });

    expect(previewEntry.startDate?.toISOString()).toBe('2026-06-04T15:00:00.000Z');
    expect(previewEntry.endDate?.toISOString()).toBe('2026-06-04T17:00:00.000Z');
    expect(previewEntry.plannedStartDate?.toISOString()).toBe('2026-06-04T15:00:00.000Z');
    expect(previewEntry.plannedEndDate?.toISOString()).toBe('2026-06-04T17:00:00.000Z');
    expect(previewEntry.actualStartDate?.toISOString()).toBe('2026-06-04T15:30:00.000Z');
    expect(previewEntry.actualEndDate?.toISOString()).toBe('2026-06-04T18:45:00.000Z');
  });

  it('通常TwoLaneカードへCompare対象のmarker状態を渡す', () => {
    const first = {
      id: 'entry-1',
      title: 'dev',
      startDate: new Date('2026-06-04T09:00:00.000Z'),
      endDate: new Date('2026-06-04T10:00:00.000Z'),
      displayStartDate: new Date('2026-06-04T09:00:00.000Z'),
      displayEndDate: new Date('2026-06-04T10:00:00.000Z'),
      status: 'open' as const,
      color: 'blue',
      tagId: 'tag-1',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      duration: 60,
      isMultiDay: false,
      origin: 'planned' as const,
      timeblockState: 'upcoming' as const,
      kind: 'plan' as const,
    } satisfies CalendarEvent;
    const second = {
      ...first,
      id: 'entry-2',
      startDate: new Date('2026-06-04T10:00:00.000Z'),
      endDate: new Date('2026-06-04T11:00:00.000Z'),
      displayStartDate: new Date('2026-06-04T10:00:00.000Z'),
      displayEndDate: new Date('2026-06-04T11:00:00.000Z'),
    } satisfies CalendarEvent;

    render(
      <CalendarGridContent
        date={new Date('2026-06-04T00:00:00.000Z')}
        entries={[first, second]}
        dayIndex={0}
        dayDiffEntryIds={new Set([first.id])}
      />,
    );

    expect(screen.getByTestId('two-lane-entry-1')).toHaveAttribute('data-day-diff-marker', 'true');
    expect(screen.getByTestId('two-lane-entry-2')).toHaveAttribute('data-day-diff-marker', 'false');
  });
});
