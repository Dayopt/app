import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const base = namespace ? `${namespace}.${key}` : key;
      return values ? `${base} ${Object.values(values).join(' ')}` : base;
    };
    translate.raw = (key: string) =>
      key === 'labels'
        ? ['朝', '午前', '昼', '午後', '夜', '深夜']
        : ['日', '月', '火', '水', '木', '金', '土'];
    return translate;
  },
}));

import { setDomSlot } from '@/lib/dom-slots/useDomSlot';

import { REPORT_DETAIL_SLOT_KEY } from '../../lib/report-detail-slot';
import { ReportDetailPanel } from './ReportDetailPanel';

import type { ReportActivityDetailResult } from '../../server/report-detail-service';

function detail(overrides: Partial<ReportActivityDetailResult> = {}): ReportActivityDetailResult {
  return {
    recordedMinutes: 600,
    plannedMinutes: 480,
    plannedPastMinutes: 480,
    plannedPastBoxes: 4,
    medianBoxMinutes: 90,
    fulfillment: { low: 1, medium: 0, high: 3 },
    timeOfDay: [60, 240, 120, 180, 0, 0],
    trend: [
      { key: '2026-08-03', recordedMinutes: 0 },
      { key: '2026-08-10', recordedMinutes: 300 },
      { key: '2026-08-17', recordedMinutes: 420 },
      { key: '2026-08-24', recordedMinutes: 0 },
      { key: '2026-08-31', recordedMinutes: 600 },
      { key: '2026-09-07', recordedMinutes: 0 },
    ],
    records: [
      {
        id: 'rec-1',
        title: '執筆',
        startAt: '2026-09-01T01:00:00.000Z',
        endAt: '2026-09-01T02:30:00.000Z',
        minutes: 90,
        fulfillment: 'high',
        note: null,
      },
    ],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof ReportDetailPanel>[0]> = {}) {
  return render(
    <ReportDetailPanel
      categoryName="仕事"
      color="blue"
      detail={detail()}
      granularity="week"
      timezone="Asia/Tokyo"
      isError={false}
      isPending={false}
      name="執筆"
      onClose={() => {}}
      onOpenCalendarDay={() => {}}
      {...overrides}
    />,
  );
}

describe('ReportDetailPanel', () => {
  beforeEach(() => {
    // shell が用意する slot を test でも作る（未登録なら何も描かない仕様）
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    setDomSlot(REPORT_DETAIL_SLOT_KEY, slot);
  });

  it('slot が未登録なら何も描かない', () => {
    setDomSlot(REPORT_DETAIL_SLOT_KEY, null);
    renderPanel();

    expect(document.querySelector('[data-report-panel="detail"]')).toBeNull();
  });

  it('予定比・中央値・充実の分布を出す', () => {
    renderPanel();

    // 600 / 480 = 125%
    expect(screen.getByText('report.detail.stats.planRatio 125')).toBeInTheDocument();
    // 中央値は統計カードの中を見る（同じ `1:30` が明細の 1 行にも出る）
    const stats = document.querySelector('[data-report-stats="detail"]') as HTMLElement;
    expect(within(stats).getByText('1:30')).toBeInTheDocument();
    expect(
      screen.getByText(
        'report.detail.stats.fulfillmentLevel.high 3 report.detail.stats.fulfillmentLevel.low 1',
      ),
    ).toBeInTheDocument();
  });

  it('過去予定が閾値未満なら率を作らず状態を出す', () => {
    renderPanel({ detail: detail({ plannedPastMinutes: 0, plannedMinutes: 240 }) });

    expect(screen.getByText('report.detail.stats.planPending')).toBeInTheDocument();
    expect(screen.queryByText(/planRatio/)).not.toBeInTheDocument();
  });

  it('予定が無ければ「予定なし」を出す', () => {
    renderPanel({ detail: detail({ plannedMinutes: 0, plannedPastMinutes: 0 }) });

    expect(screen.getByText('report.detail.stats.planNone')).toBeInTheDocument();
  });

  it('中央値 0 件はダッシュ、充実 0 件は未回答', () => {
    renderPanel({
      detail: detail({ medianBoxMinutes: null, fulfillment: { low: 0, medium: 0, high: 0 } }),
    });

    expect(screen.getByText('report.detail.stats.none')).toBeInTheDocument();
    expect(screen.getByText('report.detail.stats.unanswered')).toBeInTheDocument();
  });

  /** 仕様 §6-5。データのある期間が 2 未満なら節ごと消える。 */
  it('推移はデータのある期間が 2 未満なら節ごと出さない', () => {
    const { rerender } = renderPanel();
    expect(document.querySelector('[data-report-bars="trend"]')).not.toBeNull();

    rerender(
      <ReportDetailPanel
        categoryName="仕事"
        color="blue"
        detail={detail({
          trend: [
            { key: 'a', recordedMinutes: 0 },
            { key: 'b', recordedMinutes: 0 },
            { key: 'c', recordedMinutes: 120 },
          ],
        })}
        granularity="week"
        timezone="Asia/Tokyo"
        isError={false}
        isPending={false}
        name="執筆"
        onClose={() => {}}
        onOpenCalendarDay={() => {}}
      />,
    );

    expect(document.querySelector('[data-report-bars="trend"]')).toBeNull();
  });

  /**
   * ブラウザのローカル時刻で描くと、timezone 設定がずれている端末で明細とカレンダーが
   * 食い違う。`2026-09-01T01:00:00Z` は JST では 10:00。
   */
  it('明細の時刻と曜日をユーザーの timezone で描く', () => {
    renderPanel();

    expect(screen.getByText('10:00–11:30')).toBeInTheDocument();
    // 2026-09-01 は火曜
    expect(screen.getByText('火')).toBeInTheDocument();
  });

  it('「カレンダーで見る」は timezone で切った日を渡す', async () => {
    const onOpenCalendarDay = vi.fn();
    renderPanel({
      detail: detail({
        records: [
          {
            id: 'rec-night',
            title: '執筆',
            // JST では 09-02 の 08:00。UTC の日付（09-01）で開くと 1 日ずれる
            startAt: '2026-09-01T23:00:00.000Z',
            endAt: '2026-09-01T23:30:00.000Z',
            minutes: 30,
            fulfillment: null,
            note: null,
          },
        ],
      }),
      onOpenCalendarDay,
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(screen.getByText('report.detail.openCalendar'));

    expect(onOpenCalendarDay).toHaveBeenCalledWith('2026-09-02');
  });

  it('時間帯は 6 本すべて描く（0 のバケットも残す）', () => {
    renderPanel();

    expect(document.querySelectorAll('[data-report-bars="time-of-day"] > li')).toHaveLength(6);
  });

  it('明細が 0 件でも落ちず、空文言を出す', () => {
    renderPanel({ detail: detail({ records: [] }) });

    expect(screen.getByText('report.detail.records.empty')).toBeInTheDocument();
  });

  /** 仕様 §6。パネル内で編集はしない。 */
  it('編集用の入力を持たない', () => {
    renderPanel();

    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('読み込み中と失敗時は明細を描かない', () => {
    const { rerender } = renderPanel({ detail: undefined, isPending: true });
    expect(document.querySelector('[data-report-list="records"]')).toBeNull();

    rerender(
      <ReportDetailPanel
        categoryName="仕事"
        color="blue"
        detail={undefined}
        granularity="week"
        timezone="Asia/Tokyo"
        isError
        isPending={false}
        name="執筆"
        onClose={() => {}}
        onOpenCalendarDay={() => {}}
      />,
    );

    expect(screen.getByText('report.detail.error')).toBeInTheDocument();
  });
});
