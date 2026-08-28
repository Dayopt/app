import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractTrailingNumber, REPO, reserveAlertRunSlot, runGh, runGhJson } from './lib.mjs';

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
  // #2483（CI ファイル統合 Phase 1）: heavy-post-merge.yml / integration.yml は
  // nightly.yml へ吸収され、複数 job（heavy-e2e / heavy-web / integration）が
  // 1 つの workflow ファイルを共有するようになった。`gh run list --workflow=`
  // だけでは cron ごとに異なる job を区別できないため、実行は
  // `checkWorkflowJobRun`（run-all.mjs）が job 名で判定する（このコマンド文字列
  // は起票 issue の「再現コマンド」欄の表示専用で、実行そのものには使わない
  // ——既存の設計方針〈表示用コマンドと実行コマンドは意図的に異なりうる〉を
  // 踏襲。checkSentryNew と同型）。**nightly.yml の job 名を変更したら
  // run-all.mjs の NIGHTLY_HEAVY_JOB_NAMES / NIGHTLY_INTEGRATION_JOB_NAME と
  // 合わせてこの表示文字列も更新すること。**
  //
  // `--branch main` は今も必須: `--workflow=nightly.yml` は誰でも
  // `workflow_dispatch` できるため、feature branch からの手動発火が直近 run を
  // 占有すると main と無関係な run で red/green が判定されてしまう（旧
  // heavy-post-merge.yml / integration.yml から引き継いだ既知の穴、PR #2380 /
  // #2333）。integration.yml が持っていた `pull_request` trigger
  // （migration-safety job 用）は ci.yml の test job へ移設済みで、nightly.yml
  // 自体に pull_request trigger は無いため、PR run 混入の懸念自体は解消した。
  'heavy-red': {
    kind: 'run-url',
    title: 'heavy（E2E / Web）が直近 run で red',
    command:
      'gh run list --workflow=nightly.yml --branch main --limit 30 --json databaseId,url | jq -r \'.[].databaseId\' | while read -r id; do gh api "repos/Dayopt/dayopt/actions/runs/$id/jobs" --jq \'.jobs[] | select(.name=="🎭 E2E Tests" or .name=="🌐 Web Build & E2E") | select(.conclusion!="skipped")\'; done | head -3',
  },
  'integration-red': {
    kind: 'run-url',
    title: 'integration が直近 run で red',
    command:
      'gh run list --workflow=nightly.yml --branch main --limit 30 --json databaseId,url | jq -r \'.[].databaseId\' | while read -r id; do gh api "repos/Dayopt/dayopt/actions/runs/$id/jobs" --jq \'.jobs[] | select(.name=="Integration Tests") | select(.conclusion!="skipped")\'; done | head -3',
  },
  'sentry-new': {
    kind: 'sentry',
    title: '直近24hに新規 unresolved production issue を検出',
    // 起票 issue の「再現コマンド」欄は、朝これを見た人間がローカル
    // （1Password が使える環境）で手で再現する想定のため、意図的に op run
    // 形のまま保持する（Cloud Environment の env 直読み形が Routine の
    // 実行時の既定だが、朝レーンが再現する時は 1Password 経由の方が自然）。
    // guard allowlist（.claude/hooks/pre-tool-guard-impl.sh）は両形とも
    // 許可しており、この command 文字列自体は allowlist 判定には関与しない
    // （こちらは issue 本文の表示用、SKILL.md §Step2 が実行時に叩く固定形の
    // 正本）。
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
//
// URL の path 部は `issues/<数字>/?` に固定する（末尾スラッシュ任意）。旧実装
// （`[A-Za-z0-9/_-]+`）は base64url アルファベット全体を長さ無制限で許可して
// おり、`--evidence` を複数回渡せる仕様と組み合わせると、board.reason
// （run-log.mjs、同 round で自由文字列を enum 化した P1）と同型の任意バイト列
// exfiltration 経路がここに残っていた（push 前反証レビュー risk-reviewer
// 指摘、medium）。実在する Sentry issue URL は常に数値 ID で終わるため、診断
// 価値を落とさずに閉じられる。
//
// subdomain 部も `dayopt` へ固定する（#2334、PR #2309 delta re-review
// risk-reviewer 指摘、P2）。path 部で閉じた class（自由長・限定文字集合での
// 任意データ搬送）と同型の経路が subdomain（旧: `[a-z0-9-]+` で長さ無制限）に
// 残っていた。実運用の Sentry org は `dayopt`（docs/operations/monitoring.md
// の dashboard URL が実測）で固定のため、診断価値を落とさずに閉じられる。
const SENTRY_EVIDENCE_RE = /^DAYOPT-\d+ https:\/\/dayopt\.sentry\.io\/issues\/\d+\/?$/;
// 1 check あたりの evidence 件数上限。`--evidence` は repeatable flag のため、
// 上限が無いと 1 件あたりの長さを絞ってもペイロード総量は無制限になる。
const MAX_SENTRY_EVIDENCE = 5;

const BASELINE_PATH = fileURLToPath(
  new URL('../../../.claude/skills/night-watch/baseline.json', import.meta.url),
);

function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

/**
 * CHECK_DEFINITIONS を own property でのみ引く。`CHECK_DEFINITIONS[checkId]` の
 * 素朴なブラケットアクセスは prototype chain も辿るため、`report __proto__` /
 * `report constructor` のような checkId が `undefined` を返さず Object.prototype
 * 上のオブジェクトにヒットしてしまう（push 前反証レビュー risk-reviewer 指摘、
 * low）。
 * @param {string} checkId
 */
function getCheckDefinition(checkId) {
  return Object.hasOwn(CHECK_DEFINITIONS, checkId) ? CHECK_DEFINITIONS[checkId] : undefined;
}

/**
 * @typedef {{ evidence?: string[], actual?: string, count?: string, [key: string]: unknown }} AlertArgs
 */

// buildAlertBody が実際に読む flag のみ許可する。未知 flag を静かに受理すると
// 呼び出し側の typo・プロンプト由来の余計な flag がそのまま無視され、意図した
// 値が実は検証も本文反映もされていないことに気づけない（push 前反証レビュー
// behavior-verifier 指摘、P3）。
const KNOWN_ALERT_FLAGS = new Set(['actual', 'evidence-url', 'count', 'evidence']);

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
    if (!KNOWN_ALERT_FLAGS.has(flag)) {
      throw new Error(`未知の flag です: ${token}`);
    }
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
  const definition = getCheckDefinition(checkId);
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
      if (evidence.length > MAX_SENTRY_EVIDENCE) {
        throw new Error(
          `--evidence は 1 check あたり最大 ${MAX_SENTRY_EVIDENCE} 件までです（指定: ${evidence.length} 件）`,
        );
      }
      const badEvidence = evidence.filter((entry) => !SENTRY_EVIDENCE_RE.test(entry));
      if (badEvidence.length > 0) {
        throw new Error(
          `--evidence は "DAYOPT-<番号> https://dayopt.sentry.io/issues/<数字>/" 形式（空白区切り）でのみ指定してください（不正な値: ${badEvidence.join(', ')}）。Sentry issue の title / culprit / message はここへ書けません`,
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

// runAlertSync が新規起票する issue に必ず付ける固定ラベル（下記
// runAlertSync 参照）。dedup 判定でこの両方を要求する。ただし実効的な gate は
// `area:operations` の 1 本だけである点に注意（push 前反証レビュー
// risk-reviewer 指摘、low）: `type:chore` は `.github/ISSUE_TEMPLATE/chore.yml`
// の front-matter（`labels: ['type:chore']`）により、triage 権限の無い外部
// ユーザーが issue form から作成しても自動付与される。`area:operations` は
// どの issue form にも front-matter 登録が無く、triage/write 権限でしか
// 付けられないため、こちらが偽装防止の実体になる。2 ラベルを要求する構成は
// 将来 area:operations 側の issue form が増えた時にも壊れないための保険。
const ALERT_ISSUE_LABELS = ['type:chore', 'area:operations'];

/**
 * dedup 検索。SKILL.md §Step3 と同じ「検索失敗時は起票しない（fail closed）」を実装する。
 *
 * GitHub の検索は語単位の緩いマッチで、`nightwatch(<id>): in:title` の括弧・
 * コロンはほぼ無視される。検索結果をそのまま信用すると、public repo（2026-09
 * 私有化まで）に外部ユーザーが似た文言の issue を 1 本立てるだけで、以後この
 * check-id の alert が新規起票されずその issue へコメントされ続ける（alert
 * 抑止 + 無関係スレッドへの書き込み）。`results[0]` を無条件採用せず、title が
 * `nightwatch(<checkId>): ` で実際に始まる候補だけを採用する
 * （push 前反証レビュー risk-reviewer 指摘、medium）。
 *
 * title の完全一致プレフィックスだけでも、外部ユーザーは通常の issue 作成
 * 権限（write 権限は不要）で同じ prefix の title を自由に選べるため偽装でき
 * てしまう（非ブロッキング Codex レビュー指摘、P2）。`runAlertSync` が新規
 * 起票時に必ず付ける固定ラベル（`type:chore` + `area:operations`。実効的な
 * gate は triage/write 権限でしか付かない `area:operations` 側 —
 * `ALERT_ISSUE_LABELS` の定義コメント参照）も同時に要求し、両方を満たす
 * 候補だけを既存 alert として採用する。
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
      'number,title,labels',
    ],
    { execFileImpl },
  );
  const titlePrefix = `nightwatch(${checkId}): `;
  return (
    results.find((issue) => {
      if (!issue.title.startsWith(titlePrefix)) return false;
      const labelNames = new Set((issue.labels ?? []).map((label) => label.name));
      return ALERT_ISSUE_LABELS.every((name) => labelNames.has(name));
    }) ?? null
  );
}

/**
 * @param {{
 *   checkId: string,
 *   args: AlertArgs,
 *   detectedAt?: string,
 *   execFileImpl?: import('./lib.mjs').ExecFileImpl,
 *   runStatePath?: string,
 * }} params
 */
export function runAlertSync({
  checkId,
  args,
  detectedAt = new Date().toISOString(),
  execFileImpl,
  runStatePath,
}) {
  const definition = getCheckDefinition(checkId);
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

  // gh を実際に呼ぶ直前で run-scoped の起票上限を予約する（#2332）。
  // buildAlertBody の検証（未知 flag・不正な値の拒否）より後に置くのは、
  // 検証エラーでは gh を呼ばないので予算を消費させないため。gh 呼び出しより
  // 前に置くのは、gh が失敗した時に消費した試行を計上漏れさせないため
  // （scripts/ci/night-watch/lib.mjs の reserveAlertRunSlot コメント参照）。
  const reservation = reserveAlertRunSlot({
    checkId,
    willCreate: !existing,
    statePath: runStatePath,
  });
  if (!reservation.allowed) {
    return { action: 'capped', reason: reservation.reason };
  }

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

// #2422: 観測コマンド自体の取得失敗（fetch-failed）が N 晩連続した時の
// escalation issue。CHECK_DEFINITIONS の kind ベースの title
// （`nightwatch(<checkId>): <definition.title>`、red-alert 用）とは
// **別の title prefix** を使う。同じ prefix にすると、findExistingAlertIssue
// の dedup 検索が「この check-id の red-alert issue」を誤って再利用し、
// 「観測が失敗している」という別事象の body をそこへ紛れ込ませてしまう。
const FETCH_FAILURE_TITLE_PREFIX = 'nightwatch-fetch-failed';

// consecutiveNights の妥当範囲（無制限の整数を issue title/body へ載せる経路を
// 作らない。run-log.mjs の MAX_ISSUE_NUMBER と同じ考え方）。
const MAX_CONSECUTIVE_NIGHTS = 999;

function fetchFailureTitle(checkId, consecutiveNights) {
  return `${FETCH_FAILURE_TITLE_PREFIX}(${checkId}): 観測が${consecutiveNights}晩連続で取得失敗`;
}

/**
 * `findExistingAlertIssue` の fetch-failure escalation 版。title prefix が
 * 異なる点以外は同じ設計（title 完全一致プレフィックス + 固定ラベル要求）。
 * @param {string} checkId
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl }} [opts]
 */
export function findExistingFetchFailureAlertIssue(checkId, { execFileImpl } = {}) {
  const titlePrefix = `${FETCH_FAILURE_TITLE_PREFIX}(${checkId}): `;
  const results = runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--search',
      `${FETCH_FAILURE_TITLE_PREFIX}(${checkId}): in:title`,
      '--json',
      'number,title,labels',
    ],
    { execFileImpl },
  );
  return (
    results.find((issue) => {
      if (!issue.title.startsWith(titlePrefix)) return false;
      const labelNames = new Set((issue.labels ?? []).map((label) => label.name));
      return ALERT_ISSUE_LABELS.every((name) => labelNames.has(name));
    }) ?? null
  );
}

/**
 * @param {{ checkId: string, consecutiveNights: number, detectedAt: string, isContinuing?: boolean }} params
 */
export function buildFetchFailureAlertBody({
  checkId,
  consecutiveNights,
  detectedAt,
  isContinuing = false,
}) {
  const definition = getCheckDefinition(checkId);
  if (!definition) {
    throw new Error(`未知の check-id です: ${checkId}`);
  }
  if (
    !Number.isInteger(consecutiveNights) ||
    consecutiveNights <= 0 ||
    consecutiveNights > MAX_CONSECUTIVE_NIGHTS
  ) {
    throw new Error(`consecutiveNights は 1〜${MAX_CONSECUTIVE_NIGHTS} の整数である必要があります`);
  }
  // 既存 escalation issue への追記（isContinuing）では固定の晩数を繰り返さない
  // （push前反証レビュー指摘・P2、PR #2445）。呼び出し元は常に固定の
  // `consecutiveNights`（既定 3）しか渡さないため、night4 以降も毎晩「3晩連続」
  // という同じ本文が積まれ、実際の継続期間が過小評価される「検出はしたが
  // 深刻度が伝わらない」劣化版無音化になっていた。実際の連続晩数を数える
  // 代わりに、新規/継続で文言を分岐する最小修正を採る。
  const status = isContinuing
    ? '前回の検出以降も継続して取得失敗しています（直近の運行記録でも観測失敗を確認）。'
    : `観測コマンド自体が ${consecutiveNights} 晩連続で取得失敗しています。`;
  return `## night-watch 検出: ${checkId}（観測失敗の escalation）

この check は red/green の判定ではなく、**観測コマンド自体**が失敗しています。${status}

**再現コマンド**: \`${definition.command}\`
**検出日時**: ${detectedAt}

原因の切り分けは \`docs/operations/night-watch.md\` §故障検出手順 を参照してください。
`;
}

/**
 * fetch-failed（観測コマンド自体の取得失敗）escalation の起票/追記。
 * `runAlertSync` と同じ dedup・run-scoped 起票上限（`reserveAlertRunSlot`）の
 * 仕組みを使うが、reservation key は `fetch-failed:<checkId>` にして
 * red-alert 用の予約枠（`checkId` そのもの）と衝突させない。
 * @param {{
 *   checkId: string,
 *   consecutiveNights: number,
 *   detectedAt?: string,
 *   execFileImpl?: import('./lib.mjs').ExecFileImpl,
 *   runStatePath?: string,
 * }} params
 */
export function runFetchFailureAlertSync({
  checkId,
  consecutiveNights,
  detectedAt = new Date().toISOString(),
  execFileImpl,
  runStatePath,
}) {
  const definition = getCheckDefinition(checkId);
  if (!definition) {
    throw new Error(`未知の check-id です: ${checkId}`);
  }

  let existing;
  try {
    existing = findExistingFetchFailureAlertIssue(checkId, { execFileImpl });
  } catch {
    return { action: 'skipped', reason: 'dedup検索失敗のため起票見送り' };
  }

  const body = buildFetchFailureAlertBody({
    checkId,
    consecutiveNights,
    detectedAt,
    isContinuing: Boolean(existing),
  });

  const reservation = reserveAlertRunSlot({
    checkId: `fetch-failed:${checkId}`,
    willCreate: !existing,
    statePath: runStatePath,
  });
  if (!reservation.allowed) {
    return { action: 'capped', reason: reservation.reason };
  }

  if (existing) {
    runGh(['issue', 'comment', String(existing.number), '--repo', REPO, '--body', body], {
      execFileImpl,
    });
    return { action: 'commented', issueNumber: existing.number };
  }

  const title = fetchFailureTitle(checkId, consecutiveNights);
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
      'Usage: node scripts/ci/night-watch/alert-issue.mjs report <check-id> [--actual N] [--evidence-url URL] [--count N] [--evidence "DAYOPT-1 https://..."]',
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
