/**
 * Global Shortcut Catalog
 *
 * どのページでも有効なショートカットの宣言。calendar画面専用の宣言は
 * features/calendar/keyboard/calendar-shortcut-catalog.ts を参照。
 */

import type { ShortcutCatalog } from './shortcut-catalog';

export const GLOBAL_SHORTCUT_CATALOG: ShortcutCatalog = {
  groups: [
    {
      id: 'general',
      labelKey: 'calendar.shortcuts.groups.general',
      scope: 'global',
      order: 0,
    },
  ],
  entries: [
    {
      groupId: 'general',
      labelKey: 'calendar.shortcuts.actions.open',
      keys: ['Shift+?'],
      order: 0,
    },
    {
      groupId: 'general',
      labelKey: 'calendar.shortcuts.actions.openSearch',
      keys: ['Cmd+K'],
      order: 10,
    },
  ],
};
