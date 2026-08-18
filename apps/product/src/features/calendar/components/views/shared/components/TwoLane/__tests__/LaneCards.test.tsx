import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PlanEvent, RecordEvent } from '@/features/timeblock';

import type { TwoLanePosition } from '../../../../../../lib/two-lane-layout';

import { PlanLaneCard } from '../PlanLaneCard';
import { RecordLaneCard } from '../RecordLaneCard';

const position: TwoLanePosition = { top: 0, left: 0, width: 50, height: 60 };
const startDate = new Date('2026-07-14T09:00:00.000Z');
const endDate = new Date('2026-07-14T10:00:00.000Z');

const plan: PlanEvent = {
  id: 'plan-1',
  title: 'Legacy plan title',
  note: null,
  tagId: 'tag-1',
  activityId: null,
  startDate,
  endDate,
  displayStartDate: startDate,
  displayEndDate: endDate,
  duration: 60,
  status: 'upcoming',
};

const record: RecordEvent = {
  id: 'record-1',
  title: 'Legacy record title',
  note: null,
  tagId: 'tag-1',
  activityId: null,
  planId: 'plan-1',
  startDate,
  endDate,
  displayStartDate: startDate,
  displayEndDate: endDate,
  duration: 60,
};

describe('TwoLane cards', () => {
  it('Planカードはtitleではなくタグ名を表示する', () => {
    render(<PlanLaneCard event={plan} position={position} activityName="Deep Work" />);

    expect(screen.getByRole('button', { name: 'Deep Work' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy plan title')).not.toBeInTheDocument();
  });

  it('PlanカードはtagIconを表示する', () => {
    const { container } = render(
      <PlanLaneCard
        event={plan}
        position={position}
        activityName="Deep Work"
        activityIcon="briefcase"
      />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('Recordカードはtitleではなくタグ名を表示する', () => {
    render(<RecordLaneCard event={record} position={position} activityName="Deep Work" />);

    expect(screen.getByRole('button', { name: 'Deep Work' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy record title')).not.toBeInTheDocument();
  });

  it('RecordカードはtagIconを表示する', () => {
    const { container } = render(
      <RecordLaneCard
        event={record}
        position={position}
        activityName="Deep Work"
        activityIcon="briefcase"
      />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('アクティビティを解決できない場合もtitleへフォールバックしない', () => {
    render(<PlanLaneCard event={plan} position={position} activityName={null} />);

    expect(screen.getByRole('button', { name: 'calendar.filter.noActivity' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy plan title')).not.toBeInTheDocument();
  });

  it('drag ghostは操作・focus対象にしない', () => {
    const { container } = render(
      <div>
        <PlanLaneCard
          event={plan}
          position={position}
          activityName="Deep Work"
          interactive={false}
        />
        <RecordLaneCard
          event={record}
          position={position}
          activityName="Deep Work"
          interactive={false}
        />
      </div>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const card of container.querySelectorAll(
      '[data-plan-lane-card], [data-record-lane-card]',
    )) {
      expect(card).toHaveClass('pointer-events-none');
      expect(card).not.toHaveAttribute('tabindex');
      expect(card).not.toHaveAttribute('data-entry-block');
      expect(card).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('Compare対象のPlanカードにmarkerを表示する', () => {
    const { container } = render(
      <PlanLaneCard event={plan} position={position} activityName="Deep Work" showDayDiffMarker />,
    );

    expect(container.querySelector('[data-entry-day-diff-marker]')).not.toBeNull();
  });

  it('Compare対象のRecordカードにmarkerを表示する', () => {
    const { container } = render(
      <RecordLaneCard
        event={record}
        position={position}
        activityName="Deep Work"
        showDayDiffMarker
      />,
    );

    expect(container.querySelector('[data-entry-day-diff-marker]')).not.toBeNull();
  });

  it('Compare対象でないカードにはmarkerを表示しない', () => {
    const { container } = render(
      <div>
        <PlanLaneCard event={plan} position={position} activityName="Deep Work" />
        <RecordLaneCard event={record} position={position} activityName="Deep Work" />
      </div>,
    );

    expect(container.querySelector('[data-entry-day-diff-marker]')).toBeNull();
  });

  it('Recordカードは差分0のbadgeを隠し、差分がある場合も中立色で表示する', () => {
    const { container, rerender } = render(
      <RecordLaneCard
        event={{ ...record, diffMinutes: 0 }}
        position={position}
        activityName="Deep Work"
      />,
    );

    expect(container.querySelector('[data-record-diff-badge]')).toBeNull();

    rerender(
      <RecordLaneCard
        event={{ ...record, diffMinutes: 20 }}
        position={position}
        activityName="Deep Work"
      />,
    );

    const badge = container.querySelector('[data-record-diff-badge]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass('text-muted-foreground');
    expect(badge).not.toHaveClass('text-success', 'text-destructive');
  });
});
