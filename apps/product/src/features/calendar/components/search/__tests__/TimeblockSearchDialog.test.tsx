import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Command, CommandList } from '@dayopt/components';

import type { TimeblockSearchResult } from '../../../lib/timeblock-search-results';
import { TimeblockSearchContent, TimeblockSearchDialog } from '../TimeblockSearchDialog';

const mockPlansUseQuery = vi.fn();
const mockRecordsUseQuery = vi.fn();
const mockPlanRefetch = vi.fn();
const mockRecordRefetch = vi.fn();
const mockTagsRefetch = vi.fn();

const PLAN_ROW = {
  id: 'plan-1',
  title: 'Legacy deep work title',
  note: 'Outline the product iteration',
  tag_id: 'tag-work',
  start_at: '2026-07-15T00:00:00.000Z',
  end_at: '2026-07-15T01:00:00.000Z',
  skipped_at: null,
};

function successfulQuery(data: unknown[]) {
  return {
    data,
    error: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: data === MOCK_PLAN_ROWS ? mockPlanRefetch : mockRecordRefetch,
  };
}

const MOCK_PLAN_ROWS = [PLAN_ROW];

vi.mock('@/features/tags', () => ({
  TagIcon: () => <span data-testid="tag-icon" />,
  useTags: () => ({
    data: [
      {
        id: 'tag-work',
        name: 'Work',
        color: 'blue',
        icon: 'briefcase',
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockTagsRefetch,
  }),
}));

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (
    selector: (preferences: { timezone: string; timeFormat: '24h' }) => unknown,
  ) => selector({ timezone: 'Asia/Tokyo', timeFormat: '24h' }),
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    plans: { list: { useQuery: (...args: unknown[]) => mockPlansUseQuery(...args) } },
    records: { list: { useQuery: (...args: unknown[]) => mockRecordsUseQuery(...args) } },
  },
}));

function renderDialog(overrides: Partial<React.ComponentProps<typeof TimeblockSearchDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onOpenResult: vi.fn(),
    ...overrides,
  };
  render(<TimeblockSearchDialog {...props} />);
  return props;
}

describe('TimeblockSearchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPlansUseQuery.mockImplementation(() => successfulQuery(MOCK_PLAN_ROWS));
    mockRecordsUseQuery.mockImplementation(() => successfulQuery([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('空の検索語ではqueryを無効にし、300ms後に検索条件を渡す', async () => {
    renderDialog();

    expect(screen.getByRole('dialog').querySelector('[data-sentry-block]')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    expect(mockPlansUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '' }),
      expect.objectContaining({ enabled: false, meta: { persist: false } }),
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: ' work ' } });
    expect(mockPlansUseQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mockPlansUseQuery).toHaveBeenLastCalledWith(
      {
        search: 'work',
        sortBy: 'start_at',
        sortOrder: 'desc',
        limit: 21,
      },
      expect.objectContaining({ enabled: true, gcTime: 0, meta: { persist: false } }),
    );
    expect(mockRecordsUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'work' }),
      expect.objectContaining({ enabled: true, gcTime: 0, meta: { persist: false } }),
    );
  });

  it('結果を選ぶとopen callbackを呼び、検索語をリセットして閉じる', async () => {
    const props = renderDialog();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'work' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText('Legacy deep work title')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Work'));

    expect(props.onOpenResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-1', kind: 'plan' }),
    );
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('閉じる操作で検索語をリセットする', () => {
    const props = renderDialog();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'work' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('controlled openが外部からfalseになった場合も検索語を破棄する', async () => {
    const props = {
      onOpenChange: vi.fn(),
      onOpenResult: vi.fn(),
    };
    const { rerender } = render(<TimeblockSearchDialog open {...props} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'work' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    rerender(<TimeblockSearchDialog open={false} {...props} />);
    rerender(<TimeblockSearchDialog open {...props} />);

    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(mockPlansUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '' }),
      expect.objectContaining({ enabled: false }),
    );
  });
});

describe('TimeblockSearchContent', () => {
  const result: TimeblockSearchResult = {
    kind: 'record',
    id: 'record-1',
    note: 'Calendar search states',
    tagId: 'tag-work',
    startAt: '2026-07-14T01:30:00.000Z',
    endAt: '2026-07-14T02:30:00.000Z',
    isSkipped: false,
  };

  function renderContent(
    overrides: Partial<React.ComponentProps<typeof TimeblockSearchContent>> = {},
  ) {
    const props = {
      query: 'work',
      results: [result],
      tagsById: new Map([
        ['tag-work', { id: 'tag-work', name: 'Work', color: 'blue', icon: 'briefcase' }],
      ]),
      isLoading: false,
      isError: false,
      hasMore: false,
      locale: 'en',
      timezone: 'Asia/Tokyo',
      timeFormat: '24h' as const,
      onOpenResult: vi.fn(),
      onRetry: vi.fn(),
      ...overrides,
    };

    const hasResultList =
      props.query.trim().length > 0 &&
      !props.isLoading &&
      !props.isError &&
      props.results.length > 0;
    render(
      <Command>
        {hasResultList ? (
          <CommandList>
            <TimeblockSearchContent {...props} />
          </CommandList>
        ) : (
          <div>
            <TimeblockSearchContent {...props} />
          </div>
        )}
      </Command>,
    );
    return props;
  }

  it('kind・タグ・ノート・日時を表示し、IDは表示しない', () => {
    renderContent();

    expect(screen.getByText('calendar.search.kind.record')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Calendar search states')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.queryByText('record-1')).not.toBeInTheDocument();
  });

  it('タグを解決できない結果はタグなしを表示名にする', () => {
    renderContent({
      results: [{ ...result, tagId: null }],
      tagsById: new Map(),
    });

    expect(screen.getByText('common.tags.noTag')).toBeInTheDocument();
  });

  it('エラー時に再試行できる', () => {
    const props = renderContent({ results: [], isError: true });

    fireEvent.click(screen.getByRole('button', { name: 'calendar.search.retry' }));

    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar search states')).not.toBeInTheDocument();
  });

  it('検索中を表示する', () => {
    renderContent({ results: [], isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('calendar.search.loading');
  });

  it('該当なしを表示する', () => {
    renderContent({ results: [] });
    expect(screen.getByRole('status')).toHaveTextContent('calendar.search.empty');
  });

  it('20件を超える場合の絞り込み案内を表示する', () => {
    renderContent({ hasMore: true });

    expect(screen.getByRole('note')).toHaveTextContent('calendar.search.overflow');
  });
});
