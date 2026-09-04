import { describe, expect, it } from 'vitest';

import type { Activity } from '@/features/activities';

import { canDropActivity, DROP_TARGET_UNCATEGORIZED, toCategoryId } from './activity-drop-target';

const TIMESTAMPS = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function activity(id: string, name: string, categoryId: string | null): Activity {
  return {
    id,
    name,
    user_id: 'user-1',
    category_id: categoryId,
    archived_at: null,
    ...TIMESTAMPS,
  };
}

const WORK = 'cat-work';
const STUDY = 'cat-study';

describe('toCategoryId', () => {
  it('未分類の番兵は null になる（activities.category_id にそのまま書ける）', () => {
    expect(toCategoryId(DROP_TARGET_UNCATEGORIZED)).toBeNull();
  });

  it('カテゴリー ID はそのまま通す', () => {
    expect(toCategoryId(WORK)).toBe(WORK);
  });
});

describe('canDropActivity', () => {
  it('別カテゴリーへは落とせる', () => {
    const meeting = activity('act-1', '会議', WORK);
    expect(canDropActivity({ activity: meeting, target: STUDY, allActivities: [meeting] })).toBe(
      true,
    );
  });

  it('カテゴリーから未分類へ落とせる', () => {
    const meeting = activity('act-1', '会議', WORK);
    expect(
      canDropActivity({
        activity: meeting,
        target: DROP_TARGET_UNCATEGORIZED,
        allActivities: [meeting],
      }),
    ).toBe(true);
  });

  it('未分類からカテゴリーへ落とせる', () => {
    const workout = activity('act-1', '運動', null);
    expect(canDropActivity({ activity: workout, target: WORK, allActivities: [workout] })).toBe(
      true,
    );
  });

  it('今いるカテゴリーへは落とせない（無駄な mutation とちらつきを防ぐ）', () => {
    const meeting = activity('act-1', '会議', WORK);
    expect(canDropActivity({ activity: meeting, target: WORK, allActivities: [meeting] })).toBe(
      false,
    );
  });

  it('未分類にいるものを未分類へは落とせない', () => {
    const workout = activity('act-1', '運動', null);
    expect(
      canDropActivity({
        activity: workout,
        target: DROP_TARGET_UNCATEGORIZED,
        allActivities: [workout],
      }),
    ).toBe(false);
  });

  it('移動先に同名がいると落とせない（UNIQUE 制約に触れるため）', () => {
    const source = activity('act-1', '会議', WORK);
    const conflict = activity('act-2', '会議', STUDY);
    expect(
      canDropActivity({ activity: source, target: STUDY, allActivities: [source, conflict] }),
    ).toBe(false);
  });

  it('同名判定は大文字小文字を区別しない', () => {
    const source = activity('act-1', 'Review', WORK);
    const conflict = activity('act-2', 'review', STUDY);
    expect(
      canDropActivity({ activity: source, target: STUDY, allActivities: [source, conflict] }),
    ).toBe(false);
  });

  it('同名でも移動先ではない第三のカテゴリーにいるだけなら妨げない', () => {
    const source = activity('act-1', '会議', WORK);
    const elsewhere = activity('act-2', '会議', 'cat-other');
    expect(
      canDropActivity({ activity: source, target: STUDY, allActivities: [source, elsewhere] }),
    ).toBe(true);
  });

  it('未分類にいる同名は、未分類へ落とす時だけ衝突する', () => {
    const source = activity('act-1', '会議', WORK);
    const uncategorizedTwin = activity('act-2', '会議', null);
    const allActivities = [source, uncategorizedTwin];

    expect(
      canDropActivity({ activity: source, target: DROP_TARGET_UNCATEGORIZED, allActivities }),
    ).toBe(false);
    expect(canDropActivity({ activity: source, target: STUDY, allActivities })).toBe(true);
  });
});
