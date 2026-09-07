import { beforeEach, describe, expect, it } from 'vitest';

import { useReportDetailStore } from './useReportDetailStore';

const WRITE = { activityId: 'act-write', name: '執筆', categoryName: '仕事', color: 'blue' };
const READ = { activityId: 'act-read', name: '読書', categoryName: '学習', color: 'green' };
const UNASSIGNED = { activityId: null, name: null, categoryName: null, color: null };

describe('useReportDetailStore', () => {
  beforeEach(() => {
    useReportDetailStore.getState().close();
  });

  it('既定では閉じている', () => {
    expect(useReportDetailStore.getState().isOpen).toBe(false);
    expect(useReportDetailStore.getState().target).toBeNull();
  });

  it('同じ対象を再度選ぶと閉じる', () => {
    useReportDetailStore.getState().toggle(WRITE);
    expect(useReportDetailStore.getState().isOpen).toBe(true);

    useReportDetailStore.getState().toggle(WRITE);
    expect(useReportDetailStore.getState().isOpen).toBe(false);
    expect(useReportDetailStore.getState().target).toBeNull();
  });

  it('別の対象を選ぶと中身が差し替わる（閉じない）', () => {
    useReportDetailStore.getState().toggle(WRITE);
    useReportDetailStore.getState().toggle(READ);

    expect(useReportDetailStore.getState().isOpen).toBe(true);
    expect(useReportDetailStore.getState().target?.activityId).toBe('act-read');
  });

  /**
   * アクティビティ未設定の行は `activityId` が `null`。閉じている状態の `target: null` と
   * 混同すると、開いた直後にもう一度押しても閉じない（または開かない）。
   */
  it('アクティビティ未設定の行も開閉できる', () => {
    useReportDetailStore.getState().toggle(UNASSIGNED);
    expect(useReportDetailStore.getState().isOpen).toBe(true);
    expect(useReportDetailStore.getState().target).toEqual(UNASSIGNED);

    useReportDetailStore.getState().toggle(UNASSIGNED);
    expect(useReportDetailStore.getState().isOpen).toBe(false);
  });

  it('close は対象ごと捨てる', () => {
    useReportDetailStore.getState().toggle(WRITE);
    useReportDetailStore.getState().close();

    expect(useReportDetailStore.getState().isOpen).toBe(false);
    expect(useReportDetailStore.getState().target).toBeNull();
  });
});
