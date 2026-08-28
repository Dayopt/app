import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { findTodayBoardIssue, REPO, runGh, runGhJson } from '../ci/night-watch/lib.mjs';

/**
 * 日次盤面 issue（`CLAUDE.md` §運用基盤）の §2 進行中レーン更新とイベント
 * コメント追記の fail-safe wrapper（#2363）。
 *
 * 背景: 指揮台はこれまで §2 の本文更新をその場の python 置換 + `gh issue edit`
 * で行っており、2026-08-24 に置換 script の assert 失敗が command substitution
 * に飲まれて**空 body で edit が実行され、本文が一時消失する事故が実発生**した
 * （盤面 #2326 コメント列 2026-08-24T09:55 参照）。本 wrapper は「空 body での
 * 上書きが構造的に不可能」であることを次の設計で保証する:
 *
 * - **生成に失敗したら非 0 exit で何も書かない。** 本文の取得・分解・行操作・
 *   再組み立てのどこで失敗しても例外 → exit 1 で、gh の write 系呼び出しに
 *   一切到達しない（旧事故の「生成失敗が空文字として次のコマンドへ流れる」
 *   経路を消す）
 * - **書き込み直前に構造検証する。** 新 body が §1〜§6 の見出しをすべて含む
 *   こと・§2 以外の領域が byte 単位で不変であることを assert してから
 *   `gh issue edit` を呼ぶ
 * - **動的な値は shell へ渡さない。** night-watch wrapper 群（PR #2309）の
 *   設計踏襲。gh への引数は execFileSync の argv 配列で渡し、Bash tool から
 *   見えるコマンドは常に `node scripts/ops/board-update.mjs <subcommand> ...`
 *   の固定形に保つ
 *
 * 前提: 指揮台セッション（main checkout）が単一プロセスで直列に呼ぶ。
 * read-modify-write の TOCTOU（並行する別の書き手）は運用上存在しない
 * （night-watch の alert-run-state と同じ前提）。
 */

const SECTION2_SPLIT_RE = /^([\s\S]*?## 2\. 進行中レーン\n)([\s\S]*?)(\n## 3\. [\s\S]*)$/;

const REQUIRED_HEADERS = [
  '## 1. 今週の最優先',
  '## 2. 進行中レーン',
  '## 3. 本日の実績',
  '## 4. 次にやるキュー',
  '## 5. 要判断',
  '## 6. 決定ログ',
];

/**
 * 段階値の正本は `.claude/rules/orchestration.md` §日次盤面issue の対応表。
 * 語彙が変わる時は rules とこの配列を同じ PR で更新する（drift したら
 * ここが先に落ちて気づける）。
 */
export const STAGE_VALUES = ['起動待ち', '実装中', 'レビュー待ち', 'fix対応中', 'merge可能'];

const TABLE_HEADER = '| レーン | 対象 | branch | 段階 |';
const TABLE_SEPARATOR = '| --- | --- | --- | --- |';

/** テーブル構造を壊す文字（セル区切り・行区切り）を含む値を拒否する。 */
function assertSafeCell(label, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} が空です`);
  }
  if (value.includes('|') || value.includes('\n')) {
    throw new Error(`${label} にテーブル構造を壊す文字（| または改行）が含まれています`);
  }
  return value.trim();
}

/**
 * 盤面 body を §2 の前後で 3 分割する。分解できない body（テンプレ外の構造）は
 * 例外 = 何も書かない。
 * @param {string} body
 * @returns {{ prefix: string, section2: string, suffix: string }}
 */
export function splitBoardBody(body) {
  if (typeof body !== 'string' || body.trim() === '') {
    throw new Error('盤面 issue の body が空です（取得失敗の可能性。何も書き込まない）');
  }
  const match = body.match(SECTION2_SPLIT_RE);
  if (!match) {
    throw new Error(
      '盤面 body から §2 進行中レーンを特定できません（テンプレ構造外。何も書き込まない）',
    );
  }
  return { prefix: match[1], section2: match[2], suffix: match[3] };
}

/**
 * §2 の中身からレーン表を読み取る。表が無い（起票直後のプレースホルダー段落
 * だけ）なら rows は空。表らしき行が 4 セルで解釈できない場合は例外に倒す
 * （不明な構造を握りつぶして上書きしない）。
 * @param {string} section2
 * @returns {{ lane: string, target: string, branch: string, stage: string }[]}
 */
export function parseLaneRows(section2) {
  const tableLines = section2
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));
  if (tableLines.length === 0) return [];

  const rows = [];
  for (const line of tableLines) {
    // `| a | b |` → ['', ' a ', ' b ', ''] — 先頭末尾の空要素を落とす
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 4) {
      throw new Error(`レーン表の行を 4 列として解釈できません: ${line}`);
    }
    const [lane, target, branch, stage] = cells;
    if (lane === 'レーン' || /^-+$/.test(lane)) continue; // ヘッダー行・区切り行
    rows.push({ lane, target, branch, stage });
  }
  return rows;
}

/** レーン表を描画する。行が 0 件でもヘッダーは維持する（§2 の枠を消さない）。 */
export function renderLaneTable(rows) {
  const dataLines = rows.map(
    (row) => `| ${row.lane} | ${row.target} | ${row.branch} | ${row.stage} |`,
  );
  return [TABLE_HEADER, TABLE_SEPARATOR, ...dataLines].join('\n');
}

/**
 * §2 へのレーン行操作を適用した新しい body を返す。§2 以外は byte 単位で
 * 不変であることを保証する（prefix / suffix をそのまま連結し、最後に
 * 見出し検証を通す）。
 * @param {string} body
 * @param {(rows: ReturnType<typeof parseLaneRows>) => ReturnType<typeof parseLaneRows>} operate
 */
export function applyLaneOperation(body, operate) {
  const { prefix, section2, suffix } = splitBoardBody(body);
  const rows = parseLaneRows(section2);
  const nextRows = operate(rows);
  const nextBody = `${prefix}\n${renderLaneTable(nextRows)}\n${suffix}`;
  assertBoardBody(nextBody);
  return nextBody;
}

/** 書き込み直前の最終検証。空・見出し欠落のいずれでも例外 = 何も書かない。 */
export function assertBoardBody(body) {
  if (typeof body !== 'string' || body.trim() === '') {
    throw new Error('生成された body が空です（何も書き込まない）');
  }
  for (const header of REQUIRED_HEADERS) {
    if (!body.includes(header)) {
      throw new Error(`生成された body に「${header}」がありません（何も書き込まない）`);
    }
  }
}

/** 行を lane キーで置換（無ければ末尾に追加）した新しい行配列を返す。 */
export function upsertLane(rows, entry) {
  const lane = assertSafeCell('レーン名', entry.lane);
  const target = assertSafeCell('対象', entry.target);
  const branchRaw = assertSafeCell('branch', entry.branch);
  const branch = branchRaw.startsWith('`') ? branchRaw : `\`${branchRaw}\``;
  const stage = assertStage(entry.stage);
  const next = { lane, target, branch, stage };
  const index = rows.findIndex((row) => row.lane === lane);
  if (index === -1) return [...rows, next];
  return rows.map((row, i) => (i === index ? next : row));
}

/** 既存行の段階値だけを更新する。行が無ければ例外（黙って何もしない、を許さない）。 */
export function setLaneStage(rows, laneName, stage) {
  const lane = assertSafeCell('レーン名', laneName);
  const nextStage = assertStage(stage);
  const index = rows.findIndex((row) => row.lane === lane);
  if (index === -1) {
    throw new Error(`レーン「${lane}」の行が §2 にありません（lane-upsert で先に追加する）`);
  }
  return rows.map((row, i) => (i === index ? { ...row, stage: nextStage } : row));
}

/** 行を削除する。行が無ければ例外（削除済みの二重実行や番号違いを検出する）。 */
export function removeLane(rows, laneName) {
  const lane = assertSafeCell('レーン名', laneName);
  if (!rows.some((row) => row.lane === lane)) {
    throw new Error(`レーン「${lane}」の行が §2 にありません`);
  }
  return rows.filter((row) => row.lane !== lane);
}

function assertStage(stage) {
  const value = assertSafeCell('段階', stage);
  if (!STAGE_VALUES.includes(value)) {
    throw new Error(
      `段階「${value}」は語彙外です（許可値: ${STAGE_VALUES.join(' / ')}。` +
        '語彙を変える時は .claude/rules/orchestration.md §日次盤面issue と本 script を同じ PR で更新する）',
    );
  }
  return value;
}

/** 当日盤面 issue の number と body を取得する。無ければ例外。 */
function fetchTodayBoard({ execFileImpl } = {}) {
  const found = findTodayBoardIssue({ execFileImpl });
  if (!found) {
    throw new Error('本日の盤面 issue（type:board、盤面 YYYY-MM-DD）が open にありません');
  }
  const detail = runGhJson(
    ['issue', 'view', String(found.number), '--repo', REPO, '--json', 'number,body'],
    { execFileImpl },
  );
  return { number: found.number, body: detail.body };
}

/**
 * CLI 本体。検証をすべて通過した場合に限り gh の write 系（issue edit /
 * issue comment）へ到達する。
 * @param {string[]} argv
 * @param {{ execFileImpl?: import('../ci/night-watch/lib.mjs').ExecFileImpl }} [opts]
 */
export function runBoardUpdate(argv, { execFileImpl } = {}) {
  const [subcommand, ...rest] = argv;

  if (subcommand === 'comment') {
    const [text, ...extra] = rest;
    if (extra.length > 0) throw new Error('comment の引数は 1 つ（本文全体を 1 引数で渡す）');
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('イベントコメント本文が空です');
    }
    const { number } = fetchTodayBoard({ execFileImpl });
    runGh(['issue', 'comment', String(number), '--repo', REPO, '--body', text], { execFileImpl });
    return { action: 'commented', issueNumber: number };
  }

  let operate;
  if (subcommand === 'lane-upsert') {
    const [lane, target, branch, stage, ...extra] = rest;
    if (extra.length > 0 || stage === undefined) {
      throw new Error('Usage: lane-upsert <レーン名> <対象> <branch> <段階>');
    }
    operate = (rows) => upsertLane(rows, { lane, target, branch, stage });
  } else if (subcommand === 'lane-stage') {
    const [lane, stage, ...extra] = rest;
    if (extra.length > 0 || stage === undefined) {
      throw new Error('Usage: lane-stage <レーン名> <段階>');
    }
    operate = (rows) => setLaneStage(rows, lane, stage);
  } else if (subcommand === 'lane-remove') {
    const [lane, ...extra] = rest;
    if (extra.length > 0 || lane === undefined) {
      throw new Error('Usage: lane-remove <レーン名>');
    }
    operate = (rows) => removeLane(rows, lane);
  } else {
    throw new Error(
      'Usage: node scripts/ops/board-update.mjs <lane-upsert|lane-stage|lane-remove|comment> ...',
    );
  }

  const { number, body } = fetchTodayBoard({ execFileImpl });
  const nextBody = applyLaneOperation(body, operate);
  runGh(['issue', 'edit', String(number), '--repo', REPO, '--body', nextBody], { execFileImpl });
  return { action: subcommand, issueNumber: number };
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
  try {
    const result = runBoardUpdate(process.argv.slice(2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'board-update failed');
    process.exitCode = 1;
  }
}
