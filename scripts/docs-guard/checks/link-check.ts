/**
 * Check: リンク切れ
 *
 * docs/ 配下の全 .md から相対リンクを抽出し、リンク先ファイルの存在を検証する。
 * 外部URL（http/https）・アンカーのみ（#...）・Storybook deep-link（?path=...）はスキップする。
 */

import { glob } from 'glob';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { colors, DOCS_DIR, LINK_CHECK_SOFT_DIRS, ROOT } from '../config.ts';

// 通常の [text](path) と、括弧を含むパス用の [text](<path>) の両方に対応
const LINK_RE = /\[[^\]]*\]\((?:<([^>]+)>|([^)]+))\)/g;

export interface LinkViolation {
  file: string;
  target: string;
}

export async function runLinkCheck(): Promise<LinkViolation[]> {
  const files = await glob('**/*.md', { cwd: DOCS_DIR, absolute: true });
  const violations: LinkViolation[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;

    while ((match = LINK_RE.exec(content)) !== null) {
      const raw = (match[1] ?? match[2]).trim();

      if (
        raw.startsWith('http://') ||
        raw.startsWith('https://') ||
        raw.startsWith('mailto:') ||
        raw.startsWith('#') ||
        raw.startsWith('?')
      ) {
        continue;
      }

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

/**
 * append-only ディレクトリ（log/decisions/notes/journal/sessions）と log/archive/ 内のリンク切れは
 * 「凍結された過去の記録」であり、後から書き換えて直すことができない（Phase 5-4 の
 * append-only guard と矛盾する、あるいは archive/ の経緯記録としての性質と矛盾する）。
 * そのため warning としてのみ報告し、CI の exit code には影響させない。
 */
export function reportLinkCheck(violations: LinkViolation[]): boolean {
  const fatal = violations.filter((v) => !isSoft(v.file));
  const warnings = violations.filter((v) => isSoft(v.file));

  if (warnings.length > 0) {
    console.log(
      `${colors.yellow}⚠${colors.reset} リンク切れ（append-only、警告のみ）: ${warnings.length}件`,
    );
  }

  if (fatal.length === 0) {
    console.log(`${colors.green}✓${colors.reset} リンク切れ（ストック側）: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} リンク切れ: ${fatal.length}件`);
  for (const v of fatal) {
    console.log(`  ${colors.yellow}${v.file}${colors.reset} -> ${v.target}`);
  }
  return false;
}
