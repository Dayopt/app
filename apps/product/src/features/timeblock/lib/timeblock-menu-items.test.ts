/**
 * Entry Menu Items Unit Tests
 *
 * getTimeblockMenuItems の表示条件をテストする。
 * skip / unskip は Plan（origin: 'planned'）かどうかとスキップ済みかだけで決まり、
 * 時刻（過去 / 未来）では出し分けない。
 */

import { describe, expect, it, vi } from 'vitest';

import { getTimeblockMenuItems } from './timeblock-menu-items';

describe('getTimeblockMenuItems', () => {
  const noop = vi.fn();

  const baseArgs = {
    onViewStats: noop,
    onCopy: noop,
    onDuplicate: noop,
    onDelete: noop,
  };

  const keys = (args: Parameters<typeof getTimeblockMenuItems>[0]) =>
    getTimeblockMenuItems(args).map((item) => item.key);

  describe('copy', () => {
    it('ハンドラ指定時は種別に関係なく表示する', () => {
      expect(keys({ ...baseArgs, origin: 'planned' })).toContain('copy');
      expect(keys({ ...baseArgs, origin: 'unplanned' })).toContain('copy');
    });

    it('ハンドラ未指定なら表示しない', () => {
      expect(keys({ origin: 'planned' })).not.toContain('copy');
    });
  });

  describe('duplicate', () => {
    it('ハンドラ指定時はPlanとRecordの両方に表示する', () => {
      expect(keys({ ...baseArgs, origin: 'planned' })).toContain('duplicate');
      expect(keys({ ...baseArgs, origin: 'unplanned' })).toContain('duplicate');
    });

    it('ハンドラ未指定なら表示しない', () => {
      expect(keys({ origin: 'planned' })).not.toContain('duplicate');
    });
  });

  describe('項目セット', () => {
    it('planned / unplanned のどちらでも変換系を含まない固定の項目集合になる', () => {
      // markUnplanned / restorePlanned は撤去済み。union 型からも消えているので
      // key の完全一致で「増えていないこと」まで見る（not.toContain では型上
      // 決して失敗せず、TEST-1 の「挙動を証明しないテスト」になる）。
      expect(
        keys({ ...baseArgs, origin: 'planned', activityId: 'activity-1', onSkip: noop }),
      ).toEqual(['viewStats', 'copy', 'duplicate', 'skip', 'delete']);
      expect(
        keys({ ...baseArgs, origin: 'unplanned', activityId: 'activity-1', onSkip: noop }),
      ).toEqual(['viewStats', 'copy', 'duplicate', 'delete']);
    });
  });

  describe('skip / unskip', () => {
    const skipArgs = { ...baseArgs, onSkip: noop, onUnskip: noop };

    it('未スキップの planned なら skip を出す', () => {
      expect(keys({ ...skipArgs, origin: 'planned', isSkipped: false })).toContain('skip');
    });

    it('時刻に関わらず planned には skip を出す（未来の Plan も skip できる）', () => {
      expect(keys({ ...skipArgs, origin: 'planned' })).toContain('skip');
    });

    it('unplanned には skip を出さない', () => {
      expect(keys({ ...skipArgs, origin: 'unplanned' })).not.toContain('skip');
    });

    it('スキップ済みなら skip を隠して unskip を出す', () => {
      const result = keys({ ...skipArgs, origin: 'planned', isSkipped: true });
      expect(result).not.toContain('skip');
      expect(result).toContain('unskip');
    });

    it('未スキップでは unskip を出さない', () => {
      expect(keys({ ...skipArgs, origin: 'planned', isSkipped: false })).not.toContain('unskip');
    });

    it('ハンドラ未指定なら skip / unskip を出さない', () => {
      const result = keys({ ...baseArgs, origin: 'planned', isSkipped: true });
      expect(result).not.toContain('skip');
      expect(result).not.toContain('unskip');
    });
  });
});
