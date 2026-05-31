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
});
