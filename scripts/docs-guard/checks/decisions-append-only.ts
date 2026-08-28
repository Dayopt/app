/**
 * Check: docs/decisions.md の契約
 *
 * `docs/decisions.md` は全決定の時系列索引（単一 append-only ファイル）。
 * `---` 区切りより上（書式・ルール・タグ語彙の説明）は編集を許可し、区切りより下
 * （エントリ領域）は追記のみを許可する。エントリ行の書式（日付・タグ・タグ語彙への
 * 適合）と件数上限（300行）もここで検証する。
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { colors, git, resolveBaseRef, ROOT } from '../config.ts';
import { listGitChanges } from '../git-changes.ts';

export interface DecisionsAppendOnlyViolation {
  file: string;
  reason: string;
}

export const DECISIONS_PATH = 'docs/decisions.md';

const SECTION_MARKER = '\n---\n';
const MAX_ENTRY_LINES = 300;
const ENTRY_LINE_RE = /^- (\d{4}-\d{2}-\d{2}): \[([a-z-]+)\] .+$/;
const RESULT_LINE_RE = /^ {2}結果\((未|\d{4}-\d{2}-\d{2})\): .*$/;

interface RunDecisionsAppendOnlyGuardOptions {
  baseRef?: string;
  root?: string;
}

/**
 * `---` 区切りでヘッダ（編集可）とエントリ領域（追記のみ）を分ける。
 * 区切りが見つからなければ全体をエントリ領域として扱う（fail-safe:
 * 区切りを消して制約を回避しようとする diff を締め出す側に倒す）。
 */
export function splitSections(content: string): { header: string; entries: string } {
  const index = content.indexOf(SECTION_MARKER);
  if (index === -1) return { header: '', entries: content };
  return {
    header: content.slice(0, index + SECTION_MARKER.length),
    entries: content.slice(index + SECTION_MARKER.length),
  };
}

/**
 * ヘッダの「## タグ語彙」見出し以降で最初に現れる非空行から `[tag]` トークンを抽出する。
 * 見出し直後に空行が挟まる場合（prettier の markdown 整形）にも対応する。
 */
export function parseTagVocabulary(header: string): string[] {
  const headingIndex = header.indexOf('## タグ語彙');
  if (headingIndex === -1) return [];
  const linesAfterHeading = header.slice(headingIndex).split('\n').slice(1);
  const tagLine = linesAfterHeading.find((line) => line.trim() !== '');
  if (tagLine === undefined) return [];
  return [...tagLine.matchAll(/\[([a-z-]+)\]/g)]
    .map((m) => m[1])
    .filter((tag): tag is string => tag !== undefined);
}

/**
 * 末尾の改行が作る空要素を除いた行配列にする（末尾 `\n` の有無で行数がずれるのを防ぐ）。
 */
function toLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** エントリ領域が「既存行そのまま + 新規行の追記」の形かどうか（削除・変更があれば true）。 */
export function hasRemovedOrModifiedEntryLines(oldEntries: string, newEntries: string): boolean {
  const oldLines = toLines(oldEntries);
  const newLines = toLines(newEntries);
  if (newLines.length < oldLines.length) return true;
  for (const [i, oldLine] of oldLines.entries()) {
    if (newLines[i] !== oldLine) return true;
  }
  return false;
}

export interface EntryFormatViolation {
  reason: string;
}

/** エントリ領域の書式（エントリ行 / 結果継続行 / 空行のみ）・タグ語彙・件数上限を検証する。 */
export function validateEntryFormat(
  entries: string,
  tagVocabulary: readonly string[],
): EntryFormatViolation[] {
  const violations: EntryFormatViolation[] = [];
  const lines = entries.split('\n');
  let entryCount = 0;
  let precedingIsEntry = false;

  for (const line of lines) {
    if (line === '') {
      precedingIsEntry = false;
      continue;
    }

    const entryMatch = line.match(ENTRY_LINE_RE);
    if (entryMatch) {
      entryCount++;
      const tag = entryMatch[2];
      if (tag !== undefined && !tagVocabulary.includes(tag)) {
        violations.push({ reason: `未知のタグ [${tag}]（タグ語彙に無い）: ${line}` });
      }
      precedingIsEntry = true;
      continue;
    }

    if (RESULT_LINE_RE.test(line)) {
      if (!precedingIsEntry) {
        violations.push({ reason: `結果行がエントリ行に続いていない: ${line}` });
      }
      continue;
    }

    violations.push({
      reason: `エントリ行の書式（"- YYYY-MM-DD: [タグ] ..."）に一致しない: ${line}`,
    });
    precedingIsEntry = false;
  }

  if (entryCount > MAX_ENTRY_LINES) {
    violations.push({
      reason: `エントリ数が${entryCount}件で上限${MAX_ENTRY_LINES}件を超過（docs/decisions/2026.md 等への年別分割を検討する）`,
    });
  }

  return violations;
}

export function runDecisionsAppendOnlyGuard({
  baseRef = resolveBaseRef(),
  root = ROOT,
}: RunDecisionsAppendOnlyGuardOptions = {}): DecisionsAppendOnlyViolation[] {
  const runGit = (args: string): string =>
    root === ROOT ? git(args) : execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
  const mergeBase = runGit(`merge-base ${baseRef} HEAD`).trim();
  const violations: DecisionsAppendOnlyViolation[] = [];

  const changes = listGitChanges('docs', { baseRef, root }).filter(
    (change) => change.path === DECISIONS_PATH || change.oldPath === DECISIONS_PATH,
  );

  for (const change of changes) {
    if (change.status === 'deleted') {
      violations.push({
        file: DECISIONS_PATH,
        reason: '決定ログ（append-only 索引）を削除している',
      });
      continue;
    }

    if (change.status === 'renamed') {
      violations.push({
        file: change.oldPath ?? DECISIONS_PATH,
        reason: `決定ログ（append-only 索引）をrenameしている: ${change.path}`,
      });
      continue;
    }

    let newContent: string;
    try {
      newContent = readFileSync(join(root, DECISIONS_PATH), 'utf8');
    } catch {
      continue; // status !== deleted のはずだが、読めない場合は他のcheckに委ねる
    }
    const { header: newHeader, entries: newEntries } = splitSections(newContent);

    if (change.status !== 'added') {
      let oldContent = '';
      try {
        oldContent = runGit(`show ${mergeBase}:${DECISIONS_PATH}`);
      } catch {
        oldContent = '';
      }
      // 旧ファイルが `---` 区切りを持たない（= 本ヘッダ/エントリ契約導入前の旧形式）場合は、
      // この PR がその移行そのものなので全面書き換えを一度だけ許可する。移行後は main 側の
      // decisions.md が区切りを持つため、この分岐は以後のPRでは通らない。
      const oldHadMarker = oldContent.includes(SECTION_MARKER);
      if (oldHadMarker) {
        const { entries: oldEntries } = splitSections(oldContent);
        if (hasRemovedOrModifiedEntryLines(oldEntries, newEntries)) {
          violations.push({
            file: DECISIONS_PATH,
            reason: '既存エントリ行の削除・変更を検出（`---` 区切りより下は追記のみ許可）',
          });
        }
      }
    }

    const tagVocabulary = parseTagVocabulary(newHeader);
    for (const violation of validateEntryFormat(newEntries, tagVocabulary)) {
      violations.push({ file: DECISIONS_PATH, reason: violation.reason });
    }
  }

  return violations;
}

export function reportDecisionsAppendOnlyGuard(
  violations: DecisionsAppendOnlyViolation[],
): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} decisions.md ガード: 違反なし`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} decisions.md ガード: ${violations.length}件`);
  for (const violation of violations) {
    console.log(`  ${colors.yellow}${violation.file}${colors.reset}: ${violation.reason}`);
  }
  return false;
}
