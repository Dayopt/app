import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findTodayBoardIssue, jstDateString, REPO, runGh } from './lib.mjs';

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
  'sentry-new',
]);

const OPS_LOG_DOC_PATH = fileURLToPath(
  new URL('../../docs/operations/night-watch.md', import.meta.url),
);
const OPS_LOG_ISSUE_RE = /運行記録 issue:\s*\*\*#(\d+)\*\*/;

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

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * @typedef {{
 *   executed: number,
 *   failed: string[],
 *   results: Array<{ checkId: string, outcome: 'green' } | { checkId: string, outcome: 'issue', issueNumber: number }>,
 *   baselineRecommend: string[],
 *   board: { status: 'success', issueNumber: number } | { status: 'skip' } | { status: 'fail', detail: string },
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

  if (!isNonNegativeInt(r.executed) || r.executed > 6) {
    throw new Error('executed は 0〜6 の整数である必要があります');
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
    throw new Error(
      'results の outcome は "green" か、issueNumber 付きの "issue" である必要があります',
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
    if (
      typeof board.detail !== 'string' ||
      board.detail.length === 0 ||
      board.detail.length > 300
    ) {
      throw new Error('board.detail は 1〜300 文字である必要があります');
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
  const resultsLine =
    issueResults.length === 0
      ? 'all green'
      : `起票/追記: ${issueResults.map((entry) => `#${entry.issueNumber}（${entry.checkId}）`).join(', ')}`;
  const baselineLine =
    report.baselineRecommend.length > 0 ? report.baselineRecommend.join(', ') : 'なし';
  const boardLine =
    report.board.status === 'success'
      ? `成功（#${report.board.issueNumber}）`
      : report.board.status === 'skip'
        ? 'skip（起票済み）'
        : `失敗（${report.board.detail}）`;
  const dodLine =
    report.dod.status === 'candidate' ? `#${report.dod.prNumber}` : '前日merge PR無し';

  return `**night-watch 運行記録 ${today}**

- 実行 check 数: ${report.executed} / 6（取得失敗を除く）
- 取得失敗: ${failedLine}
- ${resultsLine}
- baseline 更新推奨: ${baselineLine}
- 盤面起票: ${boardLine}
- DoD監査候補: ${dodLine}
`;
}

/**
 * @param {{ report: OpsLogReport, execFileImpl?: import('./lib.mjs').ExecFileImpl, readFileImpl?: (path: string, encoding: string) => string }} params
 */
export function runOpsLogReport({ report, execFileImpl, readFileImpl }) {
  validateOpsLogReport(report);
  const issueNumber = resolveOpsLogIssueNumber({ readFileImpl });
  const body = buildOpsLogComment(report);
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
    note.observed > 6
  ) {
    throw new Error('note の形が不正です（allGreen: boolean, issued/observed: 0以上の整数）');
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
