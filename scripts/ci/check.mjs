#!/usr/bin/env node

/**
 * scripts/ci/check.mjs — `.github/workflows/ci.yml` の実行本体（#2483 Phase 1）。
 *
 * 「薄い呼び出し層（ci.yml） + scripts 側の実体」再編の実体側。ci.yml は
 * checkout・setup・Supabase CLI の起動可否（`if:`）・secrets の受け渡しだけを
 * 担い、affected 判定（docs-only skip・integration の DB-touch 判定）と
 * 各種チェックの実行はここに内包する。
 *
 * Usage:
 *   node scripts/ci/check.mjs static
 *   node scripts/ci/check.mjs test
 *
 * static: gitleaks CLI + allowlist canary + secrets:check + docs:check +
 *         validate:content（常時）+ typecheck/lint/knip/check:static の並列
 *         lane（docs-only でなければ）+ supabase/functions/** 変更時のみ deno check
 * test:   unit（product/web/i18n/observability + scripts、常時）+ 新規 migration の
 *         destructive scan（pull_request イベント時は常時）+ affected な PR だけ
 *         integration/RLS（Supabase の起動自体は ci.yml 側の `if:` が担い、
 *         接続情報は env 経由で渡される前提）
 *
 * impact 判定は static モードで 1 回だけ行い、`$GITHUB_OUTPUT` へ書き出す
 * （docs_only / product_unit / integration）。test job はそれを
 * `needs.static.outputs` 経由で env として受け取り、ここでは再計算しない —
 * 同一 PR の 2 job で gh api を 2 回叩いて結果がずれるリスクを避けるため。
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkFiles as detectDestructiveMigrations,
  formatSummary as formatMigrationSummary,
} from './check-destructive-migration.mjs';
import {
  formatGithubOutput,
  formatSummary as formatImpactSummary,
  resolveImpact,
} from './impact.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_LABEL = 'db:destructive-migration';

// DI 用の簡略型（`typeof execFileSync` 等の strict overload 型をそのまま JSDoc に
// 使うと、test の単純な mock（`vi.fn(() => 'stdout')` 等）が Node の完全な戻り値型
// （pid/output/stdout/stderr/signal を持つ SpawnSyncReturns 等）と一致せず
// typecheck が落ちる。scripts/ci/night-watch/run-all.mjs の ExecFileImpl と同じ
// 設計判断——実際に呼び出し側が使うプロパティだけを持つ最小型に絞る）。
/** @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl */
/** @typedef {(command: string, args: string[], options?: object) => { status: number | null }} SpawnImpl */
/** @typedef {(path: string, encoding: string) => string} ReadFileImpl */

// ─── PR ファイル一覧の取得 ────────────────────────────────────────────
// pull_request イベント以外（workflow_dispatch 等）は PR context が無いため
// 空配列を返す。呼び出し側（resolveImpact 等）は空入力を「判定不能」として
// fail closed（全 affected）に倒す規約を共有している。

/** @param {{ repo?: string, prNumber?: string | number, execImpl?: ExecFileImpl }} opts */
export function fetchPrFilenames({ repo, prNumber, execImpl = execFileSync } = {}) {
  if (!repo || !prNumber) return [];
  const out = execImpl(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${repo}/pulls/${prNumber}/files`,
      '--jq',
      '.[] | .filename, (.previous_filename // empty)',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return out.split('\n').filter(Boolean);
}

/**
 * migration safety（破壊的変更の静的スキャン）用。filename + status（NDJSON 由来）で返す。
 * @param {{ repo?: string, prNumber?: string | number, execImpl?: ExecFileImpl }} opts
 * @returns {{ filename: string, status: string }[]}
 */
export function fetchPrFilesWithStatus({ repo, prNumber, execImpl = execFileSync } = {}) {
  if (!repo || !prNumber) return [];
  const out = execImpl(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${repo}/pulls/${prNumber}/files`,
      '--jq',
      '.[] | {filename, status} | tojson',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const entries = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // 壊れた行はスキップする（check-destructive-migration.mjs の CLI と同じ扱い）
    }
  }
  return entries;
}

// ─── 判定（テスト対象の純粋関数）────────────────────────────────────
// GITHUB_OUTPUT / env はすべて文字列で渡ってくる（'true' | 'false'）。static
// モードは resolveImpact() の boolean を、test モードは env の文字列を渡すため、
// 両方を同じ規約で受けられるようにする。

function isTrueFlag(value) {
  return value === true || value === 'true';
}

function isFalseFlag(value) {
  return value === false || value === 'false';
}

/** docs-only の PR では静的解析の並列 lane（lint/knip/check:static/typecheck）を skip する。 */
export function shouldRunStaticLanes(docsOnly) {
  return !isTrueFlag(docsOnly);
}

/** CI toolchain の変更を含む PR では docs-only でも product unit test を走らせる。 */
export function shouldRunProductUnitTests(productUnit) {
  return !isFalseFlag(productUnit);
}

/** DB を触らない PR では Supabase の起動自体を省略する（affected 判定）。 */
export function shouldRunIntegrationTests(integrationAffected) {
  return !isFalseFlag(integrationAffected);
}

// ─── diff 範囲の解決（gitleaks / docs reminder で共有）────────────────
// PR の base SHA（`github.event.pull_request.base.sha`）が shallow clone に
// 存在しない場合は HEAD~1、それも無ければ HEAD まで段階的にフォールバックする
// （旧 docs-guard.yml の 2 箇所と同一規約）。

/** @param {string} ref @param {SpawnImpl} [execImpl] */
function refExists(ref, execImpl = spawnSync) {
  if (!ref) return false;
  const result = execImpl('git', ['cat-file', '-e', ref], { cwd: ROOT });
  return result.status === 0;
}

/** @param {{ candidate?: string, execImpl?: SpawnImpl }} [opts] */
export function resolveDiffBase({ candidate, execImpl = spawnSync } = {}) {
  if (refExists(candidate, execImpl)) return candidate;
  if (refExists('HEAD~1', execImpl)) return 'HEAD~1';
  return 'HEAD';
}

// ─── 汎用 exec ヘルパー ──────────────────────────────────────────────

/** @param {string} cmd @param {string[]} args @param {import('node:child_process').SpawnSyncOptions} [opts] */
function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: false, ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error(`command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`);
    err.exitCode = result.status ?? 1;
    throw err;
  }
}

/**
 * 独立したチェックを並列実行し、全完了を待ってから group 単位でログを出す
 * （旧 ci.yml の `&` / `wait` bash lane と同じ意図。node の spawn を使うのは
 * 実行ロジックを scripts 側へ寄せるため）。1 つでも失敗したら例外を投げる。
 * @param {{ label: string, cmd: string, args: string[] }[]} lanes
 */
async function runLanesInParallel(lanes) {
  const results = await Promise.all(
    lanes.map(
      (lane) =>
        new Promise((resolvePromise) => {
          const chunks = [];
          const child = spawn(lane.cmd, lane.args, { cwd: ROOT, shell: false });
          child.stdout.on('data', (d) => chunks.push(d));
          child.stderr.on('data', (d) => chunks.push(d));
          child.on('close', (code) => {
            resolvePromise({
              ...lane,
              code: code ?? 1,
              output: Buffer.concat(chunks).toString('utf8'),
            });
          });
          child.on('error', (error) => {
            resolvePromise({ ...lane, code: 1, output: String(error) });
          });
        }),
    ),
  );

  for (const { label, code, output } of results) {
    console.log(`\n::group::lane: ${label} (rc=${code})`);
    console.log(output);
    console.log('::endgroup::');
  }

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length > 0) {
    console.log(
      `::error::static lane failed: ${failed.map((f) => `${f.label}(${f.code})`).join(', ')}`,
    );
    throw new Error(`static lanes failed: ${failed.map((f) => f.label).join(', ')}`);
  }
}

async function writeGithubOutput(lines) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  appendFileSync(path, `${lines.join('\n')}\n`);
}

async function writeStepSummary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) {
    console.log(markdown);
    return;
  }
  appendFileSync(path, `${markdown}\n`);
}

// ─── static モード ───────────────────────────────────────────────────

async function runStatic() {
  const repo = process.env.GITHUB_REPOSITORY;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const prNumber = process.env.PR_NUMBER;
  const isPr = eventName === 'pull_request' && !!prNumber;

  const filenames = isPr ? fetchPrFilenames({ repo, prNumber }) : [];
  const impact = resolveImpact(filenames);
  await writeStepSummary(formatImpactSummary(impact));
  await writeGithubOutput(formatGithubOutput(impact).trim().split('\n'));

  // ── secret scan（gitleaks、旧 docs-guard.yml）─────────────────────
  const GITLEAKS_VERSION = '8.30.1';
  const GITLEAKS_SHA256 = '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb';
  run('bash', [
    '-c',
    `curl -sSLO "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" && ` +
      `echo "${GITLEAKS_SHA256}  gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | sha256sum -c - && ` +
      `tar -xzf "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" gitleaks && ` +
      `sudo install -m 0755 gitleaks /usr/local/bin/gitleaks`,
  ]);

  const diffBase = resolveDiffBase({
    candidate: process.env.PR_BASE_SHA || process.env.GITHUB_EVENT_BEFORE || '',
  });
  run('gitleaks', [
    'detect',
    '--source',
    '.',
    '--config',
    '.gitleaks.toml',
    '--redact',
    `--log-opts=${diffBase}..HEAD`,
    '--exit-code',
    '1',
  ]);
  run('bash', ['scripts/ci/gitleaks-allowlist-canary.sh']);

  if (isPr) {
    const diff = spawnSync('git', ['diff', '--name-only', `${diffBase}...HEAD`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const changed = (diff.stdout || '').split('\n').filter(Boolean);
    const srcChanged = changed.some((f) => f.startsWith('apps/product/src/'));
    const docsChanged = changed.some((f) => f.startsWith('docs/'));
    if (srcChanged && !docsChanged) {
      console.log(
        '::warning::apps/product/src/ に変更がありますが docs/ の更新がありません。仕様・運用・アーキテクチャへの影響がないか確認してください。',
      );
    }
  }

  run('pnpm', ['secrets:check']);
  run('pnpm', ['docs:check'], {
    env: {
      ...process.env,
      DOCS_GUARD_BASE_REF: `origin/${process.env.GITHUB_BASE_REF || 'main'}`,
    },
  });
  run('pnpm', ['--filter', '@dayopt/web', 'validate:content']);

  if (shouldRunStaticLanes(impact.docsOnly)) {
    await runLanesInParallel([
      { label: 'ESLint', cmd: 'pnpm', args: ['lint'] },
      { label: 'Dead code', cmd: 'pnpm', args: ['quality:deadcode:ci'] },
      { label: 'Boundaries/format/i18n/taxonomy', cmd: 'pnpm', args: ['check:static'] },
      { label: 'TypeScript', cmd: 'pnpm', args: ['typecheck'] },
    ]);
  } else {
    console.log('docs-only の変更のため typecheck/lint/knip/check:static lane を skip します。');
  }

  const functionsChanged = filenames.some((f) => f.startsWith('supabase/functions/'));
  if (functionsChanged || !isPr) {
    const DENO_VERSION = '2.9.4';
    const DENO_SHA256 = 'c24f955d9fbfe0ea5ae2b501c8e71ae76e31e4c9782390a54a284b3364fda725';
    run('bash', [
      '-c',
      `curl -sSLO "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" && ` +
        `echo "${DENO_SHA256}  deno-x86_64-unknown-linux-gnu.zip" | sha256sum -c - && ` +
        `mkdir -p "$RUNNER_TEMP/deno-bin" && unzip -q deno-x86_64-unknown-linux-gnu.zip -d "$RUNNER_TEMP/deno-bin" && ` +
        `echo "$RUNNER_TEMP/deno-bin" >> "$GITHUB_PATH"`,
    ]);
    // GITHUB_PATH への追記は次 step から効くため、この step 内で使うには PATH を
    // 自前で通す必要がある。
    run('bash', ['-c', 'export PATH="$RUNNER_TEMP/deno-bin:$PATH" && pnpm functions:check']);
  }
}

// ─── test モード ─────────────────────────────────────────────────────

async function runTest() {
  // ── write 権限つき GH_TOKEN を PR コードの実行から隔離する ──────────
  // このジョブは permissions: pull-requests: write / issues: write を宣言し、
  // その GITHUB_TOKEN を GH_TOKEN として step env に受け取る。以降の run()
  // 呼び出しは PR branch のテストコードと全依存（postinstall・vitest
  // transform・plugin を含む）を実行するため、env を明示指定しない
  // spawnSync はこのトークンをそのまま子プロセスへ継承してしまう
  // （scripts/ci/night-watch/run-all.mjs の envWithout と同じ token 分離原則。
  // 押収した値は migration safety の gh 呼び出しにだけ明示的に渡す。
  // push前反証レビュー risk-reviewer 指摘、P1、PR #2484）。
  const ghToken = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;

  const repo = process.env.GITHUB_REPOSITORY;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const prNumber = process.env.PR_NUMBER;
  const isPr = eventName === 'pull_request' && !!prNumber;

  const productUnit = shouldRunProductUnitTests(process.env.PRODUCT_UNIT);
  const integrationAffected = shouldRunIntegrationTests(process.env.INTEGRATION_AFFECTED);

  // ── migration safety（破壊的変更の静的スキャン、常時・DB 不要）────
  // 他の unit test より先に実行する。DB 起動も build:packages も不要な軽い
  // 静的スキャンで、後段の unit test 失敗（run() が例外を投げて runTest を
  // 中断する）に巻き込まれて検知そのものが飛ぶのを防ぐ（内製クロスレビュー
  // risk-reviewer 指摘、P2、PR #2484）。
  if (isPr) {
    await runMigrationSafety({ repo, prNumber, env: { ...process.env, GH_TOKEN: ghToken } });
  }

  run('pnpm', ['build:packages']);
  run('pnpm', ['test:scripts']);
  run('pnpm', [
    '--dir',
    'apps/product',
    'exec',
    'vitest',
    '--project',
    'unit',
    'run',
    'production-build-gate.test.mjs',
  ]);
  run('pnpm', ['--dir', 'apps/web', 'exec', 'vitest', 'run', 'production-build-gate.test.mjs']);

  if (productUnit) {
    run('pnpm', ['--filter', '@dayopt/product', 'test:run']);
  } else {
    console.log('product 影響なしのため product unit test を skip します。');
  }
  run('pnpm', ['test:web']);
  run('pnpm', ['--filter', '@dayopt/i18n', 'test:run']);
  run('pnpm', ['--filter', '@dayopt/observability', 'test:run']);

  // ── integration / RLS（affected な PR だけ。Supabase の起動自体は ci.yml 側の `if:` が担う）──
  if (integrationAffected) {
    run('pnpm', ['test:integration']);
    run('pnpm', ['rls:snapshot:check']);
  } else {
    console.log('DB を触らない変更のため integration/RLS test を skip します。');
  }
}

/**
 * migration safety の検知〜通知。「検知しても job は失敗させない」（fail open）
 * 設計を維持する。ラベル付与より先にコメント投稿を行う（旧 integration.yml と
 * 同じ crash-safety の理由: cancel-in-progress で通知前に打ち切られても、
 * ラベルだけ残って以後永久に通知されない状態を避ける）。
 *
 * 実行に使う関数はすべて注入可能にしてある（test では gh / fs へ実際に触れずに
 * 分岐を検証する。strip-status-labels.mjs と同じ DI の型）。
 * @param {{
 *   repo?: string,
 *   prNumber?: string | number,
 *   fetchFilesImpl?: typeof fetchPrFilesWithStatus,
 *   readFileImpl?: ReadFileImpl,
 *   execFileImpl?: ExecFileImpl,
 *   spawnImpl?: SpawnImpl,
 *   writeStepSummaryImpl?: typeof writeStepSummary,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
export async function runMigrationSafety({
  repo,
  prNumber,
  fetchFilesImpl = fetchPrFilesWithStatus,
  readFileImpl = readFileSync,
  execFileImpl = execFileSync,
  spawnImpl = spawnSync,
  writeStepSummaryImpl = writeStepSummary,
  env = process.env,
}) {
  const files = fetchFilesImpl({ repo, prNumber });
  const withContent = files
    .filter((f) => f.filename.startsWith('supabase/migrations/'))
    .map((f) => {
      let content = '';
      try {
        content = readFileImpl(resolve(ROOT, f.filename), 'utf8');
      } catch {
        content = ''; // 削除・rename されたファイル等
      }
      return { path: f.filename, status: f.status, content };
    });

  const results = detectDestructiveMigrations(withContent);
  await writeStepSummaryImpl(formatMigrationSummary(results));
  if (results.length === 0) return { results, notified: false };

  let hasLabel = false;
  try {
    hasLabel = JSON.parse(
      execFileImpl(
        'gh',
        [
          'api',
          `repos/${repo}/issues/${prNumber}/labels`,
          '--jq',
          `[.[] | select(.name == "${MIGRATION_LABEL}")] | length > 0`,
        ],
        { encoding: 'utf8', env },
      ),
    );
  } catch {
    hasLabel = false; // 取得失敗は「未検知」扱いで通知を試みる（fail open）
  }
  if (hasLabel) return { results, notified: false }; // round ごとの追い push で毎回コメントしない

  spawnImpl(
    'gh',
    [
      'label',
      'create',
      MIGRATION_LABEL,
      '--repo',
      repo,
      '--color',
      'B60205',
      '--description',
      '破壊的 migration を検知（EXPLICIT AUTHORITY 要確認）',
    ],
    { env },
  );

  const commentResult = spawnImpl(
    'gh',
    ['pr', 'comment', String(prNumber), '--repo', repo, '--body', formatMigrationSummary(results)],
    { env },
  );
  if (commentResult.status === 0) {
    spawnImpl(
      'gh',
      [
        'api',
        '--method',
        'POST',
        `repos/${repo}/issues/${prNumber}/labels`,
        '-f',
        `labels[]=${MIGRATION_LABEL}`,
      ],
      { env },
    );
    return { results, notified: true };
  }
  // fork PR では pull_request イベントの GITHUB_TOKEN が構造的に read-only になる
  console.log(
    '::warning::migration safety のコメント投稿に失敗しました（fork PR 等で write 権限が無い可能性）。Step Summary の検知結果を確認してください。',
  );
  return { results, notified: false };
}

// ─── CLI ────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const mode = process.argv[2];
  try {
    if (mode === 'static') {
      await runStatic();
    } else if (mode === 'test') {
      await runTest();
    } else {
      console.error('Usage: node scripts/ci/check.mjs <static|test>');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error?.exitCode ?? 1;
  }
}
