import { describe, expect, it } from 'vitest';

import {
  ALLOWED_DRAG_SNAP_MINUTES,
  DEFAULT_DRAG_SNAP_MINUTES,
  INSPECTOR_TIME_PRECISION_MINUTES,
  type DragSnapMinutes,
} from '../precision';

describe('precision policy constants', () => {
  it('Inspector の精度は 1 分で固定（policy 変更を test で検出する）', () => {
    expect(INSPECTOR_TIME_PRECISION_MINUTES).toBe(1);
  });

  it('drag の default snap は 15 分', () => {
    expect(DEFAULT_DRAG_SNAP_MINUTES).toBe(15);
  });

  it('drag snap の許容値域に 1 を含めない（user 設定に滲ませない）', () => {
    expect(ALLOWED_DRAG_SNAP_MINUTES).not.toContain(1 as never);
  });

  it('drag snap の許容値域は 5 / 10 / 15 / 30 のみ', () => {
    expect([...ALLOWED_DRAG_SNAP_MINUTES]).toEqual([5, 10, 15, 30]);
  });

  it('default snap は許容値域に含まれる', () => {
    expect(ALLOWED_DRAG_SNAP_MINUTES).toContain(DEFAULT_DRAG_SNAP_MINUTES as DragSnapMinutes);
  });
});
