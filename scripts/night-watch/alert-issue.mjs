import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractTrailingNumber, REPO, runGh, runGhJson } from './lib.mjs';

/**
 * night-watch SKILL.md §自動パート Step 3（異常があれば起票または追記する）を
 * 1コマンドで完結させる wrapper（#2291 v2、PR #2309 未解決 thread 5 の構造的
 * 解消）。
 *
 * thread #5（P1）: 旧実装（gh issue create/comment を動的 flag allowlist で
 * 直接許可する形）は quote/backslash を削るだけの二重検査では shell 展開
 * （ANSI-C escape `$'...'`、変数展開 `${IFS}` 等）を再現できず、Sentry/PR の
 * title/message を Haiku が読む Step 3 で、攻撃者由来の文字列から `gh` へ
 * 未許可 flag（`--body-file` 等）を渡す経路になり得た。
 *
 * 本 wrapper は 2 点でこの class を構造的に閉じる:
 * 1. **値は execFile の argv 要素として gh へ渡る**（shell を経由しないため、
 *    値の中身がどんな文字列でも gh の flag として再解釈されない）
 * 2. **値の形を CHECK_DEFINITIONS の kind ごとに検証する**（数字のみ / 既知の
 *    URL 形式のみ / Sentry short-ID + URL のみ）。Sentry issue の生 title /
 *    culprit / message は検証を通らないため、そもそも issue 本文へ入り得ない
 *    （SKILL.md §守ること「Sentry issue の raw title/culprit/message を issue
 *    本文へ転記しない」を機械強制する形になる）。title 自体も CHECK_DEFINITIONS
 *    の固定文言のみを使い、Claude が渡す自由文字列を title へ混ぜない
 */

export const CHECK_DEFINITIONS = {
  'docs-check': {
    kind: 'exit-code',
    title: 'pnpm docs:check が exit 0 以外',
    command: 'pnpm docs:check',
  },
  'docs-coverage': {
    kind: 'count-baseline',
    title: '公開docs未カバー件数がbaseline超過',
    command: 'pnpm docs:coverage',
    baselineKey: 'docs_coverage_missing',
  },
  deadcode: {
    kind: 'exit-code',
    title: 'pnpm quality:deadcode:ci が exit 0 以外',
    command: 'pnpm quality:deadcode:ci',
  },
  'dependabot-alerts': {
    kind: 'count-baseline',
    title: 'Dependabot open alert 件数がbaseline超過',
    command: "gh api repos/Dayopt/dayopt/dependabot/alerts?state=open --jq 'length'",
    baselineKey: 'dependabot_alert_count',
  },
  'heavy-red': {
    kind: 'run-url',
    title: 'heavy-post-merge が直近 run で red',
    command:
      'gh run list --workflow=heavy-post-merge.yml --limit 3 --json conclusion,status,headSha,createdAt,url',
  },
  'sentry-new': {
    kind: 'sentry',
    title: '直近24hに新規 unresolved production issue を検出',
    command:
      'SENTRY_AUTH_TOKEN="op://agent/sentry-cli-readonly/credential" op run -- sentry issue list dayopt --query "is:unresolved age:-24h"',
  },
};

const DIGITS_RE = /^\d+$/;
const RUN_URL_RE = /^https:\/\/github\.com\/Dayopt\/dayopt\/actions\/runs\/\d+(?:\/job\/\d+)?$/;
// Sentry short ID（DAYOPT-123 形式）と issue URL の空白区切りペアのみを許可する。
// title/culprit/message はこの形に一致しないため、混入すれば拒否される。区切りに
// `|` を使わないのは、guard の is_single_simple_command が `|` をパイプ記号として
// 無条件拒否するため（quote 内の文字でも区別しない）。空白区切りなら、値全体を
// 1 個の shell argv token として quote すれば guard の検査に触れない。
const SENTRY_EVIDENCE_RE = /^DAYOPT-\d+ https:\/\/[a-z0-9-]+\.sentry\.io\/[A-Za-z0-9/_-]+\/?$/;

const BASELINE_PATH = fileURLToPath(
  new URL('../../.claude/skills/night-watch/baseline.json', import.meta.url),
);

function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

/**
 * @typedef {{ evidence?: string[], actual?: string, count?: string, [key: string]: unknown }} AlertArgs
 */

/**
 * `--flag value` 形式の引数を集める。`--evidence` だけは複数回の指定を配列で集める。
 * @param {string[]} argv
 * @returns {AlertArgs}
 */
export function parseAlertArgs(argv) {
  const result = { evidence: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`未知の引数です: ${token}`);
    }
    const flag = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`${token} に値がありません`);
    }
    i += 1;
    if (flag === 'evidence') {
      result.evidence.push(value);
    } else {
      result[flag] = value;
    }
  }
  return result;
}

/**
 * CHECK_DEFINITIONS の kind ごとに issue 本文を組み立てる。検証を通らない値は例外を投げる。
 * @param {{ checkId: string, args: AlertArgs, detectedAt: string }} params
 */
export function buildAlertBody({ checkId, args, detectedAt }) {
  const definition = CHECK_DEFINITIONS[checkId];
  if (!definition) {
    throw new Error(`未知の check-id です: ${checkId}`);
  }

  let actual;
  let baseline;

  switch (definition.kind) {
    case 'exit-code': {
      actual = 'exit code 0 以外';
      baseline = 'exit code 0';
      break;
    }
    case 'count-baseline': {
      if (!args.actual || !DIGITS_RE.test(args.actual)) {
        throw new Error('--actual は数字のみで指定してください');
      }
      const baselineValue = readBaseline()[definition.baselineKey];
      actual = args.actual;
      baseline = String(baselineValue);
      break;
    }
    case 'run-url': {
      if (!args['evidence-url'] || !RUN_URL_RE.test(args['evidence-url'])) {
        throw new Error(
          '--evidence-url は https://github.com/Dayopt/dayopt/actions/runs/<id> 形式でのみ指定してください',
        );
      }
      actual = args['evidence-url'];
      baseline = 'N/A（success 以外の terminal state、または直近24hに success run が無い）';
      break;
    }
    case 'sentry': {
      if (!args.count || !DIGITS_RE.test(args.count)) {
        throw new Error('--count は数字のみで指定してください');
      }
      const evidence = args.evidence ?? [];
      const badEvidence = evidence.filter((entry) => !SENTRY_EVIDENCE_RE.test(entry));
      if (badEvidence.length > 0) {
        throw new Error(
          `--evidence は "DAYOPT-<番号> https://<subdomain>.sentry.io/<path>" 形式（空白区切り）でのみ指定してください（不正な値: ${badEvidence.join(', ')}）。Sentry issue の title / culprit / message はここへ書けません`,
        );
      }
      actual = `件数: ${args.count}${
        evidence.length > 0 ? `\n${evidence.map((e) => `- ${e}`).join('\n')}` : ''
      }`;
      baseline = '0（新規検出のみ異常）';
      break;
    }
    default:
      throw new Error(`未対応の kind です: ${definition.kind}`);
  }

  return `## night-watch 検出: ${checkId}

**実測値**: ${actual}
**閾値/baseline**: ${baseline}
**再現コマンド**: \`${definition.command}\`
**検出日時**: ${detectedAt}

baseline は \`.claude/skills/night-watch/baseline.json\` に固定。更新は通常の PR レビューでのみ行う。
`;
}

/**
 * dedup 検索。SKILL.md §Step3 と同じ「検索失敗時は起票しない（fail closed）」を実装する。
 * @param {string} checkId
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl }} [opts]
 */
export function findExistingAlertIssue(checkId, { execFileImpl } = {}) {
  const results = runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--search',
      `nightwatch(${checkId}): in:title`,
      '--json',
      'number,title',
    ],
    { execFileImpl },
  );
  return results[0] ?? null;
}

/**
 * @param {{
 *   checkId: string,
 *   args: AlertArgs,
 *   detectedAt?: string,
 *   execFileImpl?: import('./lib.mjs').ExecFileImpl,
 * }} params
 */
export function runAlertSync({
  checkId,
  args,
  detectedAt = new Date().toISOString(),
  execFileImpl,
}) {
  const definition = CHECK_DEFINITIONS[checkId];
  if (!definition) {
    throw new Error(`未知の check-id です: ${checkId}`);
  }

  let existing;
  try {
    existing = findExistingAlertIssue(checkId, { execFileImpl });
  } catch {
    return { action: 'skipped', reason: 'dedup検索失敗のため起票見送り' };
  }

  const body = buildAlertBody({ checkId, args, detectedAt });

  if (existing) {
    runGh(['issue', 'comment', String(existing.number), '--repo', REPO, '--body', body], {
      execFileImpl,
    });
    return { action: 'commented', issueNumber: existing.number };
  }

  const title = `nightwatch(${checkId}): ${definition.title}`;
  const createOutput = runGh(
    [
      'issue',
      'create',
      '--repo',
      REPO,
      '--title',
      title,
      '--body',
      body,
      '--label',
      'type:chore',
      '--label',
      'area:operations',
      '--label',
      'priority:p2',
    ],
    { execFileImpl },
  );
  return { action: 'created', issueNumber: extractTrailingNumber(createOutput) };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  const [subcommand, checkId, ...rest] = process.argv.slice(2);
  if (subcommand !== 'report' || !checkId) {
    console.error(
      'Usage: node scripts/night-watch/alert-issue.mjs report <check-id> [--actual N] [--evidence-url URL] [--count N] [--evidence "DAYOPT-1 https://..."]',
    );
    process.exitCode = 1;
  } else {
    try {
      const args = parseAlertArgs(rest);
      const result = runAlertSync({ checkId, args });
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'alert-issue report failed');
      process.exitCode = 1;
    }
  }
}
