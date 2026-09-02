import { realpathSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { REPO, runGhJson } from '../lib/gh.mjs';

/**
 * green watch — open PR の CI 遷移 watch（`dispatch` skill（旧 orchestration.md、#2479 で再編）
 * §green watch の実装。#2355 で常設化が決まり、#2363 で使い捨て Monitor から
 * repo 管理の script へ降ろした）。
 *
 * 仕様（rules 由来）: 90 秒 poll・状態遷移のみ通知・head SHA で dedupe。
 * レーン報告に依存しない機械 backstop であり、主経路（レーンの push 型報告）を
 * 置き換えない。
 *
 * 動作モード:
 * - 既定: 遷移（pending → success / failure、または新 head が最初から終端状態で
 *   現れた時）を検出したらその内容を stdout に出して **exit 0 する**。
 *   指揮台が Bash の run_in_background で起動すれば、プロセス終了 = 完了通知が
 *   そのまま push 型の通知になる（通知後は再起動して張り直す）
 * - `--follow`: exit せず遷移のたびに 1 行ずつ出力し続ける（人間が tee で
 *   眺める用途）
 * - `--once`: 1 回 poll して現在の盤面（PR ごとの集約状態）を出して終了する
 *   （セッション起動時の初期把握用）
 *
 * poll の一過性失敗（ネットワーク flake・gh の 5xx）は stderr に記録して
 * 継続するが、連続 MAX_CONSECUTIVE_FAILURES 回で exit 1 に倒す — watch が
 * 死んだこと自体も background 完了通知として指揮台へ届く（無音で監視が
 * 消えている状態を作らない）。
 */

export const DEFAULT_INTERVAL_SECONDS = 90;
export const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * `gh pr checks --json state,bucket` の bucket を PR 単位の集約状態へ畳む。
 * fail / cancel → 'failure'、pending が残る → 'pending'、それ以外
 * （pass / skipping のみ）→ 'success'。checks が空（まだ 1 つも報告されて
 * いない）は 'pending' 扱いにする。
 * @param {{ bucket?: string }[]} checks
 * @returns {'pending' | 'success' | 'failure'}
 */
export function aggregateChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'pending';
  let hasPending = false;
  for (const check of checks) {
    if (check.bucket === 'fail' || check.bucket === 'cancel') return 'failure';
    if (check.bucket === 'pending') hasPending = true;
  }
  return hasPending ? 'pending' : 'success';
}

/**
 * @typedef {{ number: number, headSha: string, state: 'pending' | 'success' | 'failure' }} PrSnapshot
 */

/**
 * 前回と今回の snapshot を突き合わせて通知すべき遷移を返す。dedupe キーは
 * `number@headSha`（同じ head の同じ状態は 2 度通知しない。push で head が
 * 動けば新キーとして扱う）。
 *
 * 通知対象:
 * - 既知キーの状態が変わった（pending → success / failure が本命。
 *   success → failure 等の再判定も拾う）
 * - 新キーが最初から終端状態で現れた（poll 間隔の間に pending を跨いで
 *   しまったケースを取りこぼさない）
 *
 * 新キーが pending で現れた・キーが消えた（merge / close / 新 push）は
 * 遷移ではないため通知しない。
 * @param {Map<string, PrSnapshot>} prev
 * @param {Map<string, PrSnapshot>} next
 * @returns {{ number: number, headSha: string, from: string | null, to: string }[]}
 */
export function diffSnapshots(prev, next) {
  const transitions = [];
  for (const [key, snapshot] of next) {
    const before = prev.get(key);
    if (before) {
      if (before.state !== snapshot.state) {
        transitions.push({
          number: snapshot.number,
          headSha: snapshot.headSha,
          from: before.state,
          to: snapshot.state,
        });
      }
    } else if (snapshot.state !== 'pending') {
      transitions.push({
        number: snapshot.number,
        headSha: snapshot.headSha,
        from: null,
        to: snapshot.state,
      });
    }
  }
  return transitions;
}

/**
 * `gh pr checks` は check の失敗時 exit 1・pending 時 exit 8 を返すため、
 * execFileSync が throw しても stdout に JSON が載っていればそれを使う。
 * checks が 1 つも無い PR はエラー文言（no checks reported）になるため
 * 空配列へ倒す。
 * @param {number} prNumber
 * @param {{ execFileImpl?: import('../lib/gh.mjs').ExecFileImpl }} [opts]
 */
function fetchChecks(prNumber, { execFileImpl } = {}) {
  try {
    return runGhJson(
      ['pr', 'checks', String(prNumber), '--repo', REPO, '--json', 'name,state,bucket'],
      { execFileImpl },
    );
  } catch (error) {
    const stdout = error && typeof error.stdout === 'string' ? error.stdout.trim() : '';
    if (stdout.startsWith('[')) {
      return JSON.parse(stdout);
    }
    const stderr = error && typeof error.stderr === 'string' ? error.stderr : '';
    if (stderr.includes('no checks reported')) return [];
    throw error;
  }
}

/**
 * open PR 全件の snapshot を取る。**draft PR は対象外。**
 *
 * この watch は「レーンが green 報告を送り忘れた時に指揮台が気づけるようにする」
 * backstop（`dispatch` skill（旧 orchestration.md、#2479 で再編） §green watch）で、拾いたいのは
 * **ready + green = レビュー待ち**への遷移だけ。
 *
 * draft を含めると誤検知になる（2026-08-26、#2415）: Draft CI 廃止で draft PR の
 * Static / Unit は `skipping` になり、`aggregateChecks` は fail / cancel / pending
 * 以外をすべて success へ畳むため、**docs guard が通っただけの draft PR が
 * 'pending → success' として通知される**。本 PR が確立するセマンティクス
 * （draft = レーンの私的作業場 / ready + green = レビュー待ち）と真逆の信号になり、
 * 指揮台のクロスレビューを誤発火させる。
 * @param {{ execFileImpl?: import('../lib/gh.mjs').ExecFileImpl }} [opts]
 * @returns {Map<string, PrSnapshot>}
 */
export function takeSnapshot({ execFileImpl } = {}) {
  const prs = runGhJson(
    ['pr', 'list', '--repo', REPO, '--state', 'open', '--json', 'number,headRefOid,isDraft'],
    { execFileImpl },
  );
  const snapshot = new Map();
  for (const pr of prs) {
    if (pr.isDraft) continue;
    const checks = fetchChecks(pr.number, { execFileImpl });
    const state = aggregateChecks(checks);
    snapshot.set(`${pr.number}@${pr.headRefOid}`, {
      number: pr.number,
      headSha: pr.headRefOid,
      state,
    });
  }
  return snapshot;
}

function formatLine({ number, headSha, from, to }) {
  const sha7 = headSha.slice(0, 7);
  return `PR #${number} (${sha7}) ${from ?? 'new'} -> ${to}`;
}

function formatSnapshot(snapshot) {
  if (snapshot.size === 0) return 'open PR なし';
  return [...snapshot.values()]
    .map(({ number, headSha, state }) => `PR #${number} (${headSha.slice(0, 7)}) ${state}`)
    .join('\n');
}

/** CLI 引数を解釈する。未知の引数は例外（黙って無視して意図と違う watch を張らない）。 */
export function parseArgs(argv) {
  const options = { mode: 'exit-on-transition', intervalSeconds: DEFAULT_INTERVAL_SECONDS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--follow') {
      options.mode = 'follow';
    } else if (arg === '--once') {
      options.mode = 'once';
    } else if (arg === '--interval-seconds') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 15) {
        throw new Error('--interval-seconds は 15 以上の整数で指定する');
      }
      options.intervalSeconds = value;
      i += 1;
    } else {
      throw new Error(`未知の引数です: ${arg}（--follow / --once / --interval-seconds N のみ）`);
    }
  }
  return options;
}

async function runWatch(options) {
  let prev = takeSnapshot();
  console.error(`[green-watch] baseline (${new Date().toISOString()}):`);
  console.error(formatSnapshot(prev));

  if (options.mode === 'once') {
    console.log(formatSnapshot(prev));
    return;
  }

  let consecutiveFailures = 0;
  for (;;) {
    await sleep(options.intervalSeconds * 1000);
    let next;
    try {
      next = takeSnapshot();
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      console.error(
        `[green-watch] poll 失敗 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error('poll の連続失敗が上限に達したため watch を終了する（張り直しが必要）');
      }
      continue;
    }
    const transitions = diffSnapshots(prev, next);
    prev = next;
    if (transitions.length > 0) {
      for (const transition of transitions) {
        console.log(formatLine(transition));
      }
      if (options.mode === 'exit-on-transition') return;
    }
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
  try {
    const options = parseArgs(process.argv.slice(2));
    await runWatch(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'green-watch failed');
    process.exitCode = 1;
  }
}
