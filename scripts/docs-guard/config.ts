import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = resolve(__dirname, '../..');
export const DOCS_DIR = resolve(ROOT, 'docs');

// frontmatter (status / last_verified) が必須のストック対象ディレクトリ。
// 各ドメイン直下の log/ はログ・時点もの・append-only系のため対象外。
export const FRONTMATTER_REQUIRED_DIRS = [
  'business',
  'product',
  'marketing',
  'engineering',
  'operations',
  'company',
];

// 書き換え禁止（append-only）対象ディレクトリ。各ドメインの log/latest.md のみ例外で上書き可。
export const APPEND_ONLY_DIRS = [
  'docs/business/log',
  'docs/product/log',
  'docs/marketing/log',
  'docs/engineering/log',
  'docs/operations/log',
  'docs/company/log',
];
export const APPEND_ONLY_EXCLUDE = ['docs/engineering/log/latest.md'];

// リンク切れチェックで「凍結された過去の記録」として warning 扱いにするディレクトリ。
export const LINK_CHECK_SOFT_DIRS = [...APPEND_ONLY_DIRS];

// frontmatter 必須チェックから除外するファイル（グロブではなく完全一致 or 前方一致）。
// secrets.md: サンドボックス権限で編集不可（フォローアップ課題）。
// releases/notes-v*.md: 発行時点で凍結される release note スナップショット（journal 相当）。
// data/db/rls-snapshot.md: scripts/generate-rls-snapshot.ts の自動生成物。手で編集しない前提で
// frontmatterを持たせると `pnpm rls:snapshot:check`（Integration Tests）がdriftとして検知する。
export const FRONTMATTER_EXCLUDE = [
  'docs/operations/secrets.md',
  'docs/engineering/data/db/rls-snapshot.md',
];
export const FRONTMATTER_EXCLUDE_PATTERNS = [/^docs\/operations\/releases\/notes-v[\d.]+\.md$/];

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
