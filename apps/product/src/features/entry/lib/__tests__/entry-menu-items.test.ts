/**
 * Entry Menu Items Unit Tests
 *
 * getEntryMenuItems の表示条件をテストする。
 * 特に「予定外にする」(markUnplanned) が origin / isUpcoming でどう出し分けられるか。
 */

import { describe, expect, it, vi } from 'vitest';

import { getEntryMenuItems } from '../entry-menu-items';

describe('getEntryMenuItems', () => {
  const noop = vi.fn();

  const baseArgs = {
    tagId: 'tag-1',
    onViewStats: noop,
    onMarkUnplanned: noop,
    onRestorePlanned: noop,
    onDelete: noop,
  };

  const keys = (args: Parameters<typeof getEntryMenuItems>[0]) =>
    getEntryMenuItems(args).map((item) => item.key);

  describe('markUnplanned', () => {
    it('planned かつ未来でなければ markUnplanned を出す', () => {
      expect(keys({ ...baseArgs, origin: 'planned', isUpcoming: false })).toContain(
        'markUnplanned',
      );
    });

    it('planned でも未来(upcoming)なら markUnplanned を出さない', () => {
      expect(keys({ ...baseArgs, origin: 'planned', isUpcoming: true })).not.toContain(
        'markUnplanned',
      );
    });

    it('isUpcoming 未指定（デフォルト false）では planned に markUnplanned を出す', () => {
      expect(keys({ ...baseArgs, origin: 'planned' })).toContain('markUnplanned');
    });

    it('unplanned では isUpcoming に関わらず markUnplanned を出さない', () => {
      expect(keys({ ...baseArgs, origin: 'unplanned', isUpcoming: false })).not.toContain(
        'markUnplanned',
      );
    });
  });

  describe('restorePlanned', () => {
    it('unplanned では restorePlanned を出す（isUpcoming の影響を受けない）', () => {
      expect(keys({ ...baseArgs, origin: 'unplanned', isUpcoming: true })).toContain(
        'restorePlanned',
      );
    });
  });

  describe('skip / unskip', () => {
    const skipArgs = { ...baseArgs, onSkip: noop, onUnskip: noop };

    it('過去の planned かつ未スキップなら skip を出す', () => {
      expect(
        keys({ ...skipArgs, origin: 'planned', isUpcoming: false, isSkipped: false }),
      ).toContain('skip');
    });

    it('未来(upcoming)の planned には skip を出さない', () => {
      expect(keys({ ...skipArgs, origin: 'planned', isUpcoming: true })).not.toContain('skip');
    });

    it('unplanned には skip を出さない', () => {
      expect(keys({ ...skipArgs, origin: 'unplanned', isUpcoming: false })).not.toContain('skip');
    });

    it('スキップ済みなら skip を隠して unskip を出す', () => {
      const result = keys({ ...skipArgs, origin: 'planned', isUpcoming: false, isSkipped: true });
      expect(result).not.toContain('skip');
      expect(result).toContain('unskip');
    });

    it('未スキップでは unskip を出さない', () => {
      expect(
        keys({ ...skipArgs, origin: 'planned', isUpcoming: false, isSkipped: false }),
      ).not.toContain('unskip');
    });

    it('ハンドラ未指定なら skip / unskip を出さない', () => {
      const result = keys({ ...baseArgs, origin: 'planned', isUpcoming: false, isSkipped: true });
      expect(result).not.toContain('skip');
      expect(result).not.toContain('unskip');
    });
  });
});
