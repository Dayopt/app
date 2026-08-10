/**
 * Check: リンク切れ
 *
 * docs/ 配下の全 .md を markdown parser で AST にし、リンク先ファイルの存在を検証する。
 * 外部URL（http/https）・アンカーのみ（#...）・Storybook deep-link（?path=...）はスキップする。
 *
 * 抽出に正規表現を使わないのは、コード例と実リンクを区別するため。code span / code fence /
 * indented code block の中身は `inlineCode` / `code` ノードになりリンクとして現れないので、
 * 「コード例に書いた markdown 記法をリンク切れとして報告する」誤検知が構造的に起きない。
 * 手書きで除去しようとすると fence の run 長・indent 上限・blockquote prefix・backtick run の
 * 一致・4-space indented code と CommonMark の規則を際限なく追う必要があった（PR #1884 で実証）。
 */

import { glob } from 'glob';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  colors,
  DOCS_DIR,
  type FrozenBrokenLink,
  KNOWN_FROZEN_BROKEN_LINKS,
  LINK_CHECK_SOFT_DIRS,
  ROOT,
} from '../config.ts';

const FROZEN_LINK_INVENTORY = 'docs/engineering/log/2026-08-10-frozen-log-link-inventory.md';

/** url を持つ mdast ノード。`definition` は reference-style リンク（`[ref]: path`）の定義側。 */
const URL_NODE_TYPES = new Set(['link', 'image', 'definition']);

/**
 * AST を辿ってリンク先を集める。
 *
 * `unknown` + 型ガードで歩くのは、@types/mdast の union を narrowing するより単純で、
 * 型定義の解決状況に依存しないため（`scripts/` は pnpm typecheck の対象外）。
 */
export function collectLinkTargets(node: unknown, out: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return out;

  const candidate = node as { type?: unknown; url?: unknown; children?: unknown };

  if (typeof candidate.type === 'string' && URL_NODE_TYPES.has(candidate.type)) {
    if (typeof candidate.url === 'string') out.push(candidate.url);
  }

  if (Array.isArray(candidate.children)) {
    for (const child of candidate.children) collectLinkTargets(child, out);
  }

  return out;
}

export interface LinkViolation {
  file: string;
  target: string;
}

export interface LinkCheckClassification {
  /** stock 側のリンク切れ。CI を落とす。 */
  fatal: LinkViolation[];
  /** 凍結 log 内で、除外リストに登録済みのリンク切れ。 */
  knownFrozen: LinkViolation[];
  /** 凍結 log 内で、除外リストに無いリンク切れ。新規の破損を意味する。 */
  unregisteredFrozen: LinkViolation[];
  /** 除外リストにあるが、現在は解決するため不要になったエントリ。 */
  staleAllowlistEntries: FrozenBrokenLink[];
}

/** repo path として解決しないリンクを判定する。 */
export function shouldSkipLinkTarget(raw: string): boolean {
  return (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('mailto:') ||
    raw.startsWith('#') ||
    raw.startsWith('?')
  );
}

export async function runLinkCheck(): Promise<LinkViolation[]> {
  const files = await glob('**/*.md', { cwd: DOCS_DIR, absolute: true });
  const violations: LinkViolation[] = [];

  for (const file of files) {
    const tree = fromMarkdown(readFileSync(file, 'utf-8'));

    for (const raw of collectLinkTargets(tree)) {
      if (shouldSkipLinkTarget(raw)) continue;

      const target = raw.split('#')[0];
      if (!target) continue;

      // percent-encode された link destination は docs/ に 0 件のため decode しない
      // （decodeURIComponent は不正な列で throw するので、必要になるまで経路を作らない）。
      const resolved = resolve(dirname(file), target);
      if (!existsSync(resolved)) {
        violations.push({ file, target: raw });
      }
    }
  }

  return violations;
}

function isSoft(file: string): boolean {
  const rel = relative(ROOT, file);
  return LINK_CHECK_SOFT_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function matches(violation: LinkViolation, known: FrozenBrokenLink): boolean {
  return relative(ROOT, violation.file) === known.source && violation.target === known.target;
}

/**
 * append-only ディレクトリ（各ドメインの log/）内のリンク切れは「凍結された過去の記録」であり、
 * 後から書き換えて直すことができない（append-only guard と矛盾する）。そのため CI の exit code
 * には影響させない。
 *
 * ただし件数だけを出すと、新しく壊れた 1 件が既知分に埋もれて誰も気づかない。既知分は
 * KNOWN_FROZEN_BROKEN_LINKS で除外し、**未登録のものだけを内訳付きで報告**することで
 * 「増えたら調べる」を実際に機能させる。
 */
export function classifyLinkViolations(violations: LinkViolation[]): LinkCheckClassification {
  const fatal = violations.filter((v) => !isSoft(v.file));
  const soft = violations.filter((v) => isSoft(v.file));

  const knownFrozen = soft.filter((v) => KNOWN_FROZEN_BROKEN_LINKS.some((k) => matches(v, k)));
  const unregisteredFrozen = soft.filter(
    (v) => !KNOWN_FROZEN_BROKEN_LINKS.some((k) => matches(v, k)),
  );
  const staleAllowlistEntries = KNOWN_FROZEN_BROKEN_LINKS.filter(
    (k) => !soft.some((v) => matches(v, k)),
  );

  return { fatal, knownFrozen, unregisteredFrozen, staleAllowlistEntries };
}

function printViolations(violations: LinkViolation[]): void {
  for (const violation of violations) {
    console.log(
      `  ${colors.yellow}${relative(ROOT, violation.file)}${colors.reset} -> ${violation.target}`,
    );
  }
}

export function reportLinkCheck(violations: LinkViolation[]): boolean {
  const { fatal, knownFrozen, unregisteredFrozen, staleAllowlistEntries } =
    classifyLinkViolations(violations);

  if (knownFrozen.length > 0) {
    // 同じ (source, target) が 1 ファイル内に複数回出るため、箇所数と除外リストの
    // エントリ数は一致しない。両方出さないと「除外リストが 15 件ある」と誤読される。
    const pairs = new Set(knownFrozen.map((v) => `${relative(ROOT, v.file)} ${v.target}`)).size;
    console.log(
      `${colors.yellow}⚠${colors.reset} リンク切れ（append-only・既知の凍結分）: ` +
        `${knownFrozen.length}箇所 / 除外リスト ${pairs}ペア（後継先は ${FROZEN_LINK_INVENTORY}）`,
    );
  }

  if (unregisteredFrozen.length > 0) {
    console.log(
      `${colors.yellow}⚠${colors.reset} リンク切れ（append-only・除外リスト未登録）: ${unregisteredFrozen.length}件` +
        ` — stock 側の移動が過去の記録を壊した可能性がある`,
    );
    printViolations(unregisteredFrozen);
  }

  if (staleAllowlistEntries.length > 0) {
    console.log(
      `${colors.yellow}⚠${colors.reset} 除外リストの陳腐化: ${staleAllowlistEntries.length}件` +
        ` — 現在は解決するため config の KNOWN_FROZEN_BROKEN_LINKS から削除する`,
    );
    for (const entry of staleAllowlistEntries) {
      console.log(`  ${colors.yellow}${entry.source}${colors.reset} -> ${entry.target}`);
    }
  }

  if (fatal.length === 0) {
    console.log(`${colors.green}✓${colors.reset} リンク切れ（ストック側）: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} リンク切れ: ${fatal.length}件`);
  printViolations(fatal);
  return false;
}
