import { CALENDAR_SHORTCUT_CATALOG } from '@/features/calendar';
import { GLOBAL_SHORTCUT_CATALOG } from '@/lib/keyboard/global-shortcut-catalog';
import { mergeShortcutCatalogs } from '@/lib/keyboard/shortcut-catalog';

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
