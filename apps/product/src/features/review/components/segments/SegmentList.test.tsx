import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const segmentsState = vi.hoisted(() => ({
  current: {
    data: [
      { id: 'seg-1', name: '深い仕事', activityIds: ['act-dev'] },
      { id: 'seg-2', name: '回復', activityIds: ['act-sleep'] },
    ] as unknown,
    isPending: false,
  },
}));
const deleteSegment = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const base = namespace ? `${namespace}.${key}` : key;
      return values ? `${base} ${Object.values(values).join(' ')}` : base;
    };
    return translate;
  },
}));

vi.mock('../../hooks/useSegments', () => ({
  useSegments: () => segmentsState.current,
  useCreateSegment: () => ({ mutate: vi.fn(), isPending: false }),
  useRenameSegment: () => ({ mutate: vi.fn(), isPending: false }),
  useSetSegmentActivities: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSegment: () => ({ mutate: deleteSegment, isPending: false }),
}));

// 中身のフォームは `useActivityTree`（tRPC）を引くので、この一覧の test では器だけを見る
vi.mock('./SegmentEditDialog', () => ({
  SegmentEditDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="segment-edit-dialog">{title}</div> : null,
}));

import { useReportViewStore } from '../../stores/useReportViewStore';
import { SegmentList } from './SegmentList';

describe('SegmentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useReportViewStore.setState({
      hiddenCategoryIds: [],
      uncategorizedHidden: false,
      marginHidden: false,
      segmentId: null,
    });
    segmentsState.current = {
      data: [
        { id: 'seg-1', name: '深い仕事', activityIds: ['act-dev'] },
        { id: 'seg-2', name: '回復', activityIds: ['act-sleep'] },
      ],
      isPending: false,
    };
  });

  it('「すべて」が既定で押下状態', () => {
    render(<SegmentList />);

    expect(screen.getByRole('button', { name: 'report.sidebar.lensAll' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '深い仕事' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('行を押すとレンズが切り替わり、「すべて」で戻る', async () => {
    const user = userEvent.setup();
    render(<SegmentList />);

    await user.click(screen.getByRole('button', { name: '深い仕事' }));
    expect(useReportViewStore.getState().segmentId).toBe('seg-1');
    expect(screen.getByRole('button', { name: '深い仕事' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'report.sidebar.lensAll' }));
    expect(useReportViewStore.getState().segmentId).toBeNull();
  });

  /**
   * 行そのものがボタンになったので、⋯ に名前だけを付けると読み上げで区別できず、
   * レンズ切替のつもりで削除を含むメニューを開いてしまう。
   */
  it('⋯ のアクセシブル名を行ボタンと分ける', () => {
    render(<SegmentList />);

    expect(screen.getByRole('button', { name: '深い仕事' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'report.sidebar.segmentMenu 深い仕事' }),
    ).toBeInTheDocument();
  });

  it('削除済みセグメントを指していたら「すべて」へ縮退する', () => {
    useReportViewStore.setState({ segmentId: 'seg-deleted' });
    render(<SegmentList />);

    expect(screen.getByRole('button', { name: 'report.sidebar.lensAll' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('レンズにしているセグメントを削除すると「すべて」へ戻す', async () => {
    const user = userEvent.setup();
    useReportViewStore.setState({ segmentId: 'seg-1' });
    render(<SegmentList />);

    await user.click(screen.getByRole('button', { name: 'report.sidebar.segmentMenu 深い仕事' }));
    await user.click(
      await screen.findByRole('menuitem', {
        name: 'calendar.stats.review.segments.delete',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'common.actions.delete' }));

    expect(deleteSegment).toHaveBeenCalledWith({ segmentId: 'seg-1' });
    expect(useReportViewStore.getState().segmentId).toBeNull();
  });

  it('別のセグメントを削除してもレンズは動かさない', async () => {
    const user = userEvent.setup();
    useReportViewStore.setState({ segmentId: 'seg-1' });
    render(<SegmentList />);

    await user.click(screen.getByRole('button', { name: 'report.sidebar.segmentMenu 回復' }));
    await user.click(
      await screen.findByRole('menuitem', {
        name: 'calendar.stats.review.segments.delete',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'common.actions.delete' }));

    expect(deleteSegment).toHaveBeenCalledWith({ segmentId: 'seg-2' });
    expect(useReportViewStore.getState().segmentId).toBe('seg-1');
  });
  /**
   * 作成導線はカレンダーの「カテゴリ」見出しと同じく、見出しの action スロットに置く。
   * 一覧の中に紛れると、レンズ切替の行と作成が同じ列に並んでしまう。
   */
  it('作成ボタンを見出し行に置き、押すとダイアログが開く', async () => {
    const user = userEvent.setup();
    render(<SegmentList />);

    expect(screen.queryByTestId('segment-edit-dialog')).not.toBeInTheDocument();

    const createButton = screen.getByRole('button', {
      name: 'calendar.stats.review.segments.create',
    });
    // 見出し（h3）と同じ行にいることを、見出しを含む section 直下の header で確かめる
    expect(createButton.closest('section')?.querySelector('h3')?.textContent).toBe(
      'report.sidebar.lensHeading',
    );

    await user.click(createButton);
    expect(await screen.findByTestId('segment-edit-dialog')).toHaveTextContent(
      'calendar.stats.review.segments.create',
    );
  });

  it('⋯ の「アクティビティを編集」で編集ダイアログが開く', async () => {
    const user = userEvent.setup();
    render(<SegmentList />);

    await user.click(screen.getByRole('button', { name: 'report.sidebar.segmentMenu 深い仕事' }));
    await user.click(
      await screen.findByRole('menuitem', {
        name: 'calendar.stats.review.segments.editActivities',
      }),
    );

    expect(await screen.findByTestId('segment-edit-dialog')).toHaveTextContent(
      'calendar.stats.review.segments.editActivities',
    );
  });
});
