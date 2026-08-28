import { describe, expect, it } from 'vitest';

import type { MessageKey } from '@/lib/i18n';

import { mergeShortcutCatalogs, type ShortcutCatalog } from './shortcut-catalog';

// このテストは merge/sort ロジックのみを検証しており、実在する i18n キーである必要は
// 無い。区別しやすい opaque な文字列を使うため、labelKey の型境界だけ cast で満たす。
const fakeKey = (label: string) => label as MessageKey;

describe('mergeShortcutCatalogs', () => {
  it('groupをidで重複排除し（先勝ち）、group/entryをorder昇順で並べる', () => {
    const a: ShortcutCatalog = {
      groups: [{ id: 'general', labelKey: fakeKey('a.general'), scope: 'global', order: 10 }],
      entries: [{ groupId: 'general', labelKey: fakeKey('a.entry'), keys: ['Cmd+K'], order: 10 }],
    };
    const b: ShortcutCatalog = {
      groups: [
        {
          id: 'general',
          labelKey: fakeKey('b.general.duplicate'),
          scope: 'global',
          order: 999,
        },
        { id: 'views', labelKey: fakeKey('b.views'), scope: 'calendar', order: 5 },
      ],
      entries: [{ groupId: 'views', labelKey: fakeKey('b.entry'), keys: ['1'], order: 1 }],
    };

    const merged = mergeShortcutCatalogs(a, b);

    expect(merged.groups).toEqual([
      { id: 'views', labelKey: 'b.views', scope: 'calendar', order: 5 },
      { id: 'general', labelKey: 'a.general', scope: 'global', order: 10 },
    ]);
    expect(merged.entries).toEqual([
      { groupId: 'views', labelKey: 'b.entry', keys: ['1'], order: 1 },
      { groupId: 'general', labelKey: 'a.entry', keys: ['Cmd+K'], order: 10 },
    ]);
  });

  it('引数なしでも空カタログを返す', () => {
    expect(mergeShortcutCatalogs()).toEqual({ groups: [], entries: [] });
  });
});
