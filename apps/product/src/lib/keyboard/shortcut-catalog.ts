/**
 * Shortcut Catalog
 *
 * 「何が存在するか」を宣言する静的カタログの型と合成関数。
 * キーとハンドラの結び付けは shortcut-registry.ts が持ち、ここでは扱わない。
 */

import type { MessageKey } from '@/lib/i18n';

export interface ShortcutCatalogGroup {
  /** カタログ内で一意なグループ識別子 */
  id: string;
  /** グループ見出しのi18nフルキー */
  labelKey: MessageKey;
  /** このグループが有効な範囲（例: 'global' | 'calendar'） */
  scope: string;
  /** グループの表示順（昇順） */
  order: number;
}

export interface ShortcutCatalogEntry {
  /** 所属する ShortcutCatalogGroup.id */
  groupId: string;
  /** 操作説明のi18nフルキー */
  labelKey: MessageKey;
  /** 表示するキー。複数ある操作は複数要素（例: ['Cmd+1', '1']） */
  keys: string[];
  /** グループ内での表示順（昇順） */
  order: number;
}

export interface ShortcutCatalog {
  groups: ShortcutCatalogGroup[];
  entries: ShortcutCatalogEntry[];
}

/**
 * 複数のカタログを1つに合成する。
 *
 * group は id で重複排除する（先に渡した catalog が優先）。group / entry は
 * どちらも order の昇順で安定ソートする。
 */
export function mergeShortcutCatalogs(...catalogs: ShortcutCatalog[]): ShortcutCatalog {
  const groupsById = new Map<string, ShortcutCatalogGroup>();
  for (const catalog of catalogs) {
    for (const group of catalog.groups) {
      if (!groupsById.has(group.id)) {
        groupsById.set(group.id, group);
      }
    }
  }

  const groups = [...groupsById.values()].sort((a, b) => a.order - b.order);
  const entries = catalogs.flatMap((catalog) => catalog.entries).sort((a, b) => a.order - b.order);

  return { groups, entries };
}
