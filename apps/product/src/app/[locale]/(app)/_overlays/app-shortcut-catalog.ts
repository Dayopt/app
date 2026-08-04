import { CALENDAR_SHORTCUT_CATALOG } from '@/features/calendar';
import { mergeShortcutCatalogs, type ShortcutCatalog } from '@/lib/keyboard/shortcut-catalog';

/**
 * どのページでも有効なショートカットの宣言。
 *
 * lib/keyboard/ には置かない。あちらは型・合成・キー処理という機構だけを持つ層で、
 * 「このアプリにどのショートカットがあるか」「そのラベルがどの翻訳 namespace に
 * あるか」は app 側の content にあたる。lib に置くと lib が feature の翻訳キーへ
 * 依存し、キー名の変更が実行時にしか露見しなくなる。
 */
const GLOBAL_SHORTCUT_CATALOG: ShortcutCatalog = {
  groups: [
    {
      id: 'general',
      labelKey: 'shortcuts.groups.general',
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

/**
 * app全体のショートカットカタログ。
 *
 * global（どのページでも有効）と calendar（calendar画面専用）の宣言を合成する。
 * lib/ は features/ を import できないため、合成はこの Composition Layer で行う。
 */
export const APP_SHORTCUT_CATALOG = mergeShortcutCatalogs(
  GLOBAL_SHORTCUT_CATALOG,
  CALENDAR_SHORTCUT_CATALOG,
);
