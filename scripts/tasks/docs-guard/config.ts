import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = resolve(__dirname, '../../..');
export const DOCS_DIR = resolve(ROOT, 'docs');

// status / last_verified が必須の stock domain。
// 2026-08-10: marketing ドメインは廃止し business へ統合したため削除
// （docs/marketing/* は git mv 済みで docs/business/* 配下に存在しない）。
export const STOCK_DIRS = ['business', 'product', 'engineering', 'operations', 'company'];

// STOCK_DIRS はドメインサブディレクトリ単位で stock 契約を適用するための allowlist。
// docs ルート直下へ昇格した個別ファイルはドメインを持たないため、ここに明示する。
export const ROOT_STOCK_FILES = ['docs/strategy.md'];

// 手書きfrontmatterを付けないgenerated file。完全一致だけを例外にする。
export const GENERATED_DOCS = ['docs/engineering/data/db/rls-snapshot.md'];

export const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/** 存在する最初の base ref を返す（CI では origin/main、ローカルでは main にフォールバック）。 */
export function resolveBaseRef(): string {
  const candidates = [process.env.DOCS_GUARD_BASE_REF, 'origin/main', 'main'].filter(
    (v): v is string => Boolean(v),
  );

  for (const ref of candidates) {
    try {
      execSync(`git rev-parse --verify ${ref}`, { cwd: ROOT, stdio: 'ignore' });
      return ref;
    } catch {
      continue;
    }
  }

  throw new Error('base ref (origin/main / main) が解決できません');
}

export function git(args: string): string {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf-8' });
}
