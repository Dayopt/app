import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  TimeblockRelationshipSection,
  type TimeblockRelationshipItem,
} from './TimeblockRelationshipSection';

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>): string => {
      const translations: Record<string, string> = {
        relatedRecords: 'Related records',
        originalPlan: 'Original plan',
        originalPlanUnavailable: 'Original plan is unavailable',
        loadFailed: 'Could not load relationships',
      };
      if (key === 'recordSummary') {
        return `${String(values?.count)} records · ${String(values?.duration)} total`;
      }
      if (key === 'openRecord') {
        return `Open record: ${String(values?.tag)}, ${String(values?.dateTime)}`;
      }
      if (key === 'openPlan') {
        return `Open original plan: ${String(values?.tag)}, ${String(values?.dateTime)}`;
      }
      return translations[key] ?? key;
    },
}));

vi.mock('@/features/tags', () => ({
  TagIcon: () => <span aria-hidden="true" />,
}));

vi.mock('@/lib/date', () => ({
  isSameDay: (start: Date, end: Date) =>
    start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10),
}));

vi.mock('@/lib/hooks/useDateFormat', () => ({
  useDateFormat: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
  }),
}));

const records: TimeblockRelationshipItem[] = [
  {
    id: 'record-1',
    tagName: 'API development',
    tagColor: 'blue',
    tagIcon: null,
    startAt: new Date('2026-07-14T09:05:00.000Z'),
    endAt: new Date('2026-07-14T09:35:00.000Z'),
  },
  {
    id: 'record-2',
    tagName: 'Review',
    tagColor: 'green',
    tagIcon: 'search',
    startAt: new Date('2026-07-14T10:10:00.000Z'),
    endAt: new Date('2026-07-14T10:55:00.000Z'),
  },
];

describe('TimeblockRelationshipSection', () => {
  it('Planに関連するRecordを件数・合計時間とともに表示して開く', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <TimeblockRelationshipSection
        kind="plan"
        status="success"
        records={records}
        onOpen={onOpen}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Related records' })).toBeInTheDocument();
    expect(screen.getByText('2 records · 1h 15m total')).toBeInTheDocument();
    expect(screen.getByText('2026-07-14 · 09:05–09:35')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('45m')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Open record: API development, 2026-07-14 · 09:05–09:35',
      }),
    );
    expect(onOpen).toHaveBeenCalledWith('record-1', 'record');
  });

  it('Recordから元のPlanを人間向け情報で表示して開く', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <TimeblockRelationshipSection
        kind="record"
        status="success"
        plan={{ ...records[0]!, id: 'plan-1' }}
        onOpen={onOpen}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Original plan' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Open original plan: API development, 2026-07-14 · 09:05–09:35',
      }),
    );
    expect(onOpen).toHaveBeenCalledWith('plan-1', 'plan');
  });

  it('日をまたぐ関係先では終了日も表示する', () => {
    render(
      <TimeblockRelationshipSection
        kind="record"
        status="success"
        plan={{
          ...records[0]!,
          id: 'plan-cross-day',
          startAt: new Date('2026-07-14T23:30:00.000Z'),
          endAt: new Date('2026-07-15T01:00:00.000Z'),
        }}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('2026-07-14 23:30–2026-07-15 01:00')).toBeInTheDocument();
  });

  it('関連Recordが0件なら関係セクションを表示しない', () => {
    render(
      <TimeblockRelationshipSection
        kind="plan"
        status="success"
        records={[]}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('元のPlanが取得できない場合はIDを露出せず中立状態を表示する', () => {
    render(
      <TimeblockRelationshipSection
        kind="record"
        status="unavailable"
        plan={null}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Original plan is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('関係の取得失敗だけを再試行できる', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <TimeblockRelationshipSection
        kind="plan"
        status="error"
        records={[]}
        onOpen={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load relationships');
    await user.click(screen.getByRole('button', { name: 'error.boundary.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
