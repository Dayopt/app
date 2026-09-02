import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO, runGh, runGhJson } from '../lib/gh.mjs';
import { isDirectExecution } from '../lib/is-direct-execution.mjs';
import {
  computeExplorationBeforeEdit,
  cwdPrefixToProjectDirSegment,
  human,
  isSubagentFilePath,
  listJsonlFiles,
  normalizeModelLabel,
  PROJECTS_DIR,
} from './ai-usage.mjs';
import { detectJudgmentRecords, extractLinkedIssueNumbers } from './ctx.mjs';

/**
 * `pnpm trace <PR> [--json]` — 「AI が何を見て、なぜその判断をし、何を実行し、
 * その判断が正しかったか」を PR 番号を軸に 1 コマンドで追跡する（routing skill
 * §目標状態、AGENTS.md 委任・報告の作法）。
 *
 * Storage は追加しない。material は session log（`~/.claude/projects/**\/*.jsonl`）、
 * git、GitHub、`docs/decisions.md` の 4 つ。`ctx.mjs`（判断の記録の検出）と
 * `ai-usage.mjs`（jsonl walker・model 正規化・探索 turn 計算）をそのまま流用する。
 *
 * 出力は 120 行以内、判定そのものはしない（「判定は人が行う」と明記する箇所を除く）。
 * gh 呼び出しは各セクション独立に fail-closed（そのセクションだけ「未取得」）。
 *
 * deferred（次回以降）: timeline API の `committed` event が実際に返らない環境の
 * 網羅的な fallback 検証、Codex 以外のレビュー bot への拡張、session log の
 * cwd ベース突合（現状は project ディレクトリ名の完全一致のみ）。
 */

const [REPO_OWNER, REPO_NAME] = REPO.split('/');
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// --- CLI 引数 ---------------------------------------------------------------

/** CLI 引数を解釈する。位置引数は PR 番号 1 つのみ。 */
export function parseArgs(argv) {
  const options = { number: null, json: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`未知の引数です: ${arg}（--json のみ）`);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    throw new Error('PR 番号を 1 つ指定してください: pnpm trace <N>');
  }
  const number = Number(positionals[0]);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`不正な番号です: ${positionals[0]}`);
  }
  options.number = number;
  return options;
}

function tryOr(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// --- Part 2 見た・実行（session） -------------------------------------------

/** jsonl テキストを 1 行 1 record へ parse する。壊れた行は無視する。 */
export function parseJsonlLines(raw) {
  const records = [];
  for (const line of String(raw ?? '').split('\n')) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // 壊れた行は無視（1 行の破損で全体を落とさない）。
    }
  }
  return records;
}

/**
 * `<session-id>/subagents/agent-*.jsonl` の path から親 session id を取り出す。
 * subagents ディレクトリの直上セグメントが session id（実測ディレクトリ構造）。
 */
export function sessionIdFromSubagentPath(filePath) {
  const parts = String(filePath ?? '').split(/[/\\]/);
  const idx = parts.lastIndexOf('subagents');
  if (idx <= 0) return null;
  return parts[idx - 1];
}

/**
 * project ディレクトリ配下のファイル一覧を session 単位へ束ねる。
 * 戻り値は `Map<sessionId, { sessionFile: string|null, subagentFiles: string[] }>`。
 */
export function groupFilesBySession(files) {
  const map = new Map();
  const ensure = (sid) => {
    let entry = map.get(sid);
    if (!entry) {
      entry = { sessionFile: null, subagentFiles: [] };
      map.set(sid, entry);
    }
    return entry;
  };
  for (const file of files ?? []) {
    if (isSubagentFilePath(file)) {
      const sid = sessionIdFromSubagentPath(file);
      if (!sid) continue;
      ensure(sid).subagentFiles.push(file);
    } else {
      const base = String(file).split(/[/\\]/).pop() ?? file;
      const sid = base.replace(/\.jsonl$/, '');
      ensure(sid).sessionFile = file;
    }
  }
  return map;
}

/** session の record 列の中に `gitBranch === headRefName` の record が 1 つでもあるか。 */
export function matchesBranch(records, headRefName) {
  if (!headRefName) return false;
  return (records ?? []).some((r) => r && r.gitBranch === headRefName);
}

/**
 * `headRefName` の project ディレクトリを walk し、branch が一致する session だけの
 * record 列を集める（I/O をここへ閉じ込め、以降の集計は純関数にする）。
 */
export function loadSessionEntriesForBranch({
  projectsDir = PROJECTS_DIR,
  cwdPrefix,
  headRefName,
  readFileImpl = readFileSync,
  listFilesImpl = listJsonlFiles,
} = {}) {
  const projectDirSegment = cwdPrefixToProjectDirSegment(cwdPrefix);
  const projectDir = join(projectsDir, projectDirSegment);
  const files = tryOr(() => listFilesImpl(projectDir), null);
  if (files === null) return null;

  const groups = groupFilesBySession(files);
  const entries = [];
  for (const [sessionId, { sessionFile, subagentFiles }] of groups) {
    if (!sessionFile) continue;
    const raw = tryOr(() => readFileImpl(sessionFile, 'utf8'), null);
    if (raw === null) continue;
    const records = parseJsonlLines(raw);
    if (!matchesBranch(records, headRefName)) continue;
    entries.push({ sessionId, records, subagentCount: subagentFiles.length });
  }
  return entries;
}

function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 1 session（`records` は session file 由来、subagent 側は数のみ数える）の集計行を作る。
 * model 構成は output token 上位 2 個、探索 turn は `computeExplorationBeforeEdit`
 * （最初の Edit より前の探索 tool_use 数。Edit が無ければ null = 対象外）。
 */
export function buildSessionRow({ sessionId, records, subagentCount }) {
  const firstTimestamp = (records ?? []).find((r) => typeof r?.timestamp === 'string')?.timestamp;
  const startMs = firstTimestamp ? Date.parse(firstTimestamp) : null;

  const modelOutput = new Map();
  let toolCalls = 0;
  let editCalls = 0;
  for (const record of records ?? []) {
    if (!record || record.type !== 'assistant') continue;
    const message = record.message ?? {};
    const usage = message.usage ?? {};
    const label = normalizeModelLabel(message.model);
    if (label) {
      modelOutput.set(label, (modelOutput.get(label) ?? 0) + (usage.output_tokens ?? 0));
    }
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || block.type !== 'tool_use') continue;
      toolCalls += 1;
      if (EDIT_TOOLS.has(block.name)) editCalls += 1;
    }
  }

  const explore = computeExplorationBeforeEdit(records ?? []);
  const modelTop2 = [...modelOutput.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, out]) => `${label}(${human(out)})`)
    .join(', ');

  return {
    sessionId,
    startMs,
    startLabel: startMs ? new Date(startMs).toISOString().slice(0, 16).replace('T', ' ') : '不明',
    modelSummary: modelTop2 || '不明',
    modelOutput,
    toolCalls,
    editCalls,
    exploreTurns: explore.hasEdit ? explore.exploreCount : null,
    subagentCount,
  };
}

/**
 * `loadSessionEntriesForBranch` の結果から表示用の行（最大 10、新しい順）と
 * summary（全 match session 対象、表示上限の影響を受けない）を組む。
 */
export function buildSessionSection(entries) {
  const rows = (entries ?? [])
    .map(buildSessionRow)
    .sort((a, b) => (b.startMs ?? -1) - (a.startMs ?? -1));
  const displayed = rows.slice(0, 10);

  const modelTotals = new Map();
  let totalEdit = 0;
  const exploreValues = [];
  for (const row of rows) {
    for (const [label, out] of row.modelOutput) {
      modelTotals.set(label, (modelTotals.get(label) ?? 0) + out);
    }
    totalEdit += row.editCalls;
    if (row.exploreTurns !== null) exploreValues.push(row.exploreTurns);
  }

  return {
    displayed,
    summary: {
      sessionCount: rows.length,
      modelTotals,
      totalEdit,
      exploreMedian: median(exploreValues),
    },
  };
}

/** editCalls===0 かつ model 構成に opus/fable を含む session が 1 つでもあるか（routing skill 反例）。 */
export function hasNoEditHeavyModelSession(rows) {
  return (rows ?? []).some(
    (row) => row.editCalls === 0 && /\b(opus|fable)\b/i.test(row.modelSummary ?? ''),
  );
}

// --- Part 3 判断 -------------------------------------------------------------

/** PR body に `## 検証` 見出しがあるか。 */
export function hasVerificationSection(body) {
  return /^##\s*検証\s*$/m.test(body ?? '');
}

/** DoD 本文の抜粋（先頭 3 行）を取る。DoD/完了の定義 の言及行から始める簡易抽出。 */
export function extractDodExcerpt(text) {
  const lines = String(text ?? '').split('\n');
  const idx = lines.findIndex((l) => /(DoD|完了の定義)/.test(l));
  if (idx === -1) return '';
  return lines.slice(idx, idx + 3).join('\n');
}

// --- Part 4 レビュー ---------------------------------------------------------

/** timeline event 配列から `ready_for_review` の日時（無ければ null）。 */
export function findReadyForReviewDate(timelineEvents) {
  const ev = (timelineEvents ?? []).find((e) => e?.event === 'ready_for_review');
  return ev?.created_at ?? null;
}

/** timeline の `committed` event を ready 日時以降だけ数える。readyDate が無ければ null。 */
export function countCommitsAfterReady(timelineEvents, readyDate) {
  if (!readyDate) return null;
  const readyMs = Date.parse(readyDate);
  return (timelineEvents ?? []).filter((e) => {
    if (e?.event !== 'committed') return false;
    const ts = Date.parse(e.committed_date ?? e.created_at ?? '');
    return Number.isFinite(ts) && ts > readyMs;
  }).length;
}

/** timeline に `committed` event が 1 つも無い（API が対応していない）かどうか。 */
export function timelineLacksCommitEvents(timelineEvents) {
  return !(timelineEvents ?? []).some((e) => e?.event === 'committed');
}

/** `gh pr view --json commits` の fallback で ready 日時以降の commit 数を数える。 */
export function countCommitsAfterReadyFallback(commits, readyDate) {
  if (!readyDate) return null;
  const readyMs = Date.parse(readyDate);
  return (commits ?? []).filter((c) => {
    const ts = Date.parse(c?.committedDate ?? '');
    return Number.isFinite(ts) && ts > readyMs;
  }).length;
}

/** login が Codex のレビュー/コメントか（`*codex` または `[bot]` 終わり）。 */
export function isCodexLogin(login) {
  if (typeof login !== 'string') return false;
  return /codex$/i.test(login) || /\[bot\]$/i.test(login);
}

/** Codex（`reviews` + `pulls/N/comments`）の P1/P2 言及件数を数える。 */
export function countCodexPriorities(reviews, comments) {
  const items = [...(reviews ?? []), ...(comments ?? [])];
  let p1 = 0;
  let p2 = 0;
  for (const item of items) {
    if (!isCodexLogin(item?.user?.login)) continue;
    const body = item?.body ?? '';
    if (/\bP1\b/.test(body)) p1 += 1;
    if (/\bP2\b/.test(body)) p2 += 1;
  }
  return { p1, p2 };
}

/** `[internal-review]` marker を含むコメントが有るか（pr-cross-review skill）。 */
export function hasInternalReviewMarker(comments) {
  return (comments ?? []).some(
    (c) => typeof c?.body === 'string' && c.body.includes('[internal-review]'),
  );
}

// --- Part 5 結果 -------------------------------------------------------------

/** `Revert` 検索用の argv（`gh pr list --search`）を組む。 */
export function buildRevertSearchArgv(number) {
  return [
    'pr',
    'list',
    '--repo',
    REPO,
    '--state',
    'all',
    '--search',
    `Revert #${number} in:title,body`,
    '--json',
    'number,title',
  ];
}

/** `docs/decisions.md` の全文から、指定番号群のいずれかを含む行だけを抜く。 */
export function collectDecisionLines(raw, numbers) {
  if (raw === null || raw === undefined) return [];
  const needles = (numbers ?? []).map((n) => `#${n}`);
  return String(raw)
    .split('\n')
    .filter((line) => needles.some((needle) => line.includes(needle)))
    .map((line) => line.trim().slice(0, 200));
}

// --- Part 6 所見（heuristics） ----------------------------------------------

/**
 * ヒューリスティックの 4 ケースを上から順に判定し、該当したものだけ返す
 * （どれにも当てはまらなければ空配列 ── §所見 セクション自体を出さない）。
 */
/**
 * @param {{
 *   exploreMedian?: number | null,
 *   codexP1?: number,
 *   commitsAfterReady?: number | null,
 *   hasNoEditHeavyModel?: boolean,
 * }} [options]
 */
export function computeFindings({
  exploreMedian = null,
  codexP1 = 0,
  commitsAfterReady = null,
  hasNoEditHeavyModel = false,
} = {}) {
  const lines = [];
  if (exploreMedian !== null && exploreMedian > 10) {
    lines.push('探索 turn が多い: brief（ctx --post）の選別漏れを疑う');
  }
  if (codexP1 > 0) {
    lines.push('レビューが P1 を拾った: 判断の記録（DoD / 分解表）に穴が無いか');
  }
  if (commitsAfterReady !== null && commitsAfterReady > 3) {
    lines.push('ready 後の push が多い: push 前セルフレビューの範囲を見直す');
  }
  if (hasNoEditHeavyModel) {
    lines.push('編集なしの Opus / Fable session: routing 反例');
  }
  return lines;
}

// --- markdown 描画 -----------------------------------------------------------

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : null;
}

/** pack（buildTracePack の出力）を markdown へ描画する。空セクションは丸ごと省く。 */
export function renderMarkdown(pack) {
  const lines = [];
  const h = pack.header;
  lines.push(`### trace #${pack.number} ${h.title ?? '（タイトル未取得）'}`);

  const stateLine = [
    `state: ${h.state ?? '未取得'}`,
    `isDraft: ${h.isDraft === null || h.isDraft === undefined ? '未取得' : h.isDraft}`,
    h.mergedAt
      ? `mergedAt: ${fmtDate(h.mergedAt)}`
      : h.closedAt
        ? `closedAt: ${fmtDate(h.closedAt)}`
        : 'mergedAt/closedAt: なし',
    `${h.headRefName ?? '未取得'} → ${h.baseRefName ?? '未取得'}`,
  ];
  lines.push(stateLine.join(' | '));
  if (h.linkedIssues && h.linkedIssues.length > 0) {
    lines.push(`linked issues: ${h.linkedIssues.map((n) => `#${n}`).join(', ')}`);
  }
  lines.push('');

  // #### 見た・実行（session）
  if (pack.sessions === null) {
    lines.push('#### 見た・実行（session）');
    lines.push('');
    lines.push('未取得（session log の走査に失敗、または project ディレクトリが無い）');
    lines.push('');
  } else if (pack.sessions.displayed.length > 0) {
    lines.push('#### 見た・実行（session）');
    lines.push('');
    lines.push(
      '| session | 開始 | model 構成 | tool 呼び出し数 | Edit 数 | 探索 turn | subagent 数 |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const row of pack.sessions.displayed) {
      lines.push(
        `| ${row.sessionId.slice(0, 8)} | ${row.startLabel} | ${escapeCell(row.modelSummary)} | ${row.toolCalls} | ${row.editCalls} | ${row.exploreTurns === null ? '—' : row.exploreTurns} | ${row.subagentCount} |`,
      );
    }
    lines.push('');
    const { summary } = pack.sessions;
    const modelTotalsText =
      [...summary.modelTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, out]) => `${label} ${human(out)}`)
        .join(', ') || 'なし';
    lines.push(
      `**summary**: sessions ${summary.sessionCount} | output tokens: ${modelTotalsText} | Edit 合計 ${summary.totalEdit} | 探索 turn 中央値 ${summary.exploreMedian === null ? '—' : summary.exploreMedian.toFixed(1)}`,
    );
    lines.push('');
  } else {
    lines.push('#### 見た・実行（session）');
    lines.push('');
    lines.push(`該当 session なし（headRefName: ${h.headRefName ?? '未取得'}）`);
    lines.push('');
  }

  // #### 判断
  if (pack.judgment) {
    lines.push('#### 判断');
    lines.push('');
    if (pack.judgment.issues.length > 0) {
      for (const issue of pack.judgment.issues) {
        lines.push(`**#${issue.number}**`);
        if (issue.records) {
          lines.push(
            `DoD: ${issue.records.dod ? 'あり' : 'なし'} | 分解表: ${issue.records.breakdown ? 'あり' : 'なし'} | brief: ${issue.records.brief ? 'あり' : 'なし'}`,
          );
          if (issue.dodExcerpt) {
            lines.push(issue.dodExcerpt);
          }
        } else {
          lines.push('未取得（gh 呼び出し失敗）');
        }
        lines.push('');
      }
    } else {
      lines.push('linked issue なし');
      lines.push('');
    }
    lines.push(
      `PR 本文 \`## 検証\`: ${pack.judgment.hasVerificationSection === null ? '未取得' : pack.judgment.hasVerificationSection ? 'あり' : 'なし'}`,
    );
    lines.push('');
  }

  // #### レビュー
  if (pack.review) {
    const r = pack.review;
    lines.push('#### レビュー');
    lines.push('');
    lines.push(`ready_for_review: ${r.readyDate ? fmtDate(r.readyDate) : 'なし'}`);
    lines.push(
      `ready 後の commit 数: ${r.commitsAfterReady === null ? '未取得' : r.commitsAfterReady}`,
    );
    lines.push(
      `Codex 指摘: ${r.codex === null ? '未取得' : `P1 ${r.codex.p1} / P2 ${r.codex.p2}`}`,
    );
    lines.push(
      `未解決 thread: ${r.unresolvedThreads === null || r.unresolvedThreads === undefined ? '未取得' : r.unresolvedThreads}`,
    );
    lines.push(
      `[internal-review] marker: ${r.hasMarker === null ? '未取得' : r.hasMarker ? 'あり' : 'なし'}`,
    );
    lines.push('');
  }

  // #### 結果
  if (pack.result) {
    const res = pack.result;
    lines.push('#### 結果');
    lines.push('');
    lines.push(`merged: ${res.merged === null ? '未取得' : res.merged ? 'あり' : 'なし'}`);
    lines.push(`revert PR 数: ${res.revertCount === null ? '未取得' : res.revertCount}`);
    if (res.decisionLines.length > 0) {
      lines.push('決定ログ:');
      for (const line of res.decisionLines) lines.push(`- ${escapeCell(line.replace(/^- /, ''))}`);
    } else {
      lines.push('決定ログ: なし');
    }
    lines.push('');
    lines.push('**DoD vs PR 本文（判定は人が行う）**');
    lines.push('');
    lines.push(res.dodBlock?.dodText ? `DoD:\n${res.dodBlock.dodText}` : 'DoD: なし');
    lines.push('');
    lines.push(res.dodBlock?.prBodyHead ? `PR 本文:\n${res.dodBlock.prBodyHead}` : 'PR 本文: なし');
    lines.push('');
  }

  // #### 所見
  if (pack.findings && pack.findings.length > 0) {
    lines.push('#### 所見');
    lines.push('');
    for (const line of pack.findings) lines.push(`- ${line}`);
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// --- gh 呼び出しを含む組み立て（main からのみ呼ばれる） ---------------------

/** PR 番号から trace pack を組み立てる。各段は独立に fail-closed。 */
export function buildTracePack(options, deps = {}) {
  const {
    execFileImpl,
    readFileImpl = readFileSync,
    listFilesImpl = listJsonlFiles,
    cwd = process.cwd(),
    projectsDir = PROJECTS_DIR,
  } = deps;
  const { number } = options;

  const pr = tryOr(
    () =>
      runGhJson(
        [
          'pr',
          'view',
          String(number),
          '--json',
          'number,title,state,url,isDraft,mergedAt,closedAt,headRefName,baseRefName,body,commits',
        ],
        { execFileImpl },
      ),
    null,
  );

  const linkedIssues = extractLinkedIssueNumbers(pr?.body ?? '');

  const header = {
    title: pr?.title ?? null,
    state: pr?.state ?? null,
    isDraft: pr?.isDraft ?? null,
    mergedAt: pr?.mergedAt ?? null,
    closedAt: pr?.closedAt ?? null,
    headRefName: pr?.headRefName ?? null,
    baseRefName: pr?.baseRefName ?? null,
    linkedIssues,
  };

  // --- Part 2: session ---
  const sessionEntries = pr?.headRefName
    ? loadSessionEntriesForBranch({
        projectsDir,
        cwdPrefix: cwd,
        headRefName: pr.headRefName,
        readFileImpl,
        listFilesImpl,
      })
    : null;
  const sessions = sessionEntries === null ? null : buildSessionSection(sessionEntries);

  // --- Part 3: 判断 ---
  const judgment = {
    issues: linkedIssues.map((n) =>
      tryOr(
        () => {
          const issue = runGhJson(['api', `repos/${REPO}/issues/${n}`], { execFileImpl });
          const comments = runGhJson(['api', `repos/${REPO}/issues/${n}/comments?per_page=100`], {
            execFileImpl,
          });
          const records = detectJudgmentRecords(comments, issue.body ?? '');
          return {
            number: n,
            records,
            dodExcerpt: extractDodExcerpt(
              [issue.body ?? '', ...(comments ?? []).map((c) => c?.body ?? '')].join('\n'),
            ),
          };
        },
        { number: n, records: null, dodExcerpt: '' },
      ),
    ),
    hasVerificationSection: pr ? hasVerificationSection(pr.body ?? '') : null,
  };

  // --- Part 4: レビュー ---
  const timelineEvents = tryOr(
    () =>
      runGhJson(['api', `repos/${REPO}/issues/${number}/timeline`, '--paginate'], {
        execFileImpl,
      }),
    null,
  );
  const readyDate = timelineEvents ? findReadyForReviewDate(timelineEvents) : null;
  let commitsAfterReady = null;
  if (timelineEvents && readyDate) {
    if (timelineLacksCommitEvents(timelineEvents)) {
      commitsAfterReady = tryOr(
        () => countCommitsAfterReadyFallback(pr?.commits ?? [], readyDate),
        null,
      );
    } else {
      commitsAfterReady = countCommitsAfterReady(timelineEvents, readyDate);
    }
  }

  const codexReviews = tryOr(
    () =>
      runGhJson(['api', `repos/${REPO}/pulls/${number}/reviews`, '--paginate'], { execFileImpl }),
    null,
  );
  const codexComments = tryOr(
    () =>
      runGhJson(['api', `repos/${REPO}/pulls/${number}/comments`, '--paginate'], { execFileImpl }),
    null,
  );
  const codex =
    codexReviews === null && codexComments === null
      ? null
      : countCodexPriorities(codexReviews ?? [], codexComments ?? []);

  const threadNodes = tryOr(() => {
    const raw = runGh(
      [
        'api',
        'graphql',
        '-f',
        'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}',
        '-f',
        `owner=${REPO_OWNER}`,
        '-f',
        `name=${REPO_NAME}`,
        '-F',
        `number=${number}`,
      ],
      { execFileImpl },
    );
    return JSON.parse(raw).data.repository.pullRequest.reviewThreads.nodes;
  }, null);
  const unresolvedThreads =
    threadNodes === null ? null : threadNodes.filter((n) => n?.isResolved === false).length;

  const issueComments = tryOr(
    () =>
      runGhJson(['api', `repos/${REPO}/issues/${number}/comments?per_page=100`], { execFileImpl }),
    null,
  );
  const hasMarker = issueComments === null ? null : hasInternalReviewMarker(issueComments);

  const review = {
    readyDate,
    commitsAfterReady,
    codex,
    unresolvedThreads,
    hasMarker,
  };

  // --- Part 5: 結果 ---
  const revertResults = tryOr(
    () => runGhJson(buildRevertSearchArgv(number), { execFileImpl }),
    null,
  );
  const decisionRaw = tryOr(() => readFileImpl(join(cwd, 'docs/decisions.md'), 'utf8'), null);
  const decisionLines = collectDecisionLines(decisionRaw, [number, ...linkedIssues]);

  const dodIssue = judgment.issues.find((i) => i.dodExcerpt);
  const result = {
    merged: pr ? Boolean(pr.mergedAt) : null,
    revertCount: revertResults === null ? null : revertResults.length,
    decisionLines,
    dodBlock: {
      dodText: dodIssue?.dodExcerpt ?? '',
      prBodyHead: (pr?.body ?? '').split('\n').slice(0, 10).join('\n'),
    },
  };

  // --- Part 6: 所見 ---
  const findings = computeFindings({
    exploreMedian: sessions?.summary?.exploreMedian ?? null,
    codexP1: codex?.p1 ?? 0,
    commitsAfterReady,
    hasNoEditHeavyModel: hasNoEditHeavyModelSession(sessions?.displayed ?? []),
  });

  return { number, header, sessions, judgment, review, result, findings };
}

// --- CLI --------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv.slice(2));
  const pack = buildTracePack(options, {});
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        pack,
        (key, value) => (value instanceof Map ? Object.fromEntries(value) : value),
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${renderMarkdown(pack)}\n`);
  }
}

if (isDirectExecution(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'trace failed');
    process.exitCode = 1;
  }
}
