import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  findTodayBoardIssue,
  isJstMonday,
  isJstWeekend,
  jstDayRange,
  jstDaysAgoString,
  jstYesterdayString,
  REPO,
  runGh,
  runGhJson,
} from './lib.mjs';

/**
 * night-watch SKILL.md §自動パート Step 4（DoD 監査候補の乱数選定）を1コマンドで
 * 完結させる wrapper（#2291 v2、PR #2309 未解決 thread 3/4 の構造的解消）。
 *
 * 実装 2 点の是正（実測で確認済み、2026-08-24）:
 * - `gh search issues --search "..."` は `--search` flag が存在せず常に
 *   `unknown flag: --search` で失敗していた（thread #3）。merged PR の検索は
 *   `gh pr list --search "<query>" --state merged` を使う（`-S/--search` は
 *   `gh pr list` の正式 flag。実測で `is:merged merged:<range>` が正しく
 *   絞り込めることを確認済み）
 * - `merged:YYYY-MM-DD` の日単位指定は GitHub 検索の UTC 日境界になり、JST
 *   0-9 時台の PR が前後の日に混入する（thread #4）。JST 明示範囲
 *   `merged:<start>T00:00:00+09:00..<end>T23:59:59+09:00` を渡す
 *
 * 動的値（PR 番号・タイトル）はコメント本文の構築に使うが、`gh issue comment`
 * へは execFile の argv 要素として渡るため shell 展開の対象にならない。
 */

/**
 * 指定した JST 日境界レンジ（両端 inclusive）に merge された PR 一覧を取得する。
 * @param {{ startDateStr: string, endDateStr: string, execFileImpl?: import('./lib.mjs').ExecFileImpl }} params
 */
export function fetchMergedPrsInRange({ startDateStr, endDateStr, execFileImpl }) {
  const range = jstDayRange(startDateStr, endDateStr);
  return runGhJson(
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--search',
      `is:merged merged:${range}`,
      '--state',
      'merged',
      '--json',
      'number,title',
      '--limit',
      '30',
    ],
    { execFileImpl },
  );
}

/**
 * 前日 JST に merge された PR 一覧を取得する。
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl }} [opts]
 */
export function fetchYesterdayMergedPrs({ execFileImpl } = {}) {
  const yesterday = jstYesterdayString();
  return fetchMergedPrsInRange({ startDateStr: yesterday, endDateStr: yesterday, execFileImpl });
}

/**
 * 月曜日専用: 金〜日の JST 3 日分に merge された PR 一覧を取得する。
 *
 * 盤面 issue の起票が平日のみになった（#2334 コメント。board-issue.mjs
 * §runBoardSync 参照）ため、Step 4 自体も土日は skip する（当日盤面 issue が
 * 存在しないため）。「前日 JST」の単日窓のままだと、金・土曜に merge された PR
 * が DoD 監査候補から永久に漏れる（土曜 run が金曜分を、日曜 run が土曜分を
 * 拾うはずが、土日は run 自体が skip されるため）。月曜だけ窓を金〜日の 3 日分へ
 * 拡張し、取りこぼしを埋める。
 * @param {{ execFileImpl?: import('./lib.mjs').ExecFileImpl }} [opts]
 */
export function fetchWeekendCatchUpMergedPrs({ execFileImpl } = {}) {
  const friday = jstDaysAgoString(3);
  const sunday = jstYesterdayString();
  return fetchMergedPrsInRange({ startDateStr: friday, endDateStr: sunday, execFileImpl });
}

/**
 * Step 4 を実行する。土日は当日盤面 issue が存在しない（board-issue.mjs が
 * 起票を平日のみに絞るため）ため、gh を呼ばずに skip する。月曜は金〜日の
 * 3 日分をまとめて対象にする（fetchWeekendCatchUpMergedPrs 参照）。当日盤面
 * issue が無ければエラー（Step 1 が先に走っている前提）。決定的な選定
 * アルゴリズムは設けない（SKILL.md の既定方針どおり）。
 * @param {{
 *   execFileImpl?: import('./lib.mjs').ExecFileImpl,
 *   randomImpl?: () => number,
 * }} [opts]
 */
export function runDodCandidateSelect({ execFileImpl, randomImpl = Math.random } = {}) {
  if (isJstWeekend()) {
    return { action: 'skipped', reason: 'weekend' };
  }

  const boardIssue = findTodayBoardIssue({ execFileImpl });
  if (!boardIssue) {
    throw new Error('当日の盤面 issue が見つかりません（Step 1 が先に完了している必要があります）');
  }

  const candidates = isJstMonday()
    ? fetchWeekendCatchUpMergedPrs({ execFileImpl })
    : fetchYesterdayMergedPrs({ execFileImpl });

  let comment;
  let selected = null;
  if (candidates.length === 0) {
    comment = 'DoD候補: 前日merge PR無し';
  } else {
    selected = candidates[Math.floor(randomImpl() * candidates.length)];
    comment = `DoD監査候補: #${selected.number}（${selected.title}）`;
  }

  runGh(['issue', 'comment', String(boardIssue.number), '--repo', REPO, '--body', comment], {
    execFileImpl,
  });

  return { boardIssueNumber: boardIssue.number, candidateCount: candidates.length, selected };
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
  if (subcommand !== 'select') {
    console.error('Usage: node scripts/night-watch/dod-candidate.mjs select');
    process.exitCode = 1;
  } else {
    try {
      const result = runDodCandidateSelect();
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'dod-candidate select failed');
      process.exitCode = 1;
    }
  }
}
