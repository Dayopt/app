import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  findTodayBoardIssue,
  isJstWeekend,
  jstDateString,
  MAX_NEW_ISSUES_PER_RUN,
  readAlertRunState,
  REPO,
  runGh,
  runGhJson,
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
 *     | { checkId: string, outcome: 'pending' }
 *     | { checkId: string, outcome: 'issue', issueNumber: number }
 *     | { checkId: string, outcome: 'skipped', reason: string }
 *   >,
 *   baselineRecommend: string[],
 *   board: { status: 'success', issueNumber: number } | { status: 'skip' } | { status: 'weekend' } | { status: 'fail', reason: string },
 *   dod: { status: 'candidate', prNumber: number } | { status: 'none' } | { status: 'weekend' },
 * }} OpsLogReport
 */

// #2350 クロスレビュー指摘（P3、risk-reviewer low）: board.status/dod.status
// の "weekend" クロス検証を「現在時刻の JST 曜日」だけに固定すると、指揮台が
// 土曜分の観測を翌月曜（平日）に手動代行で catch-up 投稿した場合に
// throw してしまい、night-watch 唯一の故障検出チャネルが無音化する。
// 「今日 or 昨日（JST）が土日」まで許容し、翌営業日の catch-up を通す。
function isJstWeekendLenient() {
  return isJstWeekend() || isJstWeekend(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

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
    // 'pending'（#2350 クロスレビュー指摘 P2）: heavy-red/integration-red で
    // 直近 run が未完了だった check-id。旧設計は「取得失敗」（コマンド自体の
    // 非0 exit/パース不能）と合流させていたため、運行記録を読む側が「gh 認証
    // 切れ」と「単に実行中」を区別できなかった。両者は原因が異なるため
    // 分離する（詳細は checkRecentPending の doc comment 参照）。
    if (entry.outcome === 'pending') continue;
    if (entry.outcome === 'issue' && isPositiveInt(entry.issueNumber)) continue;
    if (entry.outcome === 'skipped' && RESULT_SKIPPED_REASONS.has(entry.reason)) continue;
    throw new Error(
      'results の outcome は "green" / "pending" / issueNumber 付きの "issue" / 既知 reason 付きの "skipped" のいずれかである必要があります',
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
  } else if (board.status === 'weekend') {
    // #2342: JST 土日（Step 1 が isJstWeekend 判定で gh を一切呼ばず skip する
    // 日）専用の値。'skip'（起票済み・重複回避）と意味が異なるため区別する。
    // #2350 クロスレビュー指摘（P3）: 自己申告のみだと平日にも weekend を
    // 名乗れてしまうため、実際の JST 曜日とクロス検証する（今日 or 昨日が
    // 土日なら許容 — 翌営業日の手動代行 catch-up を無音化しないため）。
    if (!isJstWeekendLenient()) {
      throw new Error(
        'board.status="weekend" は JST 土日（または翌営業日の catch-up）のみ使用できます',
      );
    }
  } else if (board.status === 'fail') {
    if (!BOARD_FAIL_REASONS.has(board.reason)) {
      throw new Error(
        `board.reason は既知の理由（${[...BOARD_FAIL_REASONS].join(' / ')}）のいずれかである必要があります。gh CLI の生エラーメッセージをそのまま渡さないでください（Sentry/PR の内容が prompt injection 経由で紛れ込むと public issue へ機微情報が漏れる経路になるため、自由文字列は受け付けません）`,
      );
    }
  } else {
    throw new Error('board.status は success/skip/fail/weekend のいずれかである必要があります');
  }
  const dod = r.dod;
  if (typeof dod !== 'object' || dod === null) {
    throw new Error('dod が必要です');
  }
  if (dod.status === 'candidate') {
    if (!isPositiveInt(dod.prNumber)) throw new Error('dod.prNumber が不正です');
  } else if (dod.status === 'weekend') {
    // 'weekend' は #2342: JST 土日（Step 4 が isJstWeekend 判定で skip する日）
    // 専用の値。'none'（前日merge PR無し）と意味が異なるため区別する。
    // #2350 クロスレビュー指摘（P3）: board.status と同じくクロス検証する
    // （今日 or 昨日が土日なら許容）。
    if (!isJstWeekendLenient()) {
      throw new Error(
        'dod.status="weekend" は JST 土日（または翌営業日の catch-up）のみ使用できます',
      );
    }
  } else if (dod.status !== 'none') {
    throw new Error('dod.status は candidate/none/weekend のいずれかである必要があります');
  }
}

/** @param {OpsLogReport} report */
export function buildOpsLogComment(report) {
  const today = jstDateString();
  const failedLine = report.failed.length > 0 ? report.failed.join(', ') : 'なし';
  const issueResults = report.results.filter((entry) => entry.outcome === 'issue');
  const pendingResults = report.results.filter((entry) => entry.outcome === 'pending');
  const skippedResults = report.results.filter((entry) => entry.outcome === 'skipped');
  // `failed`（取得失敗）だけがあり results に issue/pending/skipped が無い晩
  // でも "all green" と誤記しない（push 前反証レビュー risk-reviewer 指摘、
  // P2。取得失敗が 1 件でもあれば「異常なし」の代わりに「観測できず」として
  // 扱う §Step2 の fail-closed 原則と対称）。pending（run 未完了で判定保留）も
  // 同様に「異常なし」ではないため hasAnomaly に含める（#2350 クロスレビュー
  // 指摘 P2）。
  const hasAnomaly =
    report.failed.length > 0 ||
    issueResults.length > 0 ||
    pendingResults.length > 0 ||
    skippedResults.length > 0;
  const resultParts = [];
  if (issueResults.length > 0) {
    resultParts.push(
      `起票/追記: ${issueResults.map((entry) => `#${entry.issueNumber}（${entry.checkId}）`).join(', ')}`,
    );
  }
  if (pendingResults.length > 0) {
    resultParts.push(
      `保留（run未完了）: ${pendingResults.map((entry) => entry.checkId).join(', ')}`,
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
        : report.board.status === 'weekend'
          ? 'skip（土日）'
          : `失敗（${report.board.reason}）`;
  const dodLine =
    report.dod.status === 'candidate'
      ? `#${report.dod.prNumber}`
      : report.dod.status === 'weekend'
        ? 'skip（土日）'
        : '前日merge PR無し';

  return `**night-watch 運行記録 ${today}**

- 実行 check 数: ${report.executed} / ${CHECK_IDS.size}（取得失敗を除く）
- 取得失敗: ${failedLine}
- ${resultsLine}
- baseline 更新推奨: ${baselineLine}
- 盤面起票: ${boardLine}
- DoD監査候補: ${dodLine}
`;
}

// Step 5 の運行記録コメント本文で「night-watch 運行記録」レポートだけを
// env-failure 等の他コメントと区別するための見出し（buildOpsLogComment が
// 組み立てる本文の先頭行と一致させる）。日付部分は後続の distinct-date 判定
// のため capture する。
const OPS_LOG_COMMENT_HEADER_RE = /^\*\*night-watch 運行記録 (\d{4}-\d{2}-\d{2})\*\*/;
// 「保留（run未完了）: <check-id>, ...」行から check-id 一覧を取り出す。
const PENDING_LINE_RE = /^- 保留（run未完了）: (.+)$/m;

// 常設運行記録 issue は 2026-09 private 化までは public repo 上にあり、
// wrapper 自身は write 権限を持たない token だが、issue へのコメント投稿は
// GitHub 上の誰でも行える（#2350 クロスレビュー指摘、risk-reviewer medium）。
// 「night-watch 運行記録」の見出し文字列を含む偽コメントを第三者が投げると、
// (a) 偽の保留行で escalation を誤発火させる、または (b) 保留行を欠いた
// 偽コメントで真の 2 晩連続を分断し escalation を無音化できてしまう
// （後者は本機能が塞ごうとした無音化そのものの再演）。finish-branch.sh の
// marker gate と同じ idiom（OWNER/MEMBER/COLLABORATOR のみ信頼）で防ぐ。
const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * #2350 クロスレビュー指摘（P2-1）: heavy-red/integration-red が pending
 * （直近 run 未完了）と判定される class は、runner 枯渇・workflow 定義破損
 * 等で run が恒久的に完了しない場合、毎晩 pending を積むだけで
 * `alert-issue.mjs` が二度と呼ばれず、無期限に無音のまま気づかれない
 * （behavior-verifier 指摘）。これを検出するため、常設運行記録 issue の
 * 直近コメントから、信頼できる書き手（OWNER/MEMBER/COLLABORATOR）による
 * 「night-watch 運行記録」形式のものだけを新しい順に抽出し、**日付が異なる**
 * 直近 `lookback` 件（既定 2）**すべて**で同一 check-id が pending だったかを
 * machine で判定する。日付が異なることを要求するのは、手動代行との重複投稿
 * などで同じ晩の 2 件を「2 晩連続」と誤カウントしないため。
 *
 * env-failure 等の他コメント・非信頼書き手のコメントは対象外（その晩は
 * Step 2 が実際には走っていない、または偽装の疑いがあるため pending の
 * 連続カウントに含めない）。直近コメントが `lookback` 件に満たない場合
 * （運用開始直後等）は `consecutivePending: false` を返す（fail-open。
 * 判定材料が無い状態で赤に倒すと誤起票になる）。
 * @param {string} checkId
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl, readFileImpl?: (path: string, encoding: string) => string, lookback?: number }} [opts]
 * @returns {{ consecutivePending: boolean, reportsChecked: number }}
 */
export function checkRecentPending(checkId, { execFileImpl, readFileImpl, lookback = 2 } = {}) {
  if (!CHECK_IDS.has(checkId)) {
    throw new Error(`未知の check-id です: ${checkId}`);
  }
  const issueNumber = resolveOpsLogIssueNumber({ readFileImpl });
  const response = runGhJson(
    ['issue', 'view', String(issueNumber), '--repo', REPO, '--json', 'comments'],
    { execFileImpl },
  );
  const seenDates = new Set();
  const reports = [];
  for (const comment of (response.comments ?? []).slice().reverse()) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) continue;
    const match = OPS_LOG_COMMENT_HEADER_RE.exec(comment.body ?? '');
    if (!match) continue;
    const date = match[1];
    if (seenDates.has(date)) continue; // 同日の重複投稿は 1 件に畳む
    seenDates.add(date);
    reports.push(comment);
    if (reports.length === lookback) break;
  }
  if (reports.length < lookback) {
    return { consecutivePending: false, reportsChecked: reports.length };
  }
  const consecutivePending = reports.every((comment) => {
    const match = comment.body.match(PENDING_LINE_RE);
    if (!match) return false;
    return match[1].split(',').some((id) => id.trim() === checkId);
  });
  return { consecutivePending, reportsChecked: reports.length };
}

// #2332: alert-issue.mjs の run-scoped 起票上限（reserveAlertRunSlot）が
// 機能しているかを、Claude が渡す report JSON に頼らず wrapper 自身が同じ
// state file を直接読んで報告する（自己申告は証拠にならない。state 機構が
// 無音で無効化される fail-open クラスを Step 5 で観測可能にする）。
//
// `report` も渡すのは、state の書き込み失敗（EACCES/EROFS 等、JSON.parse
// 自体は起きない = readAlertRunState が ENOENT と区別できない失敗）を検出
// するため（push前反証レビュー risk-reviewer 指摘、P2）。
// reserveAlertRunSlot は書き込み失敗時も fail-open で `{allowed:true}` を
// 返す（P2-3 是正）ため gh は正常に呼ばれるが、その check-id は
// actedCheckIds に載らない。結果として「実際は起票/追記が起きたのに state
// 上は 0 件」という不整合が生まれ、何も手当てしないと healthy: true のまま
// 「有効（0/3、0件）」と誤報告される。`report.results` の `outcome: 'issue'`
// 件数（実際に起票/追記された check-id 数）が `actedCheckIds.length` を
// 上回っていれば、state が実態を反映できていない徴候として「利用不可」へ倒す。
export function buildAlertBudgetLine(state, report) {
  if (!state.healthy) {
    return '- 起票予算 state: 利用不可（fail-open、無制限扱いで実行）';
  }
  const actedIssueCount = (report?.results ?? []).filter(
    (entry) => entry.outcome === 'issue',
  ).length;
  if (state.actedCheckIds.length < actedIssueCount) {
    return '- 起票予算 state: 利用不可（fail-open、state 書き込み失敗の疑い。起票実績が state の記録より多い）';
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
  const body = `${buildOpsLogComment(report)}${buildAlertBudgetLine(alertState, report)}\n`;
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
 *
 * **平日のみ実行する**（push前反証レビュー risk-reviewer 指摘、P2）。
 * board-issue.mjs が Step 1 の起票を平日のみに絞った（#2334 コメント）ため、
 * JST 土日は当日盤面 issue という宛先が存在せず、`findTodayBoardIssue` が
 * 必ず null を返して例外を投げていた（毎週 2 回、確実に「故障に見える失敗」
 * が出る回帰）。board-issue.mjs / dod-candidate.mjs と同じ設計（gh を一切
 * 呼ばずに skip）で閉じる。
 * @param {{ note: BoardNote, execFileImpl?: import('./lib.mjs').ExecFileImpl }} params
 */
export function runBoardNote({ note, execFileImpl }) {
  if (isJstWeekend()) {
    return { action: 'skipped', reason: 'weekend' };
  }

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
    } else if (subcommand === 'recent-pending') {
      console.log(JSON.stringify(checkRecentPending(arg)));
    } else {
      console.error(
        "Usage: node scripts/night-watch/run-log.mjs <report|board-note> '<JSON>' | env-failure <no-var|write-token> | recent-pending <check-id>",
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'run-log failed');
    process.exitCode = 1;
  }
}
