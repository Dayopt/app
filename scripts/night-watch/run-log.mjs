import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  findTodayBoardIssue,
  jstDateString,
  MAX_NEW_ISSUES_PER_RUN,
  readAlertRunState,
  REPO,
  runGh,
} from './lib.mjs';

/**
 * night-watch SKILL.md §自動パート Step 5（運行記録）・Step 0（自己検証の環境
 * 故障報告）を1コマンドで完結させる wrapper（#2291 v2 再設計、push 前反証
 * レビュー risk-reviewer の high 指摘の是正）。
 *
 * 経緯: board-issue.mjs / alert-issue.mjs / dod-candidate.mjs への wrapper 化
 * （thread 1/2/3/4/5/6 是正）で `gh issue comment` の直接 allowlist を全面撤去
 * したところ、Step 5 の運行記録コメント（常設運行記録 issue 宛て + 当日盤面
 * issue 宛ての 1 行）と Step 0 の環境故障報告がどの wrapper にも属さず、
 * 毎晩 guard に block される回帰を生んでいた。これは night-watch の唯一の
 * 故障検出チャネル（docs/operations/night-watch.md §故障検出手順）を無音化する
 * ため、push 前に本 wrapper で塞ぐ。
 *
 * 常設運行記録 issue の番号は呼び出し元の argv では受け取らず、
 * docs/operations/night-watch.md 本文から自分で解決する（close 対象を wrapper
 * 自身が決める board-issue.mjs と同じ設計。任意の issue 番号へ書き込める余地を
 * 呼び出し元に与えない）。
 */

export const CHECK_IDS = new Set([
  'docs-check',
  'docs-coverage',
  'deadcode',
  'dependabot-alerts',
  'heavy-red',
  'integration-red',
  'sentry-new',
]);

const OPS_LOG_DOC_PATH = fileURLToPath(
  new URL('../../docs/operations/night-watch.md', import.meta.url),
);
const OPS_LOG_ISSUE_RE = /運行記録 issue:\s*\*\*#(\d+)\*\*/;

// board.status="fail" の失敗理由は自由文字列にしない。
//
// 旧設計（文字集合の denylist で検証する自由文字列 `detail`）は、Codex 実測
// 指摘（P1）で「盤面起票中に prompt injection を受けたセッションが、Sentry
// issue の raw title/message（user email 等の機微情報を含みうる）を 300 文字
// ずつ小分けにして board.detail へ流し込み、public な常設運行記録 issue へ
// 掲載する経路になる」ことが判明した。alert-issue.mjs の SENTRY_EVIDENCE_RE
// allowlist を迂回する別の書き込み経路であり、文字集合の denylist をいくら
// 強めても「安全な文字だけで構成された機微情報の断片」は通ってしまうため、
// 自由文字列である限り構造的に閉じられない。
//
// enum に固定することで、そもそも自由文字列を受け付けない設計にする。
// wrapper 内部から見た gh CLI の失敗は実務上この 5 種に収束するため
// （認証切れ・レート制限・ネットワーク断・応答パース不能・分類不能）、
// 診断価値を落とさずに攻撃面を消せる。
export const BOARD_FAIL_REASONS = new Set([
  'auth-error',
  'rate-limited',
  'network-error',
  'invalid-response',
  'unknown',
]);

// results の "skipped" outcome（dedup 検索失敗による起票見送り、SKILL.md
// §Step3 point 2）の理由 enum。Codex 実測指摘（P2）: 旧 schema は
// "green" / "issue" しか受け付けず、dedup 検索失敗という Step 3 の正当な
// 状態を運行記録で表現できなかった（結果を省略して暗黙に緑扱いにするか、
// failed へ誤って詰め込むしかなかった）。
//
// 'run-cap-reached'（#2332）は alert-issue.mjs の runAlertSync が
// `action: 'capped'` を返した時（run-scoped 起票上限に達した）の reason。
// `reserveAlertRunSlot`（lib.mjs）は「同一 check-id は 1 run 1 回まで」
// 「新規起票は MAX_NEW_ISSUES_PER_RUN 件まで」の 2 種の cap を単一 reason に
// 集約している（呼び出し側からは区別する実益が薄いため、既存の
// `dedup-search-failed` と同じ粒度に揃えた）。
export const RESULT_SKIPPED_REASONS = new Set(['dedup-search-failed', 'run-cap-reached']);

/**
 * `docs/operations/night-watch.md` から常設運行記録 issue の番号を読み取る。
 * 未登録（`**未登録**`）のままなら、Routine 登録前であることを明示するエラーを
 * 投げる。
 * @param {{ readFileImpl?: (path: string, encoding: string) => string }} [opts]
 */
export function resolveOpsLogIssueNumber({ readFileImpl = readFileSync } = {}) {
  const doc = readFileImpl(OPS_LOG_DOC_PATH, 'utf8');
  const match = doc.match(OPS_LOG_ISSUE_RE);
  if (!match) {
    throw new Error(
      '常設運行記録 issue が docs/operations/night-watch.md にまだ登録されていません（Routine 登録時に指揮台が issue 番号を確定する運用のため、それまでは Step 5 の運行記録コメントを打てません）',
    );
  }
  return Number(match[1]);
}

// GitHub issue/PR 番号の上限（現実的な値を大きく超えて余裕を持たせる）。
// 自由文字列を enum 化して閉じた exfiltration class（board.reason 等）と
// 同じ脅威モデルで、上限の無い整数は低帯域の covert channel になり得る
// （push 前反証レビュー risk-reviewer 指摘、low）。
const MAX_ISSUE_NUMBER = 9_999_999;

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_ISSUE_NUMBER;
}

/**
 * @typedef {{
 *   executed: number,
 *   failed: string[],
 *   results: Array<
 *     { checkId: string, outcome: 'green' }
 *     | { checkId: string, outcome: 'issue', issueNumber: number }
 *     | { checkId: string, outcome: 'skipped', reason: string }
 *   >,
 *   baselineRecommend: string[],
 *   board: { status: 'success', issueNumber: number } | { status: 'skip' } | { status: 'fail', reason: string },
 *   dod: { status: 'candidate', prNumber: number } | { status: 'none' },
 * }} OpsLogReport
 */

/**
 * Step 5 の運行記録レポートを検証する。1 つでも形が崩れていれば全体を拒否する
 * （alert-issue.mjs の allowlist 射影と同じ「部分的に応じない」設計）。
 * @param {unknown} report
 * @returns {asserts report is OpsLogReport}
 */
export function validateOpsLogReport(report) {
  if (typeof report !== 'object' || report === null) {
    throw new Error('report は object である必要があります');
  }
  const r = /** @type {Record<string, unknown>} */ (report);

  if (!isNonNegativeInt(r.executed) || r.executed > CHECK_IDS.size) {
    throw new Error(`executed は 0〜${CHECK_IDS.size} の整数である必要があります`);
  }
  if (!Array.isArray(r.failed) || !r.failed.every((id) => CHECK_IDS.has(id))) {
    throw new Error('failed は既知の check-id の配列である必要があります');
  }
  if (!Array.isArray(r.results)) {
    throw new Error('results は配列である必要があります');
  }
  for (const entry of r.results) {
    if (typeof entry !== 'object' || entry === null || !CHECK_IDS.has(entry.checkId)) {
      throw new Error('results の各要素は既知の check-id を持つ必要があります');
    }
    if (entry.outcome === 'green') continue;
    if (entry.outcome === 'issue' && isPositiveInt(entry.issueNumber)) continue;
    if (entry.outcome === 'skipped' && RESULT_SKIPPED_REASONS.has(entry.reason)) continue;
    throw new Error(
      'results の outcome は "green" / issueNumber 付きの "issue" / 既知 reason 付きの "skipped" のいずれかである必要があります',
    );
  }
  if (
    !Array.isArray(r.baselineRecommend) ||
    !r.baselineRecommend.every((id) => CHECK_IDS.has(id))
  ) {
    throw new Error('baselineRecommend は既知の check-id の配列である必要があります');
  }
  const board = r.board;
  if (typeof board !== 'object' || board === null) {
    throw new Error('board が必要です');
  }
  if (board.status === 'success') {
    if (!isPositiveInt(board.issueNumber)) throw new Error('board.issueNumber が不正です');
  } else if (board.status === 'skip') {
    // 追加フィールド不要
  } else if (board.status === 'fail') {
    if (!BOARD_FAIL_REASONS.has(board.reason)) {
      throw new Error(
        `board.reason は既知の理由（${[...BOARD_FAIL_REASONS].join(' / ')}）のいずれかである必要があります。gh CLI の生エラーメッセージをそのまま渡さないでください（Sentry/PR の内容が prompt injection 経由で紛れ込むと public issue へ機微情報が漏れる経路になるため、自由文字列は受け付けません）`,
      );
    }
  } else {
    throw new Error('board.status は success/skip/fail のいずれかである必要があります');
  }
  const dod = r.dod;
  if (typeof dod !== 'object' || dod === null) {
    throw new Error('dod が必要です');
  }
  if (dod.status === 'candidate') {
    if (!isPositiveInt(dod.prNumber)) throw new Error('dod.prNumber が不正です');
  } else if (dod.status !== 'none') {
    throw new Error('dod.status は candidate/none のいずれかである必要があります');
  }
}

/** @param {OpsLogReport} report */
export function buildOpsLogComment(report) {
  const today = jstDateString();
  const failedLine = report.failed.length > 0 ? report.failed.join(', ') : 'なし';
  const issueResults = report.results.filter((entry) => entry.outcome === 'issue');
  const skippedResults = report.results.filter((entry) => entry.outcome === 'skipped');
  // `failed`（取得失敗）だけがあり results に issue/skipped が無い晩でも
  // "all green" と誤記しない（push 前反証レビュー risk-reviewer 指摘、P2。
  // 取得失敗が 1 件でもあれば「異常なし」の代わりに「観測できず」として扱う
  // §Step2 の fail-closed 原則と対称）。
  const hasAnomaly =
    report.failed.length > 0 || issueResults.length > 0 || skippedResults.length > 0;
  const resultParts = [];
  if (issueResults.length > 0) {
    resultParts.push(
      `起票/追記: ${issueResults.map((entry) => `#${entry.issueNumber}（${entry.checkId}）`).join(', ')}`,
    );
  }
  if (skippedResults.length > 0) {
    resultParts.push(
      `見送り: ${skippedResults.map((entry) => `${entry.checkId}（${entry.reason}）`).join(', ')}`,
    );
  }
  const resultsLine = !hasAnomaly
    ? 'all green'
    : resultParts.length > 0
      ? resultParts.join('; ')
      : '取得失敗のみ（起票/追記なし）';
  const baselineLine =
    report.baselineRecommend.length > 0 ? report.baselineRecommend.join(', ') : 'なし';
  const boardLine =
    report.board.status === 'success'
      ? `成功（#${report.board.issueNumber}）`
      : report.board.status === 'skip'
        ? 'skip（起票済み）'
        : `失敗（${report.board.reason}）`;
  const dodLine =
    report.dod.status === 'candidate' ? `#${report.dod.prNumber}` : '前日merge PR無し';

  return `**night-watch 運行記録 ${today}**

- 実行 check 数: ${report.executed} / ${CHECK_IDS.size}（取得失敗を除く）
- 取得失敗: ${failedLine}
- ${resultsLine}
- baseline 更新推奨: ${baselineLine}
- 盤面起票: ${boardLine}
- DoD監査候補: ${dodLine}
`;
}

// #2332: alert-issue.mjs の run-scoped 起票上限（reserveAlertRunSlot）が
// 機能しているかを、Claude が渡す report JSON に頼らず wrapper 自身が同じ
// state file を直接読んで報告する（自己申告は証拠にならない。state 機構が
// 無音で無効化される fail-open クラスを Step 5 で観測可能にする）。
export function buildAlertBudgetLine(state) {
  if (!state.healthy) {
    return '- 起票予算 state: 利用不可（fail-open、無制限扱いで実行）';
  }
  return `- 起票予算 state: 有効（新規起票 ${state.createdCount}/${MAX_NEW_ISSUES_PER_RUN}、対応済み check-id ${state.actedCheckIds.length}件）`;
}

/**
 * @param {{ report: OpsLogReport, execFileImpl?: import('./lib.mjs').ExecFileImpl, readFileImpl?: (path: string, encoding: string) => string, alertRunStatePath?: string }} params
 */
export function runOpsLogReport({ report, execFileImpl, readFileImpl, alertRunStatePath }) {
  validateOpsLogReport(report);
  const issueNumber = resolveOpsLogIssueNumber({ readFileImpl });
  const alertState = readAlertRunState({ statePath: alertRunStatePath });
  const body = `${buildOpsLogComment(report)}${buildAlertBudgetLine(alertState)}\n`;
  runGh(['issue', 'comment', String(issueNumber), '--repo', REPO, '--body', body], {
    execFileImpl,
  });
  return { issueNumber };
}

const ENV_FAILURE_MESSAGES = {
  'no-var': '環境故障: DAYOPT_NIGHT_WATCH 未検出',
  'write-token': '環境故障: token に write 権限あり',
};

/**
 * Step 0 の環境故障報告。固定 2 文言のみ（自由文は受け付けない）。
 * @param {{ kind: 'no-var' | 'write-token', execFileImpl?: import('./lib.mjs').ExecFileImpl, readFileImpl?: (path: string, encoding: string) => string }} params
 */
export function runEnvFailure({ kind, execFileImpl, readFileImpl }) {
  const body = ENV_FAILURE_MESSAGES[kind];
  if (!body) {
    throw new Error(`未知の環境故障種別です: ${kind}`);
  }
  const issueNumber = resolveOpsLogIssueNumber({ readFileImpl });
  runGh(['issue', 'comment', String(issueNumber), '--repo', REPO, '--body', body], {
    execFileImpl,
  });
  return { issueNumber, kind };
}

/**
 * @typedef {{ allGreen: boolean, issued: number, observed: number }} BoardNote
 */

/** @param {BoardNote} note */
export function buildBoardNoteComment(note) {
  const status = note.allGreen ? 'all green' : '一部取得失敗';
  return `⏱ 夜勤: ${status} | 起票 ${note.issued} 件 / 観測 ${note.observed} 件`;
}

/**
 * Step 5 の「さらに」（当日盤面 issue への 1 行コメント）。宛先は
 * findTodayBoardIssue が自分で見つける（呼び出し元は issue 番号を指定しない）。
 * @param {{ note: BoardNote, execFileImpl?: import('./lib.mjs').ExecFileImpl }} params
 */
export function runBoardNote({ note, execFileImpl }) {
  if (
    typeof note !== 'object' ||
    note === null ||
    typeof note.allGreen !== 'boolean' ||
    !isNonNegativeInt(note.issued) ||
    !isNonNegativeInt(note.observed) ||
    note.issued > CHECK_IDS.size ||
    note.observed > CHECK_IDS.size
  ) {
    throw new Error(
      `note の形が不正です（allGreen: boolean, issued/observed: 0〜${CHECK_IDS.size}の整数）`,
    );
  }

  const boardIssue = findTodayBoardIssue({ execFileImpl });
  if (!boardIssue) {
    throw new Error('当日の盤面 issue が見つかりません（Step 1 が先に完了している必要があります）');
  }

  const body = buildBoardNoteComment(note);
  runGh(['issue', 'comment', String(boardIssue.number), '--repo', REPO, '--body', body], {
    execFileImpl,
  });
  return { boardIssueNumber: boardIssue.number };
}

function parseJsonArg(raw, usage) {
  try {
    return JSON.parse(raw);
  } catch {
    console.error(usage);
    throw new Error('JSON のパースに失敗しました');
  }
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
  const [subcommand, arg] = process.argv.slice(2);
  try {
    if (subcommand === 'report') {
      const report = parseJsonArg(
        arg,
        "Usage: node scripts/night-watch/run-log.mjs report '<OpsLogReport JSON>'",
      );
      console.log(JSON.stringify(runOpsLogReport({ report })));
    } else if (subcommand === 'board-note') {
      const note = parseJsonArg(
        arg,
        "Usage: node scripts/night-watch/run-log.mjs board-note '<BoardNote JSON>'",
      );
      console.log(JSON.stringify(runBoardNote({ note })));
    } else if (subcommand === 'env-failure') {
      console.log(JSON.stringify(runEnvFailure({ kind: arg })));
    } else {
      console.error(
        "Usage: node scripts/night-watch/run-log.mjs <report|board-note> '<JSON>' | env-failure <no-var|write-token>",
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'run-log failed');
    process.exitCode = 1;
  }
}
