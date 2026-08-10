/**
 * Check: リンク切れ
 *
 * docs/ 配下の全 .md から相対リンクを抽出し、リンク先ファイルの存在を検証する。
 * 外部URL（http/https）・アンカーのみ（#...）・Storybook deep-link（?path=...）・
 * 公開サイトの root 相対 URL（/docs/...）はスキップする。
 */

import { glob } from 'glob';
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

// 通常の [text](path) と、括弧を含むパス用の [text](<path>) の両方に対応
const LINK_RE = /\[[^\]]*\]\((?:<([^>]+)>|([^)]+))\)/g;

const FROZEN_LINK_INVENTORY = 'docs/engineering/log/2026-08-10-frozen-log-link-inventory.md';

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

/** 公開サイトの route は拡張子を持たないため、`.md` / `.mdx` 終わりは repo path の意図と見なす。 */
const MARKDOWN_SUFFIX_RE = /\.mdx?(#.*)?$/;

/**
 * repo path として解決しないリンクを判定する。
 *
 * `/` 始まりは公開サイト（apps/web）の root 相対 URL であって repo path ではない。これを
 * resolve するとファイルシステムの root から探してしまい、必ず存在しないと判定される
 * （docs/marketing/log/2026-07-27-docs-faq-url-nesting.md の `/docs/faq/features` で実際に発生）。
 *
 * ただし `/docs/foo.md` のように `.md` で終わるものは skip しない。これは公開サイトの URL では
 * なく repo path の書き間違い（GitHub 上でも解決しない）なので、黙って通すと検出漏れになる。
 */
export function shouldSkipLinkTarget(raw: string): boolean {
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('mailto:') ||
    raw.startsWith('#') ||
    raw.startsWith('?')
  ) {
    return true;
  }

  return raw.startsWith('/') && !MARKDOWN_SUFFIX_RE.test(raw);
}

export async function runLinkCheck(): Promise<LinkViolation[]> {
  const files = await glob('**/*.md', { cwd: DOCS_DIR, absolute: true });
  const violations: LinkViolation[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;

    while ((match = LINK_RE.exec(content)) !== null) {
      const raw = (match[1] ?? match[2]).trim();

      if (shouldSkipLinkTarget(raw)) continue;

      const target = raw.split('#')[0];
      if (!target) continue;

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
    console.log(
      `${colors.yellow}⚠${colors.reset} リンク切れ（append-only・既知の凍結分）: ${knownFrozen.length}件` +
        `（後継先は ${FROZEN_LINK_INVENTORY}）`,
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
