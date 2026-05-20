/**
 * コロン記法タグのパース・グルーピングユーティリティ
 *
 * タグ名に「:」を含めることで2階層を表現する。
 * 例: "開発:api" → prefix "開発", suffix "api"
 *     "運動" → prefix "運動", suffix null（階層なし）
 */

import type { Tag } from '../types';

export interface ParsedColonTag {
  /** コロンの前の部分（グループ名）。コロンがなければタグ名全体 */
  prefix: string;
  /** コロンの後の部分。コロンがなければ null */
  suffix: string | null;
}

/**
 * タグ名をコロンで分割する。最初のコロンのみで分割。
 *
 * @example
 * parseColonTag("開発:api")   → { prefix: "開発", suffix: "api" }
 * parseColonTag("開発:api:v2") → { prefix: "開発", suffix: "api:v2" }
 * parseColonTag("運動")        → { prefix: "運動", suffix: null }
 */
export function parseColonTag(name: string): ParsedColonTag {
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    return { prefix: name, suffix: null };
  }
  return {
    prefix: name.slice(0, colonIndex),
    suffix: name.slice(colonIndex + 1),
  };
}

export interface GroupedTags {
  /** コロン接頭辞でグループ化されたタグ（Map<prefix, Tag[]>） */
  grouped: Map<string, Tag[]>;
  /** コロンを含まない単独タグ */
  ungrouped: Tag[];
}

/**
 * タグリストをコロン接頭辞でグルーピングする。
 *
 * 同じ prefix を持つタグが2つ以上ある場合のみグループ化。
 * prefix が1つしかないタグは ungrouped として扱う。
 */
export function groupTagsByPrefix(tags: Tag[]): GroupedTags {
  const prefixMap = new Map<string, Tag[]>();
  const noColonTags: Tag[] = [];

  for (const tag of tags) {
    const { suffix } = parseColonTag(tag.name);
    if (suffix === null) {
      noColonTags.push(tag);
    } else {
      const { prefix } = parseColonTag(tag.name);
      const existing = prefixMap.get(prefix) ?? [];
      existing.push(tag);
      prefixMap.set(prefix, existing);
    }
  }

  // コロン付きだが同じprefixが1つしかないタグはungroupedに移動
  const grouped = new Map<string, Tag[]>();
  for (const [prefix, groupTags] of prefixMap) {
    if (groupTags.length >= 2) {
      grouped.set(prefix, groupTags);
    } else {
      noColonTags.push(...groupTags);
    }
  }

  return { grouped, ungrouped: noColonTags };
}

/**
 * サイドバーやUI表示用のラベルを取得する。
 *
 * グループ内での表示: suffix部分のみ（"api"）
 * グループ外での表示: タグ名全体（"運動" or "開発:api"）
 *
 * @param name タグ名
 * @param inGroup グループ内表示かどうか
 */
export function getTagDisplayLabel(name: string, inGroup = false): string {
  if (!inGroup) return name;
  const { suffix } = parseColonTag(name);
  return suffix ?? name;
}

/**
 * prefix と suffix からコロン記法のタグ名を組み立てる。
 *
 * @example
 * buildColonTagName("開発", "api") → "開発:api"
 * buildColonTagName("運動")        → "運動"
 */
export function buildColonTagName(prefix: string, suffix?: string): string {
  if (!suffix) return prefix;
  return `${prefix}:${suffix}`;
}

/**
 * グループ名とフラットタグの衝突をチェック。
 *
 * - フラットタグ "Work" を作成 → "Work:*" が存在したらtrue
 * - コロンタグ "Work:api" を作成 → フラットタグ "Work" が存在したらtrue
 *
 * @param name - チェック対象の名前
 * @param existingTags - 既存タグ配列
 * @param excludeTagId - 除外するタグID（更新時の自分自身）
 * @returns 衝突がある場合true
 */
export function hasGroupNameConflict(
  name: string,
  existingTags: { id: string; name: string }[],
  excludeTagId?: string,
): boolean {
  const { prefix, suffix } = parseColonTag(name);
  const targets = excludeTagId ? existingTags.filter((t) => t.id !== excludeTagId) : existingTags;

  if (suffix === null) {
    // フラットタグ → 同名prefixのコロンタグが存在するか
    return targets.some((t) => t.name.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  }
  // コロンタグ → 同名prefixのフラットタグが存在するか
  return targets.some((t) => t.name.toLowerCase() === prefix.toLowerCase());
}
