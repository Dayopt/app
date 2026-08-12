/**
 * Check: log immutability
 *
 * base refからworking treeまで（committed / staged / unstaged / untracked）を検査する。
 * 新規fileは許可し、既存fileはsupersede metadataの追記以外を拒否する。
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  APPEND_ONLY_DIRS,
  colors,
  FORBIDDEN_LOG_ALIASES,
  git,
  resolveBaseRef,
  ROOT,
} from '../config.ts';
import { listGitChanges } from '../git-changes.ts';
import {
  isFrontmatterPartialCorrectionAddition,
  isFrontmatterSupersededByAddition,
  usesFrozenLogContract,
} from './frontmatter-check.ts';

export interface AppendOnlyViolation {
  file: string;
  reason: string;
}

interface RunAppendOnlyGuardOptions {
  baseRef?: string;
  root?: string;
}

const SUPERSEDED_BY_LINE_RE = /^\+superseded_by:\s*\S+\s*$/;
const LEGACY_STATUS_LINE_RE = /^\+status:\s*superseded\s*$/;
// 部分訂正: 主題は生きているが1行/1節だけが後の変更で誤りになったケース用
// （#1939）。superseded_byは「log全体を後継へ差し替え」専用で、部分訂正には強すぎる
// （全体が引用不可になる）ため、日付+slug付きの新規keyを都度1本追記する形にする。
// key自体が呼ぶたびに変わるので、追記のたびに新しい行を1本足すだけで済み、
// 既存keyの上書き（削除+追加）はisSupersedeOnlyDiffの「削除行があれば拒否」で防げる。
export const PARTIAL_CORRECTION_KEY_RE =
  /^partially_superseded_\d{4}_\d{2}_\d{2}_[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PARTIAL_CORRECTION_LINE_RE = new RegExp(
  `^\\+${PARTIAL_CORRECTION_KEY_RE.source.slice(1, -1)}:\\s*\\S+\\s*$`,
);

interface SupersedeDiffOptions {
  allowLegacyStatus?: boolean;
}

// diffが「削除行なしで、追加行がちょうど1本」の形かを判定し、その1本を返す。
// 形に合わなければundefined（isSupersedeOnlyDiff / isPartialCorrectionDiffの両方が
// 同じ形の判定を共有するための抽出）。
function extractSingleAddition(diff: string): string | undefined {
  const lines = diff.split('\n');
  const additions: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('-')) return undefined;

    if (line.startsWith('+')) additions.push(line);
  }

  return additions.length === 1 ? additions[0] : undefined;
}

export function isSupersedeOnlyDiff(
  diff: string,
  { allowLegacyStatus = true }: SupersedeDiffOptions = {},
): boolean {
  const addition = extractSingleAddition(diff);
  if (addition === undefined) return false;
  return (
    SUPERSEDED_BY_LINE_RE.test(addition) ||
    PARTIAL_CORRECTION_LINE_RE.test(addition) ||
    (allowLegacyStatus && LEGACY_STATUS_LINE_RE.test(addition))
  );
}

// 部分訂正のkeyパターンで許可された diff かどうか。legacy log でも frontmatter 内の
// 新規key追加であることまで確認させるため、isSupersedeOnlyDiffとは別に判定する
// （#1939のP2、Codexレビューで検出: diff shapeの正規表現だけで許可すると、
// legacy logの本文へ同じ形の行を足すだけで append-only を迂回できた）。
function isPartialCorrectionDiff(diff: string): boolean {
  const addition = extractSingleAddition(diff);
  return addition !== undefined && PARTIAL_CORRECTION_LINE_RE.test(addition);
}

function isLogPath(path: string): boolean {
  return APPEND_ONLY_DIRS.some((directory) => path.startsWith(`${directory}/`));
}

// rename元がdomain再編で削除されたappend-onlyディレクトリ（例: 廃止domainのlog/）である
// ケースを許可するため、現在のAPPEND_ONLY_DIRSに依存しない構造ベースの判定を使う。
// 「docs/<domain>/log/」配下という形はappend-only logの命名規約そのものなので、
// 現在有効なdirectory一覧に無くてもrename元としては安全に判定できる。
const DOMAIN_LOG_DIR_RE = /^docs\/[^/]+\/log\//;

function looksLikeDomainLogPath(path: string): boolean {
  return DOMAIN_LOG_DIR_RE.test(path);
}

export function runAppendOnlyGuard({
  baseRef = resolveBaseRef(),
  root = ROOT,
}: RunAppendOnlyGuardOptions = {}): AppendOnlyViolation[] {
  const runGit = (args: string): string =>
    root === ROOT ? git(args) : execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
  const mergeBase = runGit(`merge-base ${baseRef} HEAD`).trim();
  const violations: AppendOnlyViolation[] = [];

  for (const change of listGitChanges('docs', { baseRef, root })) {
    // rename検出と同じ理由で、deleteされた側（change.path）にも構造ベースの判定を使う。
    // `--find-renames` の類似度が閾値（既定50%）を下回ると、git は 1 回の move を
    // 「旧pathのD + 新pathのA」に分解して返す。isLogPath だけで判定すると、旧domainの
    // log dir が APPEND_ONLY_DIRS から既に外れている場合（例: 廃止domainのlog/）に
    // D側がtouchesLog=falseとしてスキップされ、A側は新規fileとして無条件許可される。
    // 結果、大幅に書き換えた内容を「move」に偽装して凍結logを改変できてしまう
    // （バイト一致するrenameは常に閾値を超えて `R` として検出されるため、この抜け道は
    // 内容が実際に変わったケースにしか成立せず、構造判定を広げても正当なrenameは壊れない）。
    const touchesLog =
      looksLikeDomainLogPath(change.path) ||
      (change.oldPath ? looksLikeDomainLogPath(change.oldPath) : false);
    if (!touchesLog) continue;

    if (change.status === 'added') continue;

    if (change.status === 'deleted' && FORBIDDEN_LOG_ALIASES.includes(change.path)) {
      continue;
    }

    if (change.status === 'deleted') {
      violations.push({ file: change.path, reason: '凍結済みlogを削除している' });
      continue;
    }

    if (change.status === 'renamed') {
      // append-only ディレクトリ間の同名 rename（domain 再編での git mv 等）は、
      // 中身が1バイトも変わっていない場合に限り許可する。ファイル名変更や内容変更を
      // 伴う rename は従来どおり拒否する（append-only の目的＝本文の書き換え禁止を保つ）。
      const oldPath = change.oldPath;
      const isSameNameAppendOnlyRename =
        oldPath !== undefined &&
        looksLikeDomainLogPath(oldPath) &&
        isLogPath(change.path) &&
        basename(oldPath) === basename(change.path);

      if (isSameNameAppendOnlyRename && oldPath !== undefined) {
        const previousContent = runGit(`show ${mergeBase}:"${oldPath}"`);
        const currentContent = readFileSync(resolve(root, change.path), 'utf8');
        if (previousContent === currentContent) continue;
      }

      violations.push({
        file: change.oldPath ?? change.path,
        reason: `凍結済みlogをrenameしている: ${change.path}`,
      });
      continue;
    }

    const diff = runGit(`diff -U0 ${mergeBase} -- "${change.path}"`);
    const previousContent = runGit(`show ${mergeBase}:"${change.path}"`);
    const usesFrozenContract = usesFrozenLogContract(previousContent, change.path);
    const hasAllowedDiff = isSupersedeOnlyDiff(diff, {
      allowLegacyStatus: !usesFrozenContract,
    });

    if (hasAllowedDiff) {
      const isPartialCorrection = isPartialCorrectionDiff(diff);

      if (isPartialCorrection) {
        // 部分訂正は新契約・旧契約を問わず、frontmatter内の新規keyであることまで
        // 確認する（legacy logのshortcutに乗せない）。
        const currentContent = readFileSync(resolve(root, change.path), 'utf8');
        if (isFrontmatterPartialCorrectionAddition(previousContent, currentContent)) continue;
      } else if (!usesFrozenContract) {
        continue;
      } else {
        const currentContent = readFileSync(resolve(root, change.path), 'utf8');
        if (isFrontmatterSupersededByAddition(previousContent, currentContent)) continue;
      }
    }

    violations.push({
      file: change.path,
      reason: usesFrozenContract
        ? '新契約logの変更はfrontmatterへのsuperseded_by追記だけ許可'
        : 'legacy logの変更はsuperseded_byまたはstatus: supersededの単一行追記だけ許可',
    });
  }

  return violations;
}

export function reportAppendOnlyGuard(violations: AppendOnlyViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} log凍結ガード: 違反なし`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} log凍結ガード: ${violations.length}件`);
  for (const violation of violations) {
    console.log(`  ${colors.yellow}${violation.file}${colors.reset}: ${violation.reason}`);
  }
  return false;
}
