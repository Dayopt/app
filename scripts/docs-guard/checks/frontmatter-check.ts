/**
 * Check: frontmatter必須
 *
 * ストック対象ディレクトリ（business/ product/ marketing/ engineering/ operations/
 * company/）配下の .md に status / last_verified frontmatter があること。
 * 各ドメイン直下の log/（append-only）と README系ファイルは除外する。
 */

import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import {
  colors,
  DOCS_DIR,
  FRONTMATTER_EXCLUDE,
  FRONTMATTER_EXCLUDE_PATTERNS,
  FRONTMATTER_REQUIRED_DIRS,
  ROOT,
} from '../config.ts';

export interface FrontmatterViolation {
  file: string;
  reason: string;
}

function isReadme(file: string): boolean {
  return /^readme\.md$/i.test(basename(file)) || /^index\.md$/i.test(basename(file));
}

function isLog(file: string): boolean {
  const rel = relative(ROOT, file).split('/');
  return rel.includes('log');
}

function isExcluded(file: string): boolean {
  const rel = relative(ROOT, file);
  if (FRONTMATTER_EXCLUDE.includes(rel)) return true;
  return FRONTMATTER_EXCLUDE_PATTERNS.some((re) => re.test(rel));
}

export async function runFrontmatterCheck(): Promise<FrontmatterViolation[]> {
  const violations: FrontmatterViolation[] = [];

  for (const dir of FRONTMATTER_REQUIRED_DIRS) {
    const files = await glob('**/*.md', { cwd: `${DOCS_DIR}/${dir}`, absolute: true });

    for (const file of files) {
      if (isReadme(file) || isLog(file) || isExcluded(file)) continue;

      const content = readFileSync(file, 'utf-8');
      if (!content.startsWith('---\n')) {
        violations.push({ file, reason: 'frontmatterがない' });
        continue;
      }

      const end = content.indexOf('\n---', 4);
      const frontmatter = end === -1 ? content : content.slice(0, end);

      const hasStatus = /^status:\s*\S+/m.test(frontmatter);
      const hasLastVerified = /^last_verified:\s*\S+/m.test(frontmatter);

      const missing: string[] = [];
      if (!hasStatus) missing.push('status');
      if (!hasLastVerified) missing.push('last_verified');

      if (missing.length > 0) {
        violations.push({ file, reason: `frontmatterに ${missing.join(', ')} がない` });
      }
    }
  }

  return violations;
}

export function reportFrontmatterCheck(violations: FrontmatterViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} frontmatter必須チェック: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} frontmatter必須チェック: ${violations.length}件`);
  for (const v of violations) {
    console.log(`  ${colors.yellow}${v.file}${colors.reset}: ${v.reason}`);
  }
  return false;
}
