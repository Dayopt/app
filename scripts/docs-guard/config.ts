import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = resolve(__dirname, '../..');
export const DOCS_DIR = resolve(ROOT, 'docs');

// status / last_verified が必須の stock domain。
export const STOCK_DIRS = [
  'ai',
  'business',
  'product',
  'marketing',
  'engineering',
  'operations',
  'company',
];

// 書き換え禁止対象。新規追加後は frozen とし、supersede metadata 以外を変更しない。
export const APPEND_ONLY_DIRS = [
  'docs/business/log',
  'docs/product/log',
  'docs/marketing/log',
  'docs/engineering/log',
  'docs/operations/log',
  'docs/company/log',
];

// latest alias は履歴を上書きするため禁止する。旧aliasの削除だけmigrationとして許可する。
export const FORBIDDEN_LOG_ALIASES = ['docs/engineering/log/latest.md'];

// リンク切れチェックで「凍結された過去の記録」として warning 扱いにするディレクトリ。
export const LINK_CHECK_SOFT_DIRS = [...APPEND_ONLY_DIRS];

// 手書きfrontmatterを付けないgenerated file。完全一致だけを例外にする。
export const GENERATED_DOCS = ['docs/engineering/data/db/rls-snapshot.md'];

// 命名規約チェックの追加許容パターン（kebab-case の対象外だが正当なもの）。
// リリースノートの semver ファイル名（notes-v0.13.0.md 等）。
// docs/operations/log/YYYY-MM-DD-release-vX.Y.Z.md: リリースノートスナップショット（semver のドットを含む）。
export const NAMING_ALLOW_PATTERNS = [
  /^notes-v\d+\.\d+\.\d+\.md$/,
  /^\d{4}-\d{2}-\d{2}-release-v\d+\.\d+\.\d+\.md$/,
];

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
