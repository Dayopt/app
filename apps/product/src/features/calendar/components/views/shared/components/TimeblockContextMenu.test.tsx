import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarDisplayEvent } from '../../../../types/calendar.types';
import { EventContextMenu } from './TimeblockContextMenu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const migratedRecord: CalendarDisplayEvent = {
  id: 'record-1',
  kind: 'record',
  title: '移行済み実績',
  status: 'closed',
  color: 'var(--primary)',
  startDate: new Date('2026-07-28T01:00:00.000Z'),
  endDate: new Date('2026-07-28T02:00:00.000Z'),
  createdAt: new Date('2026-07-28T01:00:00.000Z'),
  updatedAt: new Date('2026-07-28T03:00:00.000Z'),
  version: '2026-07-28T03:00:00.000001+00:00',
  displayStartDate: new Date('2026-07-28T01:00:00.000Z'),
  displayEndDate: new Date('2026-07-28T02:00:00.000Z'),
  duration: 60,
  isMultiDay: false,
  origin: 'unplanned',
  recordSource: 'auto_migrated',
};

describe('EventContextMenu', () => {
  it('auto_migrated Recordには削除操作を表示しない', () => {
    render(
      <EventContextMenu
        entry={migratedRecord}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('common.actions.copy')).toBeInTheDocument();
    expect(screen.queryByText('common.actions.delete')).not.toBeInTheDocument();
  });

  // useCalendarData は plan 紐付きの Record にも origin: 'planned' を付けるため、
  // entry.origin をそのまま渡すと Record に skip が出て、handler 側の早期 return で
  // 無反応になる。skip は kind === 'plan' の時だけ出す。
  it('plan に紐付いた Record にも skip を表示しない', () => {
    const linkedRecord: CalendarDisplayEvent = {
      ...migratedRecord,
      id: 'record-2',
      origin: 'planned',
      recordSource: 'from_plan',
      planId: 'plan-1',
    };

    render(
      <EventContextMenu
        entry={linkedRecord}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText('common.actions.copy')).toBeInTheDocument();
    expect(screen.queryByText('timeblock.inspector.skip')).not.toBeInTheDocument();
  });

  it('Plan には skip を表示する', () => {
    const plan: CalendarDisplayEvent = {
      ...migratedRecord,
      id: 'plan-1',
      kind: 'plan',
      origin: 'planned',
      recordSource: undefined,
    };

    render(
      <EventContextMenu
        entry={plan}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText('timeblock.inspector.skip')).toBeInTheDocument();
  });
});
