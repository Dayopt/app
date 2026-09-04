import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const treeState = vi.hoisted(() => ({
  current: {
    data: {
      categories: [
        { category: { id: 'cat-work', name: '仕事', color: 'blue', icon: 'briefcase' } },
        { category: { id: 'cat-sleep', name: '睡眠', color: 'indigo', icon: 'moon' } },
      ],
      uncategorized: [],
    } as unknown,
    isPending: false,
  },
}));

const segmentsState = vi.hoisted(() => ({
  current: {
    data: [{ id: 'seg-1', name: '深い仕事', activityIds: ['act-dev'] }] as unknown,
    isPending: false,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../hooks/useSegments', () => ({
  useSegments: () => segmentsState.current,
}));

vi.mock('@/features/activities', () => ({
  useActivityTree: () => treeState.current,
  ActivityIcon: () => <span data-testid="activity-icon" />,
}));

const isTouch = vi.hoisted(() => ({ current: false }));

vi.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: () => isTouch.current,
}));

vi.mock('@/components/shell/sidebar', () => ({
  SidebarSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

import { useReportViewStore } from '../../stores/useReportViewStore';
import { ReportFilterList } from './ReportFilterList';

function resetStore() {
  useReportViewStore.setState({
    hiddenCategoryIds: [],
    uncategorizedHidden: false,
    marginHidden: false,
    segmentId: null,
  });
}

describe('ReportFilterList', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    isTouch.current = false;
    segmentsState.current = {
      data: [{ id: 'seg-1', name: '深い仕事', activityIds: ['act-dev'] }],
      isPending: false,
    };
    treeState.current = {
      data: {
        categories: [
          { category: { id: 'cat-work', name: '仕事', color: 'blue', icon: 'briefcase' } },
          { category: { id: 'cat-sleep', name: '睡眠', color: 'indigo', icon: 'moon' } },
        ],
        uncategorized: [],
      },
      isPending: false,
    };
  });

  it('カテゴリー・未分類・余白を並べ、アクティビティは並べない', () => {
    render(<ReportFilterList />);

    expect(screen.getByRole('checkbox', { name: /仕事/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /睡眠/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /uncategorized/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /margin/ })).toBeInTheDocument();

    // 葉（アクティビティ）はレポートの分母の単位ではないので出さない
    expect(screen.queryByText('実装')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('label が checkbox に紐付いている', () => {
    render(<ReportFilterList />);

    // htmlFor / id で結ばれていないと getByLabelText は見つけられない
    expect(screen.getByLabelText('仕事')).toHaveAttribute('role', 'checkbox');
  });

  it('カテゴリーのトグルが store の hiddenCategoryIds を書き換える', async () => {
    const user = userEvent.setup();
    render(<ReportFilterList />);

    await user.click(screen.getByRole('checkbox', { name: /睡眠/ }));
    expect(useReportViewStore.getState().hiddenCategoryIds).toEqual(['cat-sleep']);

    await user.click(screen.getByRole('checkbox', { name: /睡眠/ }));
    expect(useReportViewStore.getState().hiddenCategoryIds).toEqual([]);
  });

  it('未分類と余白のトグルがそれぞれの state を書き換える', async () => {
    const user = userEvent.setup();
    render(<ReportFilterList />);

    await user.click(screen.getByRole('checkbox', { name: /uncategorized/ }));
    expect(useReportViewStore.getState().uncategorizedHidden).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: /margin/ }));
    expect(useReportViewStore.getState().marginHidden).toBe(true);
  });

  it('レンズ選択中は余白行を無効化し、理由を読み上げに載せる', () => {
    useReportViewStore.setState({ segmentId: 'seg-1' });
    render(<ReportFilterList />);

    const margin = screen.getByRole('checkbox', { name: /margin/ });
    expect(margin).toBeDisabled();
    expect(margin).toHaveAccessibleDescription('marginLensDisabled');

    // カテゴリー側は無効化しない（レンズはフィルタと交差する）
    expect(screen.getByRole('checkbox', { name: /仕事/ })).not.toBeDisabled();
  });

  /**
   * 別タブでセグメントを消しても `segmentId` は localStorage に残る。生の
   * `segmentId` で無効化を決めると、画面のどこにもレンズが無いのに余白行だけが
   * 押せないまま固定され、戻す手がかりが無くなる。
   */
  it('削除済みセグメントを指していたら余白行を無効化しない', () => {
    useReportViewStore.setState({ segmentId: 'seg-deleted' });
    render(<ReportFilterList />);

    expect(screen.getByRole('checkbox', { name: /margin/ })).not.toBeDisabled();
  });

  /**
   * `listTree` が先に解決した窓で余白を押せると、`marginHidden` だけが永続化されて
   * レンズ確定後は無視される。後日「すべて」へ戻した時に理由の分からない状態が残る。
   */
  it('レンズの解決を待つ間も余白行を無効化する', () => {
    useReportViewStore.setState({ segmentId: 'seg-1' });
    segmentsState.current = { data: undefined, isPending: true };
    render(<ReportFilterList />);

    expect(screen.getByRole('checkbox', { name: /margin/ })).toBeDisabled();
  });

  it('レンズ未選択なら listSegments を待たずに余白を押せる', () => {
    segmentsState.current = { data: undefined, isPending: true };
    render(<ReportFilterList />);

    expect(screen.getByRole('checkbox', { name: /margin/ })).not.toBeDisabled();
  });

  /**
   * 幅 < 768px では `mobile-layout` が Sidebar ごと描かないので、`useIsMobile()` では
   * この分岐に到達できない。実際にタッチで触られるのは iPad 縦のような
   * 「幅は広いが coarse pointer」の面。
   */
  it('タッチ面では行を 44px にする', () => {
    isTouch.current = true;
    render(<ReportFilterList />);

    expect(screen.getByText('仕事').closest('label')).toHaveClass('min-h-11');
  });

  it('マウス面では行を詰める', () => {
    render(<ReportFilterList />);

    expect(screen.getByText('仕事').closest('label')).toHaveClass('min-h-8');
  });

  it('store が知らないカテゴリーは既定で可視（checked）', () => {
    useReportViewStore.setState({ hiddenCategoryIds: ['cat-sleep'] });
    render(<ReportFilterList />);

    expect(screen.getByRole('checkbox', { name: /仕事/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /睡眠/ })).not.toBeChecked();
  });

  it('読み込み中は骨組みを出す', () => {
    treeState.current = { data: undefined, isPending: true };
    render(<ReportFilterList />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
