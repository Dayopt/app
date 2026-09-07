import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
const openInspector = vi.hoisted(() => vi.fn());

vi.mock('@dayopt/i18n/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/features/timeblock', () => ({
  useTimeblockInspectorStore: (selector: (state: unknown) => unknown) =>
    selector({ openInspector }),
}));

import { useReportJump } from './useReportJump';

function renderJump(granularity: 'week' | 'month' | 'year' = 'week') {
  return renderHook(() => useReportJump({ anchorDate: '2026-09-04', granularity, weekStartsOn: 1 }))
    .result;
}

describe('useReportJump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未分類の記録はその日を日ビューで開き、記録の編集パネルを開く', () => {
    renderJump().current.onJumpToRecord({ id: 'rec-1', dayKey: '2026-09-01' });

    expect(push).toHaveBeenCalledWith('/calendar?view=day&date=2026-09-01');
    // 予定ではなく記録として開く（kind を落とすと既定の 'plan' で開き、中身が出ない）
    expect(openInspector).toHaveBeenCalledWith('rec-1', 'record');
  });

  it('未変換の外部予定はその日を日ビューで開くだけ', () => {
    renderJump().current.onJumpToDay('2026-09-08');

    expect(push).toHaveBeenCalledWith('/calendar?view=day&date=2026-09-08');
    expect(openInspector).not.toHaveBeenCalled();
  });

  it('次期間は初日を週ビューで開く', () => {
    renderJump().current.onJumpToNextPeriod();

    expect(push).toHaveBeenCalledWith('/calendar?view=week&date=2026-09-07');
  });

  it('月粒度なら翌月 1 日、年粒度なら翌年 1 月 1 日を開く', () => {
    renderJump('month').current.onJumpToNextPeriod();
    expect(push).toHaveBeenLastCalledWith('/calendar?view=week&date=2026-10-01');

    renderJump('year').current.onJumpToNextPeriod();
    expect(push).toHaveBeenLastCalledWith('/calendar?view=week&date=2027-01-01');
  });
});
