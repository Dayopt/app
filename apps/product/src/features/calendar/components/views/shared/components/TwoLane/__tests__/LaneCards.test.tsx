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
  planId: 'plan-1',
  startDate,
  endDate,
  displayStartDate: startDate,
  displayEndDate: endDate,
  duration: 60,
  fulfillmentScore: null,
};

describe('TwoLane cards', () => {
  it('Planカードはtitleではなくタグ名を表示する', () => {
    render(<PlanLaneCard event={plan} position={position} tagName="Deep Work" />);

    expect(screen.getByRole('button', { name: 'Deep Work' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy plan title')).not.toBeInTheDocument();
  });

  it('PlanカードはtagIconを表示する', () => {
    const { container } = render(
      <PlanLaneCard event={plan} position={position} tagName="Deep Work" tagIcon="briefcase" />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('Recordカードはtitleではなくタグ名を表示する', () => {
    render(<RecordLaneCard event={record} position={position} tagName="Deep Work" />);

    expect(screen.getByRole('button', { name: 'Deep Work' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy record title')).not.toBeInTheDocument();
  });

  it('RecordカードはtagIconを表示する', () => {
    const { container } = render(
      <RecordLaneCard event={record} position={position} tagName="Deep Work" tagIcon="briefcase" />,
    );

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('タグを解決できない場合もtitleへフォールバックしない', () => {
    render(<PlanLaneCard event={plan} position={position} tagName={null} />);

    expect(screen.getByRole('button', { name: 'common.tags.noTag' })).toBeInTheDocument();
    expect(screen.queryByText('Legacy plan title')).not.toBeInTheDocument();
  });
});
