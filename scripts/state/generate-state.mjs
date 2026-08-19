#!/usr/bin/env node
// STATE.md の §2〜§5（生成セクション）を GitHub の現状から再構成する。
//
//   node scripts/state/generate-state.mjs [--dry-run] [--repo <owner/repo>]
//
// §1（北極星と今週の最優先）は既存ファイルからそのまま温存し、この script は
// 書き換えない。§1 の更新は通常のコミット（lane が Edit する）で行う。
//
// 正本は GitHub issue + open PR のまま。STATE.md は「生成されたビュー + §1 の
// 判断レイヤー」であり、第二の正本ではない
// （docs/engineering/log/2026-08-01-issue-state-labels-epics.md の教訓）。
//
// **main への直接 push / API 経由の書き込みは行わない。** main は
// `.husky/pre-push` が直接 push を無条件で禁止しており（PR + `pnpm branch:finish`
// 経由に限定）、この script はローカルファイルを書き換えるだけに留める。生成後の
// diff は、実行した lane が自分の PR に含める通常のコミットとして扱う。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO = 'Dayopt/dayopt';

const STATE_PATH = fileURLToPath(new URL('../../STATE.md', import.meta.url));
const DECISIONS_PATH = fileURLToPath(new URL('../../docs/decisions.md', import.meta.url));

const MARKER = {
  LANES: ['<!-- STATE:GENERATED:LANES:START -->', '<!-- STATE:GENERATED:LANES:END -->'],
  QUEUE: ['<!-- STATE:GENERATED:QUEUE:START -->', '<!-- STATE:GENERATED:QUEUE:END -->'],
  ESCALATIONS: [
    '<!-- STATE:GENERATED:ESCALATIONS:START -->',
    '<!-- STATE:GENERATED:ESCALATIONS:END -->',
  ],
  DECISIONS: ['<!-- STATE:GENERATED:DECISIONS:START -->', '<!-- STATE:GENERATED:DECISIONS:END -->'],
};

const LINE_CAP = 100;
const QUEUE_MAX_ITEMS = 8;
const DECISIONS_IN_STATE_MAX = 5;

/**
 * 制御文字（tab/改行は呼び出し側で別途処理済みの前提で除去対象に含む）を取り除く。
 * `\x` エスケープや埋め込みリテラルではなく charCode 比較で判定する
 * （ソース中に生の制御バイトを置かない）。
 */
function stripControlChars(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

// ── 純粋関数（scripts/__tests__/generate-state.test.ts から直接 import して検証する） ──

/**
 * markdown table セル / list item として安全な 1 行文字列へ正規化する。
 * 対象は GitHub の issue/PR title（誰でも書ける観測コンテンツ）なので、
 * table 構造やこの script 自身のマーカー構文を壊せないようにする。
 */
export function sanitizeCell(raw, maxLength = 70) {
  const text = String(raw ?? '');
  let cleaned = text
    .replace(/\r\n?|\n/g, ' ') // 改行 → table/list を壊すので潰す
    .replace(/\|/g, '｜') // table 区切りと衝突する pipe を全角へ
    .replace(/<!--/g, '‹!--') // マーカー構文の偽装を無害化
    .replace(/-->/g, '--›');
  cleaned = stripControlChars(cleaned).trim();
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength - 1)}…`;
  }
  return cleaned || '(no title)';
}

/** PR 本文から `Closes #123` 形式の issue 番号を全件抽出する（重複除去・昇順）。 */
export function extractClosesIssues(body) {
  const text = String(body ?? '');
  const matches = [...text.matchAll(/\bClose[sd]?\b\s*#(\d+)/gi)];
  const numbers = [...new Set(matches.map((m) => Number(m[1])))];
  return numbers.sort((a, b) => a - b);
}

/** statusCheckRollup からブロッカーの一言サマリーを決める。 */
export function describeBlocker(pr) {
  const rollup = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const isFailed = (c) => {
    const conclusion = String(c.conclusion ?? '').toLowerCase();
    const state = String(c.state ?? '').toLowerCase();
    return (
      conclusion === 'failure' ||
      conclusion === 'cancelled' ||
      conclusion === 'timed_out' ||
      state === 'failure' ||
      state === 'error'
    );
  };
  if (rollup.some(isFailed)) return 'CI failing';
  if (pr.isDraft) return 'draft';
  return '-';
}

export function renderLanesTable(prs) {
  if (!prs.length) {
    return '（open PR なし）';
  }
  const header = '| PR | Issue | branch | 状態 | ブロッカー |\n| --- | --- | --- | --- | --- |';
  const rows = prs.map((pr) => {
    const issues = extractClosesIssues(pr.body);
    const issueCell = issues.length ? issues.map((n) => `#${n}`).join(', ') : '-';
    const state = pr.isDraft ? 'draft' : 'ready';
    return `| [#${pr.number}](${pr.url}) ${sanitizeCell(pr.title, 50)} | ${issueCell} | \`${sanitizeCell(pr.headRefName, 40)}\` | ${state} | ${describeBlocker(pr)} |`;
  });
  return [header, ...rows].join('\n');
}

export function renderQueueList(queueIssues, maxItems = QUEUE_MAX_ITEMS) {
  if (!queueIssues.length) {
    return '（status:ready の issue なし）';
  }
  const shown = queueIssues.slice(0, maxItems);
  const lines = shown.map(
    (issue, i) => `${i + 1}. [#${issue.number}](${issue.url}) ${sanitizeCell(issue.title, 70)}`,
  );
  if (queueIssues.length > maxItems) {
    lines.push(
      `…他 ${queueIssues.length - maxItems} 件は \`gh issue list --label status:ready --state open\` で確認`,
    );
  }
  return lines.join('\n');
}

export function renderEscalationsList(escalationIssues) {
  if (!escalationIssues.length) {
    return '（type:discussion の open issue なし）';
  }
  return escalationIssues
    .map((issue) => `- [ ] [#${issue.number}](${issue.url}) ${sanitizeCell(issue.title, 80)}`)
    .join('\n');
}

export function renderDecisionsSection(decisionEntries, maxItems = DECISIONS_IN_STATE_MAX) {
  if (!decisionEntries.length) {
    return '（judgment:diverged の記録なし）';
  }
  const sorted = [...decisionEntries].sort((a, b) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
  );
  const shown = sorted.slice(0, maxItems);
  const lines = shown.map((entry) => {
    const date = String(entry.updatedAt ?? '').slice(0, 10) || 'unknown';
    return `- ${date}: [#${entry.number}](${entry.url}) ${sanitizeCell(entry.title, 70)}`;
  });
  // 空行を挟まないと markdown が直前の list item への継続行と解釈し、
  // prettier がインデントして list の一部に見せてしまう（独立した段落にする）。
  return `${lines.join('\n')}\n\n全履歴: [docs/decisions.md](docs/decisions.md)`;
}

/**
 * docs/decisions.md を append-only でマージする。既存行は一切変更・削除しない
 * （`judgment:diverged` ラベルは月次 gardening で解決後に外れるため、
 * STATE.md 生成時点の再取得だけに頼ると外れた過去の記録が消えてしまう）。
 */
export function mergeDecisionsMd(existingContent, decisionEntries) {
  const header =
    '# 決定ログ（append-only）\n\n判断が分かれた記録の全履歴。STATE.md §5 には直近 5 件だけを表示し、詳細はここへ追記する。手で行を消さない（`judgment:diverged` ラベルが gardening で外れても、ここの行は残す）。\n\n';
  const body = existingContent && existingContent.trim() ? existingContent : header;
  const existingNumbers = new Set([...body.matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1])));
  const toAppend = decisionEntries
    .filter((entry) => !existingNumbers.has(entry.number))
    .sort((a, b) => String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? '')));
  if (!toAppend.length) {
    return body.endsWith('\n') ? body : `${body}\n`;
  }
  const newLines = toAppend.map((entry) => {
    const date = String(entry.updatedAt ?? '').slice(0, 10) || 'unknown';
    return `- ${date}: ${sanitizeCell(entry.title, 90)} (#${entry.number}) ${entry.url}`;
  });
  const trimmedBody = body.endsWith('\n') ? body : `${body}\n`;
  return `${trimmedBody}${newLines.join('\n')}\n`;
}

/** マーカー間の内容を置き換える。マーカーが無ければ何もしない（fail closed）。 */
function replaceBetweenMarkers(content, markerPair, replacement) {
  const [start, end] = markerPair;
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`マーカーが見つかりません: ${start} / ${end}`);
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

const BOOTSTRAP_TEMPLATE = `# STATE.md（最終更新: 生成待ち）

> STATE.md は判断のための現在地の地図であり、正本ではない。正本は GitHub issue と open PR。
> §2〜§5 は \`pnpm state:generate\` が機械生成する（手で編集しても次回生成で上書きされる）。
> §1 だけが手動更新（issue コメント経由の指示を受けて lane が編集する）。
> サイズ上限 100 行。詳細は CLAUDE.md §運用基盤（STATE.md）参照。
> 冒頭の「生成基点 main」が現在の \`origin/main\` と一致しなければ、その差分の
> merge 分だけ盤面が古い。追従（update-branch）で衝突したら手 merge せず
> \`pnpm state:generate\` を再実行する（生成物なので解決＝再生成）。

## 1. 北極星と今週の最優先
- （初期記入待ち）

## 2. 進行中レーン（open PR、機械生成）
${MARKER.LANES[0]}
${MARKER.LANES[1]}

## 3. 次にやるキュー（status:ready、機械生成）
${MARKER.QUEUE[0]}
${MARKER.QUEUE[1]}

## 4. 要判断（type:discussion の open issue、機械生成）
${MARKER.ESCALATIONS[0]}
${MARKER.ESCALATIONS[1]}

## 5. 直近の決定ログ（judgment:diverged、機械生成、直近 5 件）
${MARKER.DECISIONS[0]}
${MARKER.DECISIONS[1]}
`;

export function renderStateMarkdown(existingContent, data, opts = {}) {
  const generatedAt = opts.generatedAt ?? 'unknown';
  const mainSha = opts.mainSha ?? 'unknown';
  const base = existingContent && existingContent.trim() ? existingContent : BOOTSTRAP_TEMPLATE;

  // 生成基点の main SHA を先頭に刻む。直列 merge モデル（workflow.md §PR粒度）では
  // 「この PR が追従した main」より後に別 PR が merge されると、この STATE.md は
  // その分だけ古くなる。読む側（翌朝の指揮台・次に動く lane）が「これは何 merge
  // 前の盤面か」を SHA から機械的に判定できるようにする（該当 SHA が現在の
  // origin/main と一致しなければ、その差分だけ盤面が古い）。
  let content = base.replace(
    /^# STATE\.md（最終更新: .*?）/,
    `# STATE.md（最終更新: ${generatedAt} / 生成基点 main@${mainSha} / pnpm state:generate）`,
  );

  content = replaceBetweenMarkers(content, MARKER.LANES, renderLanesTable(data.prs));
  content = replaceBetweenMarkers(content, MARKER.QUEUE, renderQueueList(data.queueIssues));
  content = replaceBetweenMarkers(
    content,
    MARKER.ESCALATIONS,
    renderEscalationsList(data.escalationIssues),
  );
  content = replaceBetweenMarkers(
    content,
    MARKER.DECISIONS,
    renderDecisionsSection(data.decisionEntries),
  );

  const lineCount = content.split('\n').length;
  if (lineCount > LINE_CAP) {
    // 追加の切り詰めが要る場合はキュー（§3）を最優先で削る。§2 進行中レーンと
    // §4 要判断はブロッカー・判断待ちという重要度の高い情報のため切り詰め対象外にする。
    content = replaceBetweenMarkers(
      content,
      MARKER.QUEUE,
      renderQueueList(data.queueIssues, Math.max(1, QUEUE_MAX_ITEMS - 4)),
    );
  }

  return content;
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function fetchGhState(repo = DEFAULT_REPO) {
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--json',
      'number,title,headRefName,isDraft,url,body,statusCheckRollup',
      '--limit',
      '30',
    ]),
  );
  const queueIssues = JSON.parse(
    gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--label',
      'status:ready',
      '--state',
      'open',
      '--json',
      'number,title,url',
      '--limit',
      '30',
    ]),
  );
  const escalationIssues = JSON.parse(
    gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--label',
      'type:discussion',
      '--state',
      'open',
      '--json',
      'number,title,url',
      '--limit',
      '20',
    ]),
  );
  const decisionEntries = JSON.parse(
    gh([
      'search',
      'issues',
      '--repo',
      repo,
      '--label',
      'judgment:diverged',
      '--include-prs',
      '--limit',
      '200',
      '--json',
      'number,title,url,updatedAt,state',
    ]),
  );
  return { prs, queueIssues, escalationIssues, decisionEntries };
}

/**
 * 生成基点として刻む main の short SHA を取る。`origin/main` を最優先にする
 * （ローカル main が古い worktree でも「本当に最新の main」からのズレを示せる）。
 * 取得できなければ null を返し、呼び出し側は "unknown" にフォールバックする
 * （SHA が刻めないこと自体は生成を止める理由にしない）。
 */
function getMainSha() {
  const attempts = [
    ['rev-parse', '--short=8', 'origin/main'],
    ['rev-parse', '--short=8', 'main'],
    ['rev-parse', '--short=8', 'HEAD'],
  ];
  for (const args of attempts) {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch {
      // 次の候補を試す
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : DEFAULT_REPO;

  const data = fetchGhState(repo);

  const existingState = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, 'utf8') : '';
  const generatedAt = new Date().toISOString().slice(0, 10);
  const mainSha = getMainSha() ?? 'unknown';
  const newState = renderStateMarkdown(existingState, data, { generatedAt, mainSha });

  const existingDecisions = existsSync(DECISIONS_PATH) ? readFileSync(DECISIONS_PATH, 'utf8') : '';
  const newDecisions = mergeDecisionsMd(existingDecisions, data.decisionEntries);

  if (dryRun) {
    console.log('=== STATE.md (dry-run) ===\n' + newState);
    console.log('=== docs/decisions.md (dry-run) ===\n' + newDecisions);
    return;
  }

  writeFileSync(STATE_PATH, newState);
  writeFileSync(DECISIONS_PATH, newDecisions);
  console.log(`STATE.md / docs/decisions.md を再生成しました（${generatedAt}）。`);
  console.log('git add STATE.md docs/decisions.md してコミットに含めてください。');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(`❌ STATE.md の再生成に失敗しました: ${err.message}`);
    process.exit(1);
  });
}
