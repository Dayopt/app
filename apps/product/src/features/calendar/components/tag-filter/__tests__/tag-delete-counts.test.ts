import { describe, expect, it } from 'vitest';

import { mergeTagDeleteCounts } from '../tag-delete-counts';

describe('mergeTagDeleteCounts', () => {
  it('records と plans の件数を合算する', () => {
    const result = mergeTagDeleteCounts(
      { counts: { 'tag-1': 2 }, planCounts: { 'tag-1': 3 } },
      false,
    );
    expect(result).toEqual({ 'tag-1': 5 });
  });

  it('Plan のみ（records=0）のタグも合計に反映される（#1576フォローアップ: 確認なし即削除の修正）', () => {
    const result = mergeTagDeleteCounts({ counts: {}, planCounts: { 'tag-only-plan': 1 } }, false);
    expect(result).toEqual({ 'tag-only-plan': 1 });
    // 確認なしで即削除される条件は affectedCount === 0。Plan のみのタグはここが 0 にならないことが本体
    expect(result?.['tag-only-plan']).not.toBe(0);
  });

  it('Record のみ（plans=0）のタグは従来どおり records 件数がそのまま反映される', () => {
    const result = mergeTagDeleteCounts(
      { counts: { 'tag-record-only': 4 }, planCounts: {} },
      false,
    );
    expect(result).toEqual({ 'tag-record-only': 4 });
  });

  it('tagStats 未取得（undefined）時は空 Record を返す', () => {
    expect(mergeTagDeleteCounts(undefined, false)).toEqual({});
  });

  it('isError=true の時は null を返す（呼び出し側は常に確認ダイアログへ倒す）', () => {
    expect(mergeTagDeleteCounts({ counts: { 'tag-1': 0 }, planCounts: {} }, true)).toBeNull();
  });

  it('isError=true は counts/planCounts の中身に関わらず null を優先する', () => {
    expect(
      mergeTagDeleteCounts({ counts: { 'tag-1': 5 }, planCounts: { 'tag-1': 5 } }, true),
    ).toBeNull();
  });

  it('どちらの Record にも無い ID は合計に現れない（0 件相当）', () => {
    const result = mergeTagDeleteCounts({ counts: {}, planCounts: {} }, false);
    expect(result?.['unknown-tag']).toBeUndefined();
    expect(result?.['unknown-tag'] ?? 0).toBe(0);
  });
});
