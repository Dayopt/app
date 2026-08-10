import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = resolve(__dirname, '../..');
export const DOCS_DIR = resolve(ROOT, 'docs');

// status / last_verified が必須の stock domain。
// 2026-08-10: marketing ドメインは廃止し business へ統合したため削除
// （docs/marketing/* は git mv 済みで docs/business/* 配下に存在しない）。
export const STOCK_DIRS = ['business', 'product', 'engineering', 'operations', 'company'];

// STOCK_DIRS はドメインサブディレクトリ単位で stock 契約を適用するための allowlist。
// docs ルート直下へ昇格した個別ファイルはドメインを持たないため、ここに明示する。
export const ROOT_STOCK_FILES = ['docs/strategy.md'];

// 書き換え禁止対象。新規追加後は frozen とし、supersede metadata 以外を変更しない。
// 2026-08-10: docs/marketing/log は docs/business/log へ git mv 済みのため削除。
export const APPEND_ONLY_DIRS = [
  'docs/business/log',
  'docs/product/log',
  'docs/engineering/log',
  'docs/operations/log',
  'docs/company/log',
];

// latest alias は履歴を上書きするため禁止する。旧aliasの削除だけmigrationとして許可する。
export const FORBIDDEN_LOG_ALIASES = ['docs/engineering/log/latest.md'];

// リンク切れチェックで「凍結された過去の記録」として warning 扱いにするディレクトリ。
export const LINK_CHECK_SOFT_DIRS = [...APPEND_ONLY_DIRS];

export interface FrozenBrokenLink {
  /** リンク元の凍結 log（repo root からの相対 path）。 */
  source: string;
  /** log 本文に書かれているリンク先の文字列そのまま。 */
  target: string;
}

/**
 * 凍結 log 内の既知のリンク切れ。append-only 契約により後から直せないため恒久的に除外する。
 *
 * 全件が 2026-07 の docs 再編に由来する（後継先の対応表と経緯は
 * docs/engineering/log/2026-08-10-frozen-log-link-inventory.md が正本）。
 *
 * このリストに載っていないリンク切れが log 側に出たら、それは「stock 側の移動で新たに
 * 過去の記録を壊した」合図。除外へ追加する前に、stock 側で移動をやめるか alias を残せない
 * かを先に検討する。追加する場合は後継先をこのリストのコメントに書く（上記 inventory は
 * status: frozen なので追記できない。経緯を残す必要があれば新しい日付の log を作る）。
 */
export const KNOWN_FROZEN_BROKEN_LINKS: readonly FrozenBrokenLink[] = [
  // ログ自身が docs/decisions/ から docs/{domain}/log/ へ 1 階層深く移動した際に、
  // 相対リンクの `../` が据え置かれたもの。参照先自体は今も実在する。
  {
    source: 'docs/engineering/log/2026-04-17-positive-framing-coding-norms.md',
    target: '../../CLAUDE.md',
  },
  {
    source: 'docs/product/log/2026-03-10-time-immutability-principle.md',
    target: '../business/strategy.md',
  },
  {
    source: 'docs/product/log/2026-06-16-feature-non-adoption.md',
    target: '../business/strategy.md',
  },
  {
    source: 'docs/product/log/2026-06-16-feature-non-adoption.md',
    target: '../../supabase/migrations/20260319130001_remove_recurrence.sql',
  },
  // 参照先が別ファイルへ統合されたもの。
  // docs/architecture/api/ は docs/engineering/conventions-api.md へ合流した。
  {
    source: 'docs/engineering/log/2026-05-01-api-first-audit.md',
    target: '../architecture/api/shape.md',
  },
  {
    source: 'docs/engineering/log/2026-05-12-service-audit.md',
    target: '../architecture/api/contracts.md',
  },
  // 参照先が廃止され、単一の後継が無いもの。
  {
    source: 'docs/product/log/2026-03-10-time-immutability-principle.md',
    target: '../roadmap.md',
  },
  {
    source: 'docs/product/log/2026-06-16-feature-non-adoption.md',
    target: '../roadmap.md',
  },
  {
    source: 'docs/product/log/2026-06-16-feature-non-adoption.md',
    target: '../strategy/research/competitors/',
  },
  {
    source: 'docs/product/log/2026-06-16-feature-non-adoption.md',
    target: '../../.claude/rules/copywriting.md',
  },
  // 2026-08-10 の完了 project の docs/projects/_archive/ 移設によるもの。
  // 後継はいずれも docs/projects/_archive/{name}/ 配下の同名ファイル。
  {
    source: 'docs/product/log/2026-07-16-feedback-mobile-block-search-sheet.md',
    target: '../../projects/block-search/overview.md',
  },
  {
    source: 'docs/product/log/2026-07-15-feedback-block-search.md',
    target: '../../projects/block-search/overview.md',
  },
  {
    source: 'docs/product/log/2026-07-15-feedback-block-search-tag-note.md',
    target: '../../projects/block-search/overview.md',
  },
  {
    source: 'docs/product/log/2026-07-15-feedback-block-search-open-only.md',
    target: '../../projects/block-search/overview.md',
  },
  {
    source: 'docs/product/log/2026-07-15-feedback-block-search-duplicate-inspector.md',
    target: '../../projects/block-search/overview.md',
  },
  {
    source: 'docs/product/log/2026-07-09-time-model-split.md',
    target: '../../projects/time-model-split/overview.md',
  },
  {
    source: 'docs/engineering/log/2026-08-05-vercel-skip-verification.md',
    target: '../../projects/ci-monorepo-refactor/overview.md',
  },
  {
    source: 'docs/engineering/log/2026-08-05-unit-test-cost-measurement.md',
    target: '../../projects/ci-monorepo-refactor/overview.md',
  },
  // 2026-08-10 の docs/marketing 廃止・business 統合、および docs/business/strategy.md の
  // docs/strategy.md への昇格によるもの。マッピング全体は同日付コミットの
  // docs domain 再編で決定（このリストはコード側の allowlist なので日付ログは別途作らない）。
  {
    source: 'docs/product/log/2026-07-10-analytics-expression-policy.md',
    target: '../../business/strategy.md',
  },
  {
    source: 'docs/product/log/2026-07-09-time-model-split.md',
    target: '../../business/strategy.md',
  },
  // 後継: docs/strategy.md（docs/business/strategy.md から昇格）。
  {
    source: 'docs/business/log/2026-08-10-competitor-matrix-snapshot.md',
    target: '../strategy.md',
  },
  {
    source: 'docs/business/log/2026-07-05-founder-audit.md',
    target: '../strategy.md',
  },
  {
    source: 'docs/engineering/log/2026-08-10-frozen-log-link-inventory.md',
    target: '../../business/strategy.md',
  },
  // 後継: docs/business/content/content-operations.md
  // （docs/marketing/content-operations.md → docs/business/content/同名）。
  {
    source: 'docs/business/log/2026-07-24-docs-lp-coverage-audit.md',
    target: '../content-operations.md',
  },
  {
    source: 'docs/business/log/2026-07-23-content-operations.md',
    target: '../content-operations.md',
  },
  // 後継: docs/business/channels/x.md（docs/marketing/channels/x.md → docs/business/channels/同名）。
  {
    source: 'docs/business/log/2026-07-05-founder-audit.md',
    target: '../../marketing/channels/x.md',
  },
];

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
