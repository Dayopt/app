/**
 * ungroupTags 操作で使う pure transformation。
 *
 * Service 層 (`features/tags/server/tag-service.ts`) の `ungroupTags()` から
 * DB 非依存の純粋なロジックだけを切り出している。
 */

import { parseColonTag } from './tag-colon';

export interface TagSuffixEntry<TTag> {
  /** 元のタグ（DB row） */
  tag: TTag;
  /** コロン以降の suffix。コロンが無ければタグ名全体 */
  suffix: string;
}

/**
 * `prefix:xxx` 形式のタグ群から、各タグの suffix を算出する。
 *
 * @example
 *   extractTagSuffixes([{ name: 'Work:api' }, { name: 'Work:web' }])
 *   → [{ tag, suffix: 'api' }, { tag, suffix: 'web' }]
 */
export function extractTagSuffixes<TTag extends { name: string }>(
  tags: readonly TTag[],
): Array<TagSuffixEntry<TTag>> {
  return tags.map((tag) => {
    const { suffix } = parseColonTag(tag.name);
    return {
      tag,
      suffix: suffix ?? tag.name,
    };
  });
}

export interface PartitionedSuffixes<TTag> {
  /** 同名の既存タグが存在するため衝突するエントリ */
  conflicts: Array<TagSuffixEntry<TTag>>;
  /** 衝突なしでそのままリネームできるエントリ */
  nonConflicts: Array<TagSuffixEntry<TTag>>;
}

/**
 * suffix を持つエントリ群を、既存タグ名との衝突有無で分類する。
 *
 * @param entries `extractTagSuffixes` の結果
 * @param existingNames 既存タグの名前集合（`Map` の場合は `has(suffix)` を利用）
 */
export function partitionByExistingName<TTag>(
  entries: ReadonlyArray<TagSuffixEntry<TTag>>,
  existingNames: { has(name: string): boolean },
): PartitionedSuffixes<TTag> {
  const conflicts: Array<TagSuffixEntry<TTag>> = [];
  const nonConflicts: Array<TagSuffixEntry<TTag>> = [];
  for (const entry of entries) {
    if (existingNames.has(entry.suffix)) {
      conflicts.push(entry);
    } else {
      nonConflicts.push(entry);
    }
  }
  return { conflicts, nonConflicts };
}
