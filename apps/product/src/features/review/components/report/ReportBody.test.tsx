import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `t(key)` は namespace 付きのキーをそのまま返し、値を持つものは末尾へ並べる。
 * 文言そのものではなく「どの値がどこへ出たか」を見たいので、翻訳は素通しにする。
 */
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const base = namespace ? `${namespace}.${key}` : key;
      return values ? `${base} ${Object.values(values).join(' ')}` : base;
    };
    translate.raw = () => ['月', '火', '水', '木', '金', '土', '日'];
    return translate;
  },
}));

vi.mock('../../hooks/useReviewOpenedTracking', () => ({
  useReviewOpenedTracking: () => {},
}));

vi.mock('../../hooks/useReportPeriod', () => ({
  useReportPeriod: () => ({ data: PERIOD_DATA, isPending: false, isError: false }),
}));

vi.mock('../../hooks/useSegments', () => ({
  useSegments: () => ({ data: SEGMENTS }),
}));

import { useReportViewStore } from '../../stores/useReportViewStore';
import { ReportBody } from './ReportBody';

/**
 * 週 = 10080 分。記録は 仕事 600 + 睡眠 2400 + 未分類 60 = 3060 分。
 * したがって余白は 10080 − 3060 = 7020 分（= 117:00）で、**フィルタでは動かない**。
 */
const PERIOD_DATA = {
  period: { startAt: '', endAt: '', lengthMinutes: 10080, bucketKeys: ['2026-08-31'] },
  previous: { startAt: '', endAt: '', lengthMinutes: 10080 },
  nowAt: '2026-09-04T00:00:00.000Z',
  activities: [
    aggregate({
      activityId: 'act-dev',
      activityName: '実装',
      categoryId: 'cat-work',
      categoryName: '仕事',
      categoryColor: 'blue',
      recordedMinutes: 600,
    }),
    aggregate({
      activityId: 'act-sleep',
      activityName: '就寝',
      categoryId: 'cat-sleep',
      categoryName: '睡眠',
      categoryColor: 'indigo',
      recordedMinutes: 2400,
    }),
    aggregate({
      activityId: 'act-walk',
      activityName: '散歩',
      categoryId: null,
      categoryName: null,
      categoryColor: null,
      recordedMinutes: 60,
    }),
  ],
  previousActivities: [],
  nextPeriodPlannedMinutes: 0,
  uncategorizedRecordCount: 1,
};

const SEGMENTS = [{ id: 'seg-1', name: '深い仕事', activityIds: ['act-dev'] }];

function renderBody() {
  return render(<ReportBody anchorDate="2026-09-02" granularity="week" />);
}

/** ヘッドラインの大きい数字（見えているインク `V`）。 */
function headline() {
  return document.querySelector('[data-report-headline="recorded"]')?.textContent;
}

/** 「記録 x ・ 余白 y」の行。余白の値がフィルタで動かないことを見る。 */
function subtitle() {
  return screen.getByText(/^report\.allocation\.subtitle/).textContent;
}

/** 決算バーが塗っている割合の合計（%）。残りは余白＝紙として塗られない。 */
function paintedPercent(ariaLabel = 'report.allocation.barAriaLabel') {
  const bar = screen.getByRole('img', { name: ariaLabel });
  return [...bar.children].reduce(
    (total, span) => total + Number.parseFloat((span as HTMLElement).style.width),
    0,
  );
}

describe('ReportBody', () => {
  beforeEach(() => {
    localStorage.clear();
    useReportViewStore.setState({
      hiddenCategoryIds: [],
      uncategorizedHidden: false,
      marginHidden: false,
      segmentId: null,
    });
  });

  it('既定ではすべてのカテゴリーが分母に入る', () => {
    renderBody();

    expect(headline()).toBe('51:00');
    expect(subtitle()).toContain('117:00');
    expect(screen.getByText('仕事')).toBeInTheDocument();
    expect(screen.getByText('睡眠')).toBeInTheDocument();

    // 余白 on のときは塗り残しが出る（余白はセグメントを持たず、紙として残る）
    expect(paintedPercent()).toBeCloseTo((3060 / 10080) * 100, 5);
  });

  /**
   * 仕様 §13-2。カテゴリーを 1 つ隠すと `V` と `track` から抜けるが、**余白は動かない**。
   * `computeDenominators` の `allActivities` にフィルタを掛けると、ここが落ちる。
   */
  it('睡眠を隠すと V から睡眠分が抜け、余白の値は変わらない', () => {
    useReportViewStore.setState({ hiddenCategoryIds: ['cat-sleep'] });
    renderBody();

    expect(headline()).toBe('11:00');
    expect(subtitle()).toContain('117:00');
    expect(screen.queryByText('睡眠')).not.toBeInTheDocument();
    expect(screen.getByText('仕事')).toBeInTheDocument();
  });

  it('未分類を隠すと未分類の行が消える', () => {
    useReportViewStore.setState({ uncategorizedHidden: true });
    renderBody();

    expect(headline()).toBe('50:00');
    expect(screen.queryByText('report.allocation.uncategorized')).not.toBeInTheDocument();
  });

  it('余白オフで分母がインクの合計になり、決算バーが 100% 埋まる', () => {
    useReportViewStore.setState({ marginHidden: true });
    renderBody();

    expect(subtitle()).toBe('report.allocation.subtitleInkOnly');
    // track = max(1, V) = 3060 分。塗り残しが無くなる
    expect(paintedPercent()).toBeCloseTo(100, 5);
  });

  describe('セグメントレンズ', () => {
    it('宇宙が縮み、凡例がアクティビティ別に変わる', () => {
      useReportViewStore.setState({ segmentId: 'seg-1' });
      renderBody();

      expect(headline()).toBe('10:00');
      // カテゴリー名ではなくアクティビティ名が並ぶ
      expect(screen.getByText('実装')).toBeInTheDocument();
      expect(screen.queryByText('仕事')).not.toBeInTheDocument();
      expect(screen.getByText('report.allocation.lensLabel 深い仕事')).toBeInTheDocument();
    });

    it('セグメント別バーのブロックを出さない', () => {
      renderBody();
      expect(screen.getByText('report.allocation.segments.heading')).toBeInTheDocument();

      act(() => {
        useReportViewStore.setState({ segmentId: 'seg-1' });
      });

      expect(screen.queryByText('report.allocation.segments.heading')).not.toBeInTheDocument();
      // バーの読み上げもアクティビティ別へ切り替わる
      expect(paintedPercent('report.allocation.barAriaLabelLens')).toBeCloseTo(100, 5);
    });

    it('余白は分母に入らない（余白チップの状態によらない）', () => {
      useReportViewStore.setState({ segmentId: 'seg-1', marginHidden: false });
      renderBody();

      expect(subtitle()).toBe('report.allocation.subtitleInkOnly');
    });

    it('存在しないセグメントを指していたら「すべて」へ縮退する', () => {
      useReportViewStore.setState({ segmentId: 'seg-deleted' });
      renderBody();

      expect(headline()).toBe('51:00');
      expect(screen.getByText('仕事')).toBeInTheDocument();
    });
  });

  it('フィルタとレンズは期間の移動をまたいで保たれる', () => {
    useReportViewStore.setState({ hiddenCategoryIds: ['cat-sleep'] });
    const { rerender } = renderBody();
    expect(headline()).toBe('11:00');

    rerender(<ReportBody anchorDate="2026-08-26" granularity="week" />);

    expect(useReportViewStore.getState().hiddenCategoryIds).toEqual(['cat-sleep']);
    expect(headline()).toBe('11:00');
  });
});

function aggregate(overrides: {
  activityId: string;
  activityName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  recordedMinutes: number;
}) {
  return {
    categoryIcon: null,
    archived: false,
    plannedMinutes: 0,
    plannedPastMinutes: 0,
    plannedPastBoxes: 0,
    recordBoxes: 1,
    fulfillment: { low: 0, medium: 0, high: 0 },
    byBucket: [overrides.recordedMinutes],
    ...overrides,
  };
}
