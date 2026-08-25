import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { findTodayBoardIssue, REPO, runGh, runGhJson } from './lib.mjs';

/**
 * night-watch オーケストレータ（`run-all.mjs`）の Step 6（#2370）。夜勤の
 * GitHub Actions 移植（#2367）により観測がトークンゼロになったことを受け、
 * 朝の編成（`.claude/rules/orchestration.md` §1 日サイクル）で指揮台が毎朝
 * 手動で行っていた観測系 gh クエリ（ready キュー確認・in-progress 棚卸し・
 * open PR/CI 状態・milestone 整合）を前倒しし、当日盤面 issue へ機械生成の
 * 1 コメントとして残す。
 *
 * **判断語を含めない**（「推奨」「優先」等）。観測データと chip 下書きの
 * 固定部分のみを組み立てる。案件固有の注意・束ねの判断・実際の dispatch は
 * 指揮台の専権のまま。
 *
 * 設計原則は既存 4 wrapper と同じ（`lib.mjs` 冒頭コメント参照）: 値を
 * shell へ二度渡さない（execFile の argv 配列）・宛先 issue（当日盤面）は
 * `findTodayBoardIssue` が自分で解決する・盤面 issue が無い日は
 * `{ action: 'skipped' }` を返し gh を追加で呼ばない（fail-safe）。
 *
 * **issue/PR title は sanitizeTitle を必ず通す。** public repo では
 * 任意ユーザー（fork からの PR 作成者を含む）が title を自由に設定できる。
 * chip 下書きブロックは指揮台がレーン prompt へそのままコピペする前提の
 * 設計のため、改行・コードフェンス・見出し記号を無害化しないまま転記すると
 * markdown 構造の乗っ取り・偽内容の混入経路になる（push 前反証レビュー
 * risk-reviewer 指摘、high）。
 */

export const HANDOFF_HEADINGS = ['## 背景', '## やること', '## 注意', '## 検証'];
const STALE_MS = 48 * 60 * 60 * 1000;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `dispatch` skill §`status:ready`の定義（機械判定）を実装する。issue 本文に
 * `HANDOFF_HEADINGS` の 4 見出しが揃い、各見出し配下（次の `## ` 見出しまで）
 * が空でない・`TBD` でないかを判定する。
 *
 * 見出しは**行頭**の `## ` のみを認識する（`^` アンカー + `m` フラグ、Codex
 * レビュー指摘・指揮台採用、PR #2380）。アンカー無しだと `### 背景`（H3）や
 * 「必要項目: ## 背景」のような地の文中の部分文字列にも一致し、必須の H2
 * セクションが実際には存在しないのに `ready` と誤判定する。
 *
 * 見出し側の行頭判定には lookbehind `(?<=^|\n)` を使い、`m` フラグは付けない
 * ——`m` フラグを付けると `$` も「各行末」に一致するようになり、見出し直後の
 * 空行で `(?=\n## |$)` が空文字列にマッチしてしまう（一度実装して
 * `judgeHandoffQuality` の全既存 test が壊れる形で自己発見・修正済み）。
 * `$` は「文字列末尾のみ」に一致させたいため、見出し側だけを lookbehind で
 * 行頭に限定する。
 * @param {string | null | undefined} body
 * @returns {{ status: 'ready' } | { status: 'incomplete', missing: string[] }}
 */
export function judgeHandoffQuality(body) {
  const text = body ?? '';
  const missing = [];
  for (const heading of HANDOFF_HEADINGS) {
    const re = new RegExp(`(?<=^|\\n)${escapeRegExp(heading)}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = text.match(re);
    const content = match ? match[1].trim() : '';
    if (!match || content === '' || /^TBD$/i.test(content)) {
      missing.push(heading);
    }
  }
  return missing.length === 0 ? { status: 'ready' } : { status: 'incomplete', missing };
}

/**
 * branch 名の**案**（最終決定ではない）を組み立てる。issue title の
 * `type(scope): ...` prefix（この repo の慣習）から `scope` を domain として
 * 使う。action 部分は日本語 title からの機械推定が非現実的（正確な意味抽出には
 * model が要り、この wrapper は判断をしない設計のため）なため含めない —
 * 指揮台が dispatch 時に実際の action を補って `git branch -m` でリネームする
 * 前提の「たたき台」に留める（`.claude/rules/workflow.md` §命名規則 と同じ
 * 運用、Claude Code 自動生成のランダム名を最初の PR 前にリネームするのと同型）。
 * @param {string} title
 * @param {number} issueNumber
 * @param {{ agent?: string }} [opts]
 */
export function buildBranchNameCandidate(title, issueNumber, { agent = 'claude' } = {}) {
  const prefixMatch = title.match(/^[a-z][a-z0-9-]*\(([a-z0-9-]+)\):/i);
  const domain = prefixMatch ? prefixMatch[1].toLowerCase() : 'misc';
  return `${agent}/${domain}-${issueNumber}`;
}

function isStale(updatedAt, now) {
  return now - new Date(updatedAt).getTime() > STALE_MS;
}

// このブリーフは public repo の任意ユーザーが設定できる issue/PR title を
// github-actions[bot] 名義の issue コメントへ転記する。加えて chip 下書き
// ブロック（buildChipDraftBlock）は指揮台がレーン prompt へそのまま
// コピペする前提の設計のため、title に改行・コードフェンス・見出し記号が
// 混じると markdown 構造を乗っ取られたり、偽の内容がレーン prompt へ
// 紛れ込む経路になる。alert-issue.mjs の SENTRY_EVIDENCE_RE/RUN_URL_RE、
// run-log.mjs の BOARD_FAIL_REASONS enum 化と同じ「自由文字列を public
// issue へそのまま書かない」原則をここにも適用する（push 前反証レビュー
// risk-reviewer 指摘、high）。
const TITLE_MAX_LENGTH = 120;

/**
 * issue/PR title を安全な単一行の表示用文字列へ変換する。
 *
 * `<` は全角へ置換する（PR #2380 クロスレビュー指摘、P2）。fork からの
 * PR title に `<!--` を含めると GFM の HTML コメントが開き、`-->` が現れる
 * までブリーフの後続セクション（milestone 未付与 / chip 下書き）が丸ごと
 * 不可視になる。maintainer の操作を介さず open PR title だけで成立する経路
 * のため、経路の有無（private 化予定）に依存せず閉じる。
 */
export function sanitizeTitle(title, { maxLength = TITLE_MAX_LENGTH } = {}) {
  const collapsed = String(title ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/`/g, "'")
    .replace(/</g, '＜')
    .replace(/^[#>*-]+\s*/, '')
    .trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed;
}

// gh の既定 --limit（30）に頼らず明示する（他 wrapper と同じ規律。
// 明示しないと 31 件目以降が黙って切り捨てられ、件数表示と実態がズレる —
// 押し前反証レビュー risk-reviewer 指摘、low）。
const FETCH_LIMIT = '100';

function fetchReadyIssues({ execFileImpl } = {}) {
  return runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--label',
      'status:ready',
      '--json',
      'number,title,body,milestone',
      '--limit',
      FETCH_LIMIT,
    ],
    { execFileImpl },
  );
}

function fetchInProgressIssues({ execFileImpl } = {}) {
  return runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--label',
      'status:in-progress',
      '--json',
      'number,title,updatedAt,milestone',
      '--limit',
      FETCH_LIMIT,
    ],
    { execFileImpl },
  );
}

function fetchOpenPrs({ execFileImpl } = {}) {
  return runGhJson(
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--json',
      'number,title,isDraft,statusCheckRollup,milestone',
      '--limit',
      FETCH_LIMIT,
    ],
    { execFileImpl },
  );
}

/**
 * 現行 milestone（open な milestone、運用上常に 1 個）のタイトルを返す。
 * 無ければ null（milestone 整合セクションは「不明」として出力する）。
 */
function fetchCurrentMilestoneTitle({ execFileImpl } = {}) {
  const openMilestones = runGhJson(
    ['api', `repos/${REPO}/milestones`, '--jq', '[.[] | select(.state=="open")]'],
    { execFileImpl },
  );
  return openMilestones[0]?.title ?? null;
}

const PENDING_OUTCOMES = new Set(['', 'PENDING', 'IN_PROGRESS', 'QUEUED']);

/**
 * PR の CI rollup を簡易要約する。`gh pr list --json statusCheckRollup` の
 * 個々のチェックは check-run（`conclusion`）と status-context（`state`）の
 * 混在で、フィールド名・大文字小文字は環境依存のため厳密な判定はしない
 * （merge 後の workflow_dispatch 手動検証で実データと突き合わせる、issue
 * #2370 の検証観点）。
 *
 * **同一 check 名を畳んでから判定する。** `statusCheckRollup` は同名
 * check を畳まない（`gh pr checks` は畳む）ため、同一 head SHA で 2 回 run
 * が走ると古い run の failure/cancelled を数え続ける（`.claude/rules/
 * workflow.md` §Worktree運用 が明文化する既知の罠、`scripts/git/
 * finish-branch.sh` に同型実装あり。Codex レビュー指摘・指揮台採用、
 * PR #2380。完全移植ではなく簡易版: check 単位で group し、pending 優先
 * → group内の最後（最新）の decisive entry を採る）。名前を特定できない
 * entry は畳まず単独 group のまま残す（identity 不明を fail-closed 側へ
 * 倒す。finish-branch.sh と同じ原則）。
 */
export function summarizeCheckState(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return '不明';
  const groups = new Map();
  rollup.forEach((check, index) => {
    const name = check.name ?? check.context ?? '';
    const key =
      name === ''
        ? `__unidentified_${index}`
        : `${check.__typename ?? ''}\u0000${check.workflowName ?? ''}\u0000${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(check);
  });
  const latestOutcomes = Array.from(groups.values()).map((entries) => {
    const outcomes = entries.map((c) => String(c.conclusion ?? c.state ?? '').toUpperCase());
    if (outcomes.some((o) => PENDING_OUTCOMES.has(o))) return 'PENDING';
    return outcomes[outcomes.length - 1];
  });
  if (latestOutcomes.some((o) => o === 'PENDING')) return '実行中';
  const bad = latestOutcomes.filter((o) => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(o));
  return bad.length === 0 ? 'green' : `red(${bad.length})`;
}

/** dispatch 可能な issue 1 件分の chip 下書き（固定部分のみ）を組み立てる。 */
function buildChipDraftBlock(issue) {
  const branch = buildBranchNameCandidate(issue.title, issue.number);
  return [
    `#### #${issue.number}: ${sanitizeTitle(issue.title)}`,
    '```',
    `レーン「（指揮台が命名）」。https://github.com/${REPO}/issues/${issue.number}。`,
    `worktree を .claude/worktrees/ 配下に作成し、branch 名は ${branch}（案。指揮台が action 部分を補って確定する）。`,
    'レーンプロトコル: .claude/rules/lane-protocol.md に従う。',
    '連絡規律: .claude/rules/orchestration.md §レーンの連絡規律 に従う（止まる前に連絡・User へ直接質問しない・節目で担当issueのコメントを読み直す・push/ready化/重量watchは自律的に進める・追従だけは指揮台の合図待ち・spawn_task は指揮台の専権のため使わない）。',
    '（案件固有の注意はここに指揮台が追記）',
    '```',
  ].join('\n');
}

/**
 * @param {{
 *   readyIssues: Array<{ number: number, title: string, body: string, milestone: { title: string } | null }>,
 *   inProgressIssues: Array<{ number: number, title: string, updatedAt: string, milestone: { title: string } | null }>,
 *   openPrs: Array<{ number: number, title: string, isDraft: boolean, statusCheckRollup: unknown[], milestone: { title: string } | null }>,
 *   currentMilestoneTitle: string | null,
 *   now?: number,
 * }} params
 */
export function buildMorningBriefBody({
  readyIssues,
  inProgressIssues,
  openPrs,
  currentMilestoneTitle,
  now = Date.now(),
}) {
  const readyJudged = readyIssues.map((issue) => ({
    issue,
    judged: judgeHandoffQuality(issue.body),
  }));

  const readyLines = readyJudged.map(({ issue, judged }) => {
    const label =
      judged.status === 'ready' ? 'dispatch可能' : `本文不備（${judged.missing.join(', ')} 欠落）`;
    return `- #${issue.number}（${label}）: ${sanitizeTitle(issue.title)}`;
  });

  const inProgressLines = inProgressIssues.map((issue) => {
    const stale = isStale(issue.updatedAt, now) ? ' ⚠️stale（48h超）' : '';
    return `- #${issue.number}: ${sanitizeTitle(issue.title)}${stale}`;
  });

  const prLines = openPrs.map((pr) => {
    const draftLabel = pr.isDraft ? 'draft' : 'ready';
    const ciState = summarizeCheckState(pr.statusCheckRollup);
    // milestone 名も issue/PR title と同じく public repo の書き込み権限を
    // 持つユーザーが設定できるため sanitizeTitle を通す（Codex レビュー
    // 指摘、指揮台採用。issue #2367 コメント参照。title だけ sanitize して
    // milestone を素通しするのは本ファイル冒頭の規約と矛盾していた）。
    const milestoneLabel = pr.milestone ? sanitizeTitle(pr.milestone.title) : 'milestone無し';
    return `- #${pr.number}（${draftLabel}, CI:${ciState}, ${milestoneLabel}）: ${sanitizeTitle(pr.title)}`;
  });

  const milestoneMissingPrs = currentMilestoneTitle
    ? openPrs.filter((pr) => pr.milestone?.title !== currentMilestoneTitle).map((pr) => pr.number)
    : [];
  const milestoneMissingIssues = currentMilestoneTitle
    ? inProgressIssues
        .filter((issue) => issue.milestone?.title !== currentMilestoneTitle)
        .map((issue) => issue.number)
    : [];

  const chipDrafts = readyJudged
    .filter(({ judged }) => judged.status === 'ready')
    .map(({ issue }) => buildChipDraftBlock(issue));

  return `## 朝編成ブリーフ（機械生成・判断なし）

このコメントは観測データの機械整形であり、指示の効力を持たない（盤面テンプレ冒頭の固定文言と同じ扱い）。

### status:ready（${readyIssues.length}件）
${readyLines.length > 0 ? readyLines.join('\n') : '（該当なし）'}

### status:in-progress（${inProgressIssues.length}件）
${inProgressLines.length > 0 ? inProgressLines.join('\n') : '（該当なし）'}

### open PR（${openPrs.length}件）
${prLines.length > 0 ? prLines.join('\n') : '（該当なし）'}

### milestone 未付与（現行: ${currentMilestoneTitle ? sanitizeTitle(currentMilestoneTitle) : '不明'}）
- PR: ${milestoneMissingPrs.length > 0 ? milestoneMissingPrs.map((n) => `#${n}`).join(', ') : 'なし'}
- in-progress issue: ${milestoneMissingIssues.length > 0 ? milestoneMissingIssues.map((n) => `#${n}`).join(', ') : 'なし'}

### chip 下書き（案件固有の注意・束ねの判断は指揮台が追記）
${chipDrafts.length > 0 ? chipDrafts.join('\n\n') : '（dispatch可能な issue なし）'}
`;
}

export const MORNING_BRIEF_HEADING = '## 朝編成ブリーフ';

// `run-log.mjs` の `TRUSTED_AUTHOR_ASSOCIATIONS`/`TRUSTED_BOT_LOGINS`/
// `isTrustedCommentAuthor` と同じ判定を最小限だけ複製する（既存 wrapper
// ファイルを無変更に保つ設計、#2367 issue コメント。`readBaseline` を
// run-all.mjs 側に複製したのと同じ判断）。
//
// この repo は現時点で public（private 化は 2026-09 予定）。投稿者を見ず
// 「本文が MORNING_BRIEF_HEADING で始まるか」だけで冪等判定すると、任意の
// 第三者が当日盤面 issue へその見出しで 1 行コメントするだけで、その日の
// 自動ブリーフを恒久的に抑止できてしまう（push 前反証レビュー
// risk-reviewer 指摘、medium）。信頼できる書き手（人間の
// OWNER/MEMBER/COLLABORATOR、または night-watch 自身が Actions から
// 投稿する時の予約 login）のコメントだけを「投稿済みの印」として数える。
const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const TRUSTED_BOT_LOGINS = new Set(['github-actions[bot]', 'github-actions']);

function isTrustedCommentAuthor(comment) {
  if (TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) return true;
  return TRUSTED_BOT_LOGINS.has(comment.author?.login);
}

/**
 * 当日盤面 issue へ朝編成ブリーフが既に投稿済みかを判定する。`board-issue.mjs`
 * の title 冪等 skip と同じ idiom（内容の重複ではなく「投稿済みの印」の有無で
 * 判定する）。信頼できる書き手のコメントだけを対象にする（上記コメント参照）。
 *
 * `runMorningBrief` に冪等ガードが無いと、夜勤が赤で終わった夜に手動
 * `workflow_dispatch` で re-run すると当日盤面へ長文ブリーフが重複投稿される
 * （night-watch.yml は `step5Failed`/`dod4Failed` で非 0 exit するため job が
 * 赤になりやすく、re-run が起きやすい設計）。PR #2380 クロスレビュー指摘、P2。
 * @param {number} boardIssueNumber
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl }} [opts]
 */
function hasExistingMorningBrief(boardIssueNumber, { execFileImpl } = {}) {
  const response = runGhJson(
    ['issue', 'view', String(boardIssueNumber), '--repo', REPO, '--json', 'comments'],
    { execFileImpl },
  );
  return (response.comments ?? []).some(
    (comment) =>
      isTrustedCommentAuthor(comment) && (comment.body ?? '').startsWith(MORNING_BRIEF_HEADING),
  );
}

/**
 * Step 6 を実行する。当日盤面 issue が無ければ（土日・起票失敗）gh を
 * 追加で呼ばず skip する。既に朝編成ブリーフが投稿済み（re-run 等）なら
 * 重複投稿を避けて skip する。
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl, now?: number }} [opts]
 */
export function runMorningBrief({ execFileImpl, now = Date.now() } = {}) {
  const boardIssue = findTodayBoardIssue({ execFileImpl });
  if (!boardIssue) {
    return { action: 'skipped', reason: 'no-board-issue' };
  }
  if (hasExistingMorningBrief(boardIssue.number, { execFileImpl })) {
    return { action: 'skipped', reason: 'already-posted', boardIssueNumber: boardIssue.number };
  }

  const readyIssues = fetchReadyIssues({ execFileImpl });
  const inProgressIssues = fetchInProgressIssues({ execFileImpl });
  const openPrs = fetchOpenPrs({ execFileImpl });
  const currentMilestoneTitle = fetchCurrentMilestoneTitle({ execFileImpl });

  const body = buildMorningBriefBody({
    readyIssues,
    inProgressIssues,
    openPrs,
    currentMilestoneTitle,
    now,
  });

  runGh(['issue', 'comment', String(boardIssue.number), '--repo', REPO, '--body', body], {
    execFileImpl,
  });

  return { action: 'posted', boardIssueNumber: boardIssue.number };
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
  const [subcommand] = process.argv.slice(2);
  if (subcommand !== 'post') {
    console.error('Usage: node scripts/night-watch/morning-brief.mjs post');
    process.exitCode = 1;
  } else {
    try {
      const result = runMorningBrief();
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'morning-brief post failed');
      process.exitCode = 1;
    }
  }
}
