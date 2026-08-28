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
 *
 * 各ドメイン log/ の「凍結された過去の記録」に対する soft warning 扱い（append-only ゆえ
 * リンク切れを直せない）は、domain log/ 全廃（2026-08-28、#2475）に伴い撤去した。今は
 * 全リンク切れを fatal として扱う。
 */

import { glob } from 'glob';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { colors, DOCS_DIR, ROOT } from '../config.ts';

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

function printViolations(violations: LinkViolation[]): void {
  for (const violation of violations) {
    console.log(
      `  ${colors.yellow}${relative(ROOT, violation.file)}${colors.reset} -> ${violation.target}`,
    );
  }
}

export function reportLinkCheck(violations: LinkViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} リンク切れ: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} リンク切れ: ${violations.length}件`);
  printViolations(violations);
  return false;
}
