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
 * @param {string | null | undefined} body
 * @returns {{ status: 'ready' } | { status: 'incomplete', missing: string[] }}
 */
export function judgeHandoffQuality(body) {
  const text = body ?? '';
  const missing = [];
  for (const heading of HANDOFF_HEADINGS) {
    const re = new RegExp(`${escapeRegExp(heading)}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
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

/**
 * PR の CI rollup を簡易要約する。`gh pr list --json statusCheckRollup` の
 * 個々のチェックは check-run（`conclusion`）と status-context（`state`）の
 * 混在で、フィールド名・大文字小文字は環境依存のため厳密な判定はしない
 * （merge 後の workflow_dispatch 手動検証で実データと突き合わせる、issue
 * #2370 の検証観点）。
 */
function summarizeCheckState(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return '不明';
  const outcomes = rollup.map((c) => String(c.conclusion ?? c.state ?? '').toUpperCase());
  if (outcomes.some((o) => o === '' || o === 'PENDING' || o === 'IN_PROGRESS' || o === 'QUEUED')) {
    return '実行中';
  }
  const bad = outcomes.filter((o) => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(o));
  return bad.length === 0 ? 'green' : `red(${bad.length})`;
}

/** dispatch 可能な issue 1 件分の chip 下書き（固定部分のみ）を組み立てる。 */
function buildChipDraftBlock(issue) {
  const branch = buildBranchNameCandidate(issue.title, issue.number);
  return [
    `#### #${issue.number}: ${issue.title}`,
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
    return `- #${issue.number}（${label}）: ${issue.title}`;
  });

  const inProgressLines = inProgressIssues.map((issue) => {
    const stale = isStale(issue.updatedAt, now) ? ' ⚠️stale（48h超）' : '';
    return `- #${issue.number}: ${issue.title}${stale}`;
  });

  const prLines = openPrs.map((pr) => {
    const draftLabel = pr.isDraft ? 'draft' : 'ready';
    const ciState = summarizeCheckState(pr.statusCheckRollup);
    const milestoneLabel = pr.milestone ? pr.milestone.title : 'milestone無し';
    return `- #${pr.number}（${draftLabel}, CI:${ciState}, ${milestoneLabel}）: ${pr.title}`;
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

### milestone 未付与（現行: ${currentMilestoneTitle ?? '不明'}）
- PR: ${milestoneMissingPrs.length > 0 ? milestoneMissingPrs.map((n) => `#${n}`).join(', ') : 'なし'}
- in-progress issue: ${milestoneMissingIssues.length > 0 ? milestoneMissingIssues.map((n) => `#${n}`).join(', ') : 'なし'}

### chip 下書き（案件固有の注意・束ねの判断は指揮台が追記）
${chipDrafts.length > 0 ? chipDrafts.join('\n\n') : '（dispatch可能な issue なし）'}
`;
}

/**
 * Step 6 を実行する。当日盤面 issue が無ければ（土日・起票失敗）gh を
 * 追加で呼ばず skip する。
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl, now?: number }} [opts]
 */
export function runMorningBrief({ execFileImpl, now = Date.now() } = {}) {
  const boardIssue = findTodayBoardIssue({ execFileImpl });
  if (!boardIssue) {
    return { action: 'skipped', reason: 'no-board-issue' };
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
