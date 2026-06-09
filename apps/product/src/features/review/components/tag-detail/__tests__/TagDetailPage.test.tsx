import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagDetailPage } from '../TagDetailPage';

const mocks = vi.hoisted(() => ({
  useTagDashboardData: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../../hooks/useTagDetailData', () => ({
  useTagDashboardData: mocks.useTagDashboardData,
}));

// 見出しのタグ切替（TagQuickSelector / useCreateTag / useRouter 依存）は別関心。
// ここでは TagDetailPage のセクション表示が主眼なので見出しを簡易モックする。
vi.mock('../TagDetailTitle', () => ({
  TagDetailTitle: ({ tagName }: { tagName: string }) => <h1>{tagName}</h1>,
}));

vi.mock('../../../stores/useReviewFilterStore', () => ({
  useReviewFilterStore: (selector: (state: unknown) => unknown) =>
    selector({
      setGranularity: vi.fn(),
      setCurrentDate: vi.fn(),
    }),
}));

const DASHBOARD_DATA = {
  tag: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Work',
    color: 'blue',
    icon: 'briefcase',
  },
  summary: {
    totalMinutes: 90,
    plannedMinutes: 60,
    actualMinutes: 90,
    diffMinutes: 30,
    entryCount: 1,
  },
  dailyRows: [
    {
      date: '2026-05-01',
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
    },
  ],
  entries: [
    {
      entryId: 'entry-1',
      date: '2026-05-01',
      title: 'Deep work',
      description: 'memo',
      startTime: '2026-05-01T00:00:00.000Z',
      endTime: '2026-05-01T01:00:00.000Z',
      actualStartTime: '2026-05-01T00:00:00.000Z',
      actualEndTime: '2026-05-01T01:30:00.000Z',
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
      tag: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Work',
        color: 'blue',
        icon: 'briefcase',
      },
    },
  ],
};

describe('TagDetailPage', () => {
  it('ダッシュボードの主要セクションを表示する', () => {
    mocks.useTagDashboardData.mockReturnValue({
      data: DASHBOARD_DATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <TagDetailPage
        tagId="11111111-1111-1111-1111-111111111111"
        initialGranularity="week"
        initialDateStr="2026-05-01"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByText('dailyActual')).toBeInTheDocument();
    expect(screen.getByText('planActual')).toBeInTheDocument();
    expect(screen.getByText('entryList')).toBeInTheDocument();
    expect(screen.getByText('Deep work')).toBeInTheDocument();
    expect(screen.getAllByText('memo')).toHaveLength(2);
  });

  it('空データでは空状態を表示する', () => {
    mocks.useTagDashboardData.mockReturnValue({
      data: { ...DASHBOARD_DATA, dailyRows: [], entries: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <TagDetailPage
        tagId="11111111-1111-1111-1111-111111111111"
        initialGranularity="week"
        initialDateStr="2026-05-01"
      />,
    );

    expect(screen.getByText('noData')).toBeInTheDocument();
  });

  it('読み込み中はスケルトンを表示する', () => {
    mocks.useTagDashboardData.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = render(
      <TagDetailPage
        tagId="11111111-1111-1111-1111-111111111111"
        initialGranularity="week"
        initialDateStr="2026-05-01"
      />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });
});
