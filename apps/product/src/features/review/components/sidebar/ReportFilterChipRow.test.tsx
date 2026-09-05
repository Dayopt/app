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
    data: [{ id: 'seg-1', name: '深い工作', activityIds: ['act-dev'] }] as unknown,
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
  getCategoryColorClasses: () => ({ cssVar: 'var(--category-blue)' }),
}));

import { useReportViewStore } from '../../stores/useReportViewStore';
import { ReportFilterChipRow } from './ReportFilterChipRow';

function resetStore() {
  useReportViewStore.setState({
    hiddenCategoryIds: [],
    uncategorizedHidden: false,
    marginHidden: false,
    segmentId: null,
  });
}

describe('ReportFilterChipRow', () => {
  beforeEach(() => {
    resetStore();
    segmentsState.current = {
      data: [{ id: 'seg-1', name: '深い工作', activityIds: ['act-dev'] }],
      isPending: false,
    };
  });

  /**
   * サイドバー（`ReportFilterList`）と**同じ store** を読み書きする。器が違うだけで
   * 分母の出し入れは 1 つの真実に集約する（モバイル専用の集計を作らない = 仕様 §13-13）。
   */
  it('カテゴリーのチップがサイドバーと同じ store を書く', async () => {
    const user = userEvent.setup();
    render(<ReportFilterChipRow />);

    const work = screen.getByRole('button', { name: /仕事/ });
    expect(work).toHaveAttribute('aria-pressed', 'true');

    await user.click(work);

    expect(useReportViewStore.getState().hiddenCategoryIds).toEqual(['cat-work']);
    expect(screen.getByRole('button', { name: /仕事/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('未分類と余白のチップも同じ store を書く', async () => {
    const user = userEvent.setup();
    render(<ReportFilterChipRow />);

    await user.click(screen.getByRole('button', { name: /uncategorized/ }));
    await user.click(screen.getByRole('button', { name: /margin/ }));

    expect(useReportViewStore.getState().uncategorizedHidden).toBe(true);
    expect(useReportViewStore.getState().marginHidden).toBe(true);
  });

  it('レンズ中は余白チップを押させない（分母に入らないため）', () => {
    useReportViewStore.setState({ segmentId: 'seg-1' });
    render(<ReportFilterChipRow />);

    expect(screen.getByRole('button', { name: /margin/ })).toBeDisabled();
  });

  it('束の Drawer からレンズを選べる（選ぶだけで CRUD は無い）', async () => {
    const user = userEvent.setup();
    render(<ReportFilterChipRow />);

    await user.click(screen.getByRole('button', { name: 'lens.open' }));
    await user.click(await screen.findByRole('button', { name: '深い工作' }));

    expect(useReportViewStore.getState().segmentId).toBe('seg-1');
    // 作成・改名・削除の口はデスクトップのサイドバーにしか無い（仕様 §8）
    expect(screen.queryByRole('button', { name: /create|rename|delete/i })).toBeNull();
  });

  /** 削除済みセグメントの縮退は `useActiveSegment` が持つ（サイドバーと同じ答え）。 */
  it('選択中のセグメントが消えていたらチップは「束」へ戻る', () => {
    useReportViewStore.setState({ segmentId: 'seg-gone' });
    render(<ReportFilterChipRow />);

    expect(screen.getByRole('button', { name: 'lens.open' })).toHaveTextContent('lens.chip');
  });
});
