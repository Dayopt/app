import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ExternalEventPosition } from '../../../../../../lib/external-event-layout';

import { ExternalEventCard } from '../ExternalEventCard';

const startDate = new Date('2026-07-14T09:00:00.000Z');
const endDate = new Date('2026-07-14T10:00:00.000Z');

const event = {
  id: 'ghost-1',
  title: '週次ミーティング',
  calendarName: 'Work',
  startDate,
  endDate,
};

function position(overrides: Partial<ExternalEventPosition> = {}): ExternalEventPosition {
  return {
    top: 0,
    left: 0,
    width: 38,
    height: 60,
    displayStartDate: startDate,
    displayEndDate: endDate,
    ...overrides,
  };
}

describe('ExternalEventCard', () => {
  it('重複数が多く width が小さくても幅が 0 以下にならない', () => {
    // 4px の固定減算を素直に適用すると width 2% は負値になり、カードが不可視化する。
    render(<ExternalEventCard event={event} position={position({ width: 2 })} />);

    const card = screen.getByText('週次ミーティング').closest('[data-external-event-card]');
    expect(card).not.toBeNull();
    expect(card).toHaveStyle({ minWidth: '4px' });
  });

  it('時刻表示は event の生の開始・終了ではなく position のクリップ済み表示時刻を使う', () => {
    // event 自体は前日 22:00 開始でも、当日カラムでは 00:00 開始として描く。
    const rawStart = new Date('2026-07-13T22:00:00.000Z');
    const clippedStart = new Date(2026, 6, 14, 0, 0);
    const clippedEnd = new Date(2026, 6, 14, 2, 0);

    render(
      <ExternalEventCard
        event={{ ...event, startDate: rawStart }}
        position={position({ displayStartDate: clippedStart, displayEndDate: clippedEnd })}
      />,
    );

    expect(screen.getByText('00:00–02:00', { exact: false })).toBeInTheDocument();
  });
});
