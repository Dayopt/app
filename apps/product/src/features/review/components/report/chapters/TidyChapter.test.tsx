import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const base = namespace ? `${namespace}.${key}` : key;
      return values ? `${base} ${Object.values(values).join(' ')}` : base;
    };
    translate.raw = () => [];
    return translate;
  },
}));

import { TidyChapter } from './TidyChapter';

function renderChapter(overrides: Partial<Parameters<typeof TidyChapter>[0]> = {}) {
  const handlers = {
    onSortUncategorized: vi.fn(),
    onReviewExternalEvents: vi.fn(),
    onOpenNextPeriod: vi.fn(),
  };

  render(
    <TidyChapter
      granularity="week"
      nextPeriodPlannedMinutes={1260}
      uncategorizedRecordCount={7}
      unconvertedExternalEventCount={3}
      {...handlers}
      {...overrides}
    />,
  );

  return handlers;
}

describe('TidyChapter', () => {
  it('件数のある行にはボタン、0 件の行には「なし」を出す', () => {
    renderChapter({ unconvertedExternalEventCount: 0 });

    expect(
      screen.getByRole('button', { name: 'report.tidy.uncategorized.action' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'report.tidy.externalEvents.action' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('report.tidy.none')).toBeInTheDocument();
  });

  it('仕分ける・確認する・カレンダーで組むがそれぞれのジャンプを呼ぶ', async () => {
    const user = userEvent.setup();
    const handlers = renderChapter();

    await user.click(screen.getByRole('button', { name: 'report.tidy.uncategorized.action' }));
    await user.click(screen.getByRole('button', { name: 'report.tidy.externalEvents.action' }));
    await user.click(screen.getByRole('button', { name: 'report.tidy.nextPeriod.action' }));

    expect(handlers.onSortUncategorized).toHaveBeenCalledTimes(1);
    expect(handlers.onReviewExternalEvents).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenNextPeriod).toHaveBeenCalledTimes(1);
  });

  it('次期間の予定が 0 なら「まだありません」を出す', () => {
    renderChapter({ nextPeriodPlannedMinutes: 0 });

    expect(screen.getByText('report.tidy.nextPeriod.empty.week')).toBeInTheDocument();
  });

  it('粒度に応じて次期間の文言が変わる', () => {
    renderChapter({ granularity: 'year', nextPeriodPlannedMinutes: 26400 });

    expect(screen.getByText('report.tidy.nextPeriod.planned.year 440:00')).toBeInTheDocument();
  });

  /** 未分類も外部予定も 0 のユーザー（新規・未接続）でも落ちない。 */
  it('すべて 0 でもエラーにならない', () => {
    renderChapter({
      uncategorizedRecordCount: 0,
      unconvertedExternalEventCount: 0,
      nextPeriodPlannedMinutes: 0,
    });

    expect(screen.getAllByText('report.tidy.none')).toHaveLength(2);
  });
});
