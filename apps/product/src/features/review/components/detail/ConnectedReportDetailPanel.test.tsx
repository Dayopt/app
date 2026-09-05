import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (state: { timezone: string }) => unknown) =>
    selector({ timezone: 'Asia/Tokyo' }),
}));

const useReportActivityDetail = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isPending: true, isError: false })),
);

vi.mock('../../hooks/useReportActivityDetail', () => ({ useReportActivityDetail }));

vi.mock('./ReportDetailPanel', () => ({
  ReportDetailPanel: () => <div data-testid="detail-panel" />,
}));

import { setDomSlot } from '@/lib/dom-slots/useDomSlot';

import { REPORT_DETAIL_SLOT_KEY } from '../../lib/report-detail-slot';
import { useReportDetailStore } from '../../stores/useReportDetailStore';
import { ConnectedReportDetailPanel } from './ConnectedReportDetailPanel';

const TARGET = { activityId: 'act-1', name: '執筆', categoryName: '仕事', color: 'blue' };

/** shell が器を用意した状態（デスクトップ）にする。 */
function registerSlot() {
  setDomSlot(REPORT_DETAIL_SLOT_KEY, document.createElement('div'));
}

function renderConnected() {
  return render(
    <ConnectedReportDetailPanel
      anchorDate="2026-09-04"
      granularity="week"
      onOpenCalendarDay={() => {}}
    />,
  );
}

describe('ConnectedReportDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReportDetailStore.getState().close();
    registerSlot();
  });

  it('閉じている間は何も描かない', () => {
    const { queryByTestId } = renderConnected();

    expect(queryByTestId('detail-panel')).toBeNull();
  });

  it('開いていれば描く', () => {
    const { queryByTestId, rerender } = renderConnected();

    act(() => useReportDetailStore.getState().toggle(TARGET));
    rerender(
      <ConnectedReportDetailPanel
        anchorDate="2026-09-04"
        granularity="week"
        onOpenCalendarDay={() => {}}
      />,
    );

    expect(queryByTestId('detail-panel')).not.toBeNull();
  });

  /**
   * モバイルの shell は詳細パネルの器（slot）を登録しない（#2582 で足す）。器が無い間は
   * **query を持つ component ごとマウントしない** — でないと「画面は無反応なのに
   * `getReportActivityDetail` だけ飛ぶ」状態になる。
   */
  it('器が無ければ開いていても描かず、明細も取りに行かない', () => {
    setDomSlot(REPORT_DETAIL_SLOT_KEY, null);
    useReportDetailStore.getState().toggle(TARGET);

    const { queryByTestId } = renderConnected();

    expect(queryByTestId('detail-panel')).toBeNull();
    expect(useReportActivityDetail).not.toHaveBeenCalled();
  });

  /**
   * store は shell の 4 カラム目の開閉も握っているので、開いたまま `/report` を離れると
   * 中身の無い 250px の帯がカレンダー側に残る。
   */
  it('unmount 時に閉じる（他ページへ帯を持ち越さない）', () => {
    const { unmount } = renderConnected();

    useReportDetailStore.getState().toggle(TARGET);
    expect(useReportDetailStore.getState().isOpen).toBe(true);

    unmount();

    expect(useReportDetailStore.getState().isOpen).toBe(false);
    expect(useReportDetailStore.getState().target).toBeNull();
  });
});
