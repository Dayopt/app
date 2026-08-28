/**
 * Check: 命名規約
 *
 * docs/ 配下のファイル名が kebab-case であること。ログの日付・連番プレフィックス
 * （2026-06-15-foo.md / 011-foo.md / 2026-06.md 等）は数字を含む kebab-case として許容する。
 * README.md 等の慣例的な大文字ファイル名は例外とする。
 */

import { glob } from 'glob';
import { basename, extname } from 'node:path';
import { colors, DOCS_DIR } from '../config.ts';

const ALLOWED_UPPERCASE_STEMS = new Set(['readme', 'license', 'changelog']);
// 数字始まり（日付・連番プレフィックス）も含めた kebab-case
const KEBAB_RE = /^[0-9a-z]+(-[0-9a-z]+)*$/;

export interface NamingViolation {
  file: string;
  reason: string;
}

export async function runNamingCheck(): Promise<NamingViolation[]> {
  const files = await glob('**/*.md', { cwd: DOCS_DIR, absolute: true });
  const violations: NamingViolation[] = [];

  for (const file of files) {
    const name = basename(file);
    const stem = basename(file, extname(file));

    if (ALLOWED_UPPERCASE_STEMS.has(stem.toLowerCase())) continue;

    if (!KEBAB_RE.test(stem)) {
      violations.push({ file, reason: `"${name}" が kebab-case ではない` });
    }
  }

  return violations;
}

export function reportNamingCheck(violations: NamingViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} 命名規約チェック: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} 命名規約チェック: ${violations.length}件`);
  for (const v of violations) {
    console.log(`  ${colors.yellow}${v.file}${colors.reset}: ${v.reason}`);
  }
  return false;
}
