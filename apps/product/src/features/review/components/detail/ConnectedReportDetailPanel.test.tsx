import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (state: { timezone: string }) => unknown) =>
    selector({ timezone: 'Asia/Tokyo' }),
}));

vi.mock('../../hooks/useReportActivityDetail', () => ({
  useReportActivityDetail: () => ({ data: undefined, isPending: true, isError: false }),
}));

vi.mock('./ReportDetailPanel', () => ({
  ReportDetailPanel: () => <div data-testid="detail-panel" />,
}));

import { useReportDetailStore } from '../../stores/useReportDetailStore';
import { ConnectedReportDetailPanel } from './ConnectedReportDetailPanel';

const TARGET = { activityId: 'act-1', name: '執筆', categoryName: '仕事', color: 'blue' };

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
  it('閉じている間は何も描かない', () => {
    useReportDetailStore.getState().close();
    const { queryByTestId } = renderConnected();

    expect(queryByTestId('detail-panel')).toBeNull();
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
