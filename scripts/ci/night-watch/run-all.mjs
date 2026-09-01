import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CHECK_DEFINITIONS, runAlertSync, runFetchFailureAlertSync } from './alert-issue.mjs';
import { isLatestWorkflowRunPending, REPO } from './lib.mjs';

/**
 * night-watch SKILL.md §自動パート（観測 → 赤なら起票）を GitHub Actions cron
 * から model 不在で完走させるオーケストレータ（#2367、Claude Routine からの
 * 移植。経緯は issue #2367 のコメント列を正本とする）。
 *
 * **2026-09-01（#2525）で「毎朝の読み物」を作る層をすべて廃止した。** 旧
 * Step 1（当日盤面 issue の起票）/ Step 4（DoD 監査候補選定）/ Step 5（常設
 * 運行記録 issue #2216 への毎晩 1 コメント + 盤面への 1 行 note）/ Step 6
 * （朝編成ブリーフ）と、その先の 05:00 JST 蒸留層 Routine を廃止し、
 * `board-issue.mjs` / `dod-candidate.mjs` / `run-log.mjs` / `morning-brief.mjs`
 * を削除した。夜勤に残るのは **観測して、赤なら issue を起票する** だけ。
 * 緑の夜は無音（GitHub Actions の job が緑であること自体が「夜勤は動いた」の
 * 証跡）。故障検出手順は docs/operations/night-watch.md を正本とする。
 *
 * 廃止に伴い、#2216 のコメント列を読み取り元にしていた 2 つのエスカレーション
 * 機構を、外部状態に依存しない形へ置き換えた:
 * - pending の連晩判定（旧 `checkRecentPending`）→ `judgeWorkflowRun` の
 *   stale 判定（直近 run が pending でも、取得した run 群に
 *   `STALE_SUCCESS_WINDOW_MS` 以内の success が 1 つも無ければ red）
 * - fetch-failed の連晩判定（旧 `checkRecentFetchFailed`）→
 *   `execObservationCommand` の run 内 retry（一過性の失敗を吸収した上で、
 *   確定失敗はその夜のうちに起票する）
 *
 * Step 0（自己検証）は SKILL.md 側で廃止した。GitHub Actions の
 * `permissions:` ブロックはジョブ開始前に server 側で GITHUB_TOKEN を強制
 * するため、同じ非敵対的な script 自身によるランタイム自己検証より本質的に
 * 強い。手動代行（指揮台のローカル実行）の前提条件としての
 * `echo $DAYOPT_NIGHT_WATCH` 確認は SKILL.md 側に残す。
 */

/**
 * 夜勤が毎晩観測する check-id（#2525 で run-log.mjs から移設）。
 *
 * **`CHECK_DEFINITIONS`（alert-issue.mjs）のキー集合とは意図的に別物**にして
 * ある。`CHECK_DEFINITIONS` は「起票できる id」の集合で、観測ループを経由せず
 * 別の workflow job から CLI で起票される id（#2526 の `promote-red` など）も
 * 含む。ここから導出すると、そうした id を夜勤が「観測し忘れた check」として
 * 毎晩 fetch-failed 扱いしてしまう。
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

const BASELINE_PATH = fileURLToPath(
  new URL('../../../.claude/skills/night-watch/baseline.json', import.meta.url),
);

// nightly.yml の対象 job の `name:` フィールドと完全一致させる（#2483）。
// job 名を変更したらこの定数も同時に更新すること（nightly.yml 側にも同じ
// 結合を明記したコメントがある）。heavy-red は E2E + Web の 2 job を worst-of
// で 1 run 分の結論へ畳む（旧 heavy-post-merge.yml が 1 workflow に 2 job を
// 持ち、run 全体の conclusion で判定していた挙動を再現する）。
export const NIGHTLY_HEAVY_JOB_NAMES = ['\u{1F3AD} E2E Tests', '\u{1F310} Web Build & E2E'];
export const NIGHTLY_INTEGRATION_JOB_NAME = 'Integration Tests';

/**
 * `.claude/skills/night-watch/baseline.json` を読む。`alert-issue.mjs` にも
 * 同名の private 定数（`BASELINE_PATH` / `readBaseline`）があるが、export
 * されていないため複製している（既存 wrapper ファイルを無変更に保つ設計判断、
 * #2367 issue コメント参照）。baseline.json の path を変える時は両方を
 * 更新すること。
 */
export function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

const DOCS_COVERAGE_SECTION_RE = /## 機能 ⇄ 公開docs\n([\s\S]*?)(?=\n## |$)/;

/**
 * `pnpm docs:coverage` の stdout から `## 機能 ⇄ 公開docs` セクション内の
 * `なし`（cell 単位。en 列・ja 列それぞれが 1 件ずつ数えられる）を数える。
 * セクション境界は次の `## ` 見出し（`## en / ja が揃っていない` 等、そちらにも
 * `なし` を含む文字列が出るため、テーブル外まで拾わないよう非貪欲マッチで
 * 区切る）。
 *
 * 2026-08-25 実測: 現在の出力でちょうど 3 件、baseline.json の
 * `docs_coverage_missing: 3` と一致することを確認済み（#2367 issue コメント）。
 */
export function countDocsCoverageMissing(markdown) {
  const match = markdown.match(DOCS_COVERAGE_SECTION_RE);
  if (!match) {
    throw new Error('docs:coverage 出力から `## 機能 ⇄ 公開docs` セクションが見つかりません');
  }
  return (match[1].match(/なし/g) ?? []).length;
}

/**
 * count-baseline kind（docs-coverage / dependabot-alerts）の判定
 * （checklist.md: actual > baseline のみ異常）。
 * @param {number} actual
 * @param {number} baseline
 * @returns {'red' | 'green' | 'green-recommend'}
 */
export function judgeCountBaseline(actual, baseline) {
  if (actual > baseline) return 'red';
  if (actual < baseline) return 'green-recommend';
  return 'green';
}

const WORKFLOW_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * stale 判定（下記 `judgeWorkflowRun`）の success 猶予。#2525 で
 * `checkRecentPending`（常設運行記録 issue のコメント列を読んで「pending が
 * 2 晩連続したか」を数える機構）を廃止した代わりに、run 履歴だけから
 * 「pending のまま何日も進んでいない」を検出する。
 *
 * `WORKFLOW_RUN_WINDOW_MS`（24h）より緩くしてあるのは、pending 経路が
 * 通常運用で 24h ぎりぎりに寄るため。層 3 は毎晩 03:00 JST に走るので、
 * 前夜の success からこの判定までは概ね 24h -α。cron 配信が数十分遅れる
 * だけで「24h 以内の success が無い」に倒れて誤 red を出す。48h なら
 * 「2 晩続けて完了できていない」だけを拾える。
 */
const STALE_SUCCESS_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * heavy-red / integration-red の判定（SKILL.md §自動パート の Step 2 参照）。
 * pending 判定は `isLatestWorkflowRunPending`（lib.mjs、正本）にそのまま委ねる。
 * pending でなければ、**直近 run（runs[0]）の terminal 結果を基準に**判定
 * する: 直近 run が `status: 'completed'` かつ `conclusion !== 'success'`
 * なら赤、または fetch した run（直近3件）のいずれにも直近24hのsuccessが
 * 無ければ赤。
 *
 * 直近3件のいずれかが非successなら赤、という旧判定は誤起票を常態化させて
 * いた（Codex レビュー指摘、指揮台採用・issue #2367 コメント参照）:
 * 旧 heavy-post-merge.yml / integration.yml は**それぞれの workflow 内で**全
 * トリガーが同一 concurrency group を共有していた（`heavy-post-merge-${github.ref}`
 * / `integration-${github.ref}`、cancel-in-progress: true）。そのため同一
 * グループの in-flight run を新しい run が追い越すと `conclusion=cancelled` に
 * なり、直近が success でも 2 件前の cancelled で赤になってしまっていた。
 *
 * #2382（2026-08-25）で heavy-post-merge の push:main を廃止し、#2483（CI
 * ファイル統合 Phase 1）で両ファイルを nightly.yml へ吸収した。吸収後は
 * job 単位の concurrency group（`nightly-heavy-e2e` / `nightly-heavy-web` /
 * `nightly-integration`）に分かれ、integration の push:main トリガー自体も
 * 廃止した（per-PR 検出は ci.yml の test job が affected 判定で担う）ため、
 * 当時 cancelled 混入の主因だった経路は解消している。**それでも緩和ロジック
 * 自体は撤去しない**: 再 dispatch（promote 中断後の再開等）や将来のトリガー
 * 追加で同型の cancelled 混入が再発しうる一般的な backstop として維持する。
 *
 * `hasRecentSuccess` は `runs`（直近3件、runs[0] 自身を含む）全体を走査
 * する。**runs[0] が「24h 以内の」success なら、この条件だけで必ず green
 * になる**（2件前以前の cancelled/failure は red へ寄与しない。ただし
 * runs[0] が success でも createdAt が 24h より古ければ——workflow の
 * schedule 自体が長期間発火していない等——この条件は満たされず red の
 * ままになりうる）。したがって第2条件は「直近 run が偶然 success でも、
 * それより前が全滅なら赤のまま保つ backstop」ではなく、**「直近 window
 * （fetch した直近3件、実運用の cron 間隔では概ね直近数日）に一度も
 * 24h以内のsuccessが無い」workflow の長期停止・staleness を検出する
 * backstop**（PR #2380 クロスレビュー指摘、P3・push前反証レビュー
 * risk-reviewer 指摘で追加修正。実装ではなくこのコメントの誤記を訂正）。
 * より強い保証（直近 run が success でも過去の失敗を検出したい）が要る
 * 場合は別 issue で設計する — 直近 run 基準への変更自体は Codex 指摘で
 * 採用した設計であり、ここを緩めると誤 red が戻る。evidence には
 * runs[0].url（直近 run の URL）を使う。
 *
 * **pending の stale 判定（#2525）**: 直近 run が未完了（in_progress /
 * queued）でも、取得した run 群に `STALE_SUCCESS_WINDOW_MS`（48h）以内の
 * success が 1 つも無ければ red を返す。旧設計は pending を無条件で
 * 「判定保留」に倒し、連晩の判定は `checkRecentPending`（常設運行記録
 * issue のコメント列を数える）へ委ねていた。#2525 でそのコメント自体を
 * 廃止したため、**run 履歴だけから導出できる形へ置き換えた**。これが無いと
 * 「queued のまま何晩も進まない」（runner 枯渇・workflow 定義の破損で
 * 起動しない等）が永遠に pending 扱いで無音になる。単発の遅延は 48h 窓の
 * 内側に前夜の success があるため red にならない。
 * @param {{ status: string, conclusion: string | null, createdAt: string, url: string }[]} runs
 * @param {{ now?: number }} [opts]
 */
export function judgeWorkflowRun(runs, { now = Date.now() } = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error('runs は非空配列である必要があります');
  }
  const hasSuccessWithin = (windowMs) =>
    runs.some(
      (run) => run.conclusion === 'success' && now - new Date(run.createdAt).getTime() <= windowMs,
    );
  if (isLatestWorkflowRunPending(runs)) {
    if (hasSuccessWithin(STALE_SUCCESS_WINDOW_MS)) {
      return { status: 'pending' };
    }
    return { status: 'red', evidenceUrl: runs[0].url, reason: 'stale-pending' };
  }
  const latest = runs[0];
  const latestNonSuccessTerminal = latest.status === 'completed' && latest.conclusion !== 'success';
  const hasRecentSuccess = hasSuccessWithin(WORKFLOW_RUN_WINDOW_MS);
  const red = latestNonSuccessTerminal || !hasRecentSuccess;
  return { status: red ? 'red' : 'green', evidenceUrl: latest.url };
}

/**
 * gh CLI（や JSON.parse）の失敗を `run-log.mjs` の `board.reason` enum
 * （`BOARD_FAIL_REASONS`、既知 5 種）へ写像する。自由文字列を public な
 * 常設運行記録 issue へ書かないという既存の設計原則（run-log.mjs の
 * コメント参照）を、生成元の gh エラーメッセージにも適用する。
 * @param {unknown} error
 * @returns {'auth-error' | 'rate-limited' | 'network-error' | 'invalid-response' | 'unknown'}
 */
export function classifyGhError(error) {
  if (error instanceof SyntaxError) return 'invalid-response';
  const text = `${error?.stderr ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('rate limit')) return 'rate-limited';
  if (
    text.includes('http 401') ||
    text.includes('bad credentials') ||
    text.includes('http 403') ||
    text.includes('authentication') ||
    text.includes('not accessible by integration')
  ) {
    return 'auth-error';
  }
  if (
    text.includes('econnrefused') ||
    text.includes('enotfound') ||
    text.includes('etimedout') ||
    text.includes('could not resolve host') ||
    text.includes('network is unreachable')
  ) {
    return 'network-error';
  }
  return 'unknown';
}

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/**
 * 観測コマンド 1 本あたりの上限。job 全体の予算は `timeout-minutes: 15`
 * だけで、setup（pnpm install）+ 複数の観測コマンド（docs:check /
 * docs:coverage / quality:deadcode:ci の monorepo 全体 knip / gh・sentry の
 * ネットワーク往復）がその中に全部入る。1 本が hang すると runner が job
 * ごと kill し、最後に置かれた Step 5（運行記録）が実行されないまま消える
 * （PR #2380 クロスレビュー指摘、P2）。個々のコマンドに上限を設け、hang を
 * 「取得失敗」（`isSpawnFailure` → fetch-failed 経路）へ縮退させる。
 * @type {number}
 */
const OBSERVATION_COMMAND_TIMEOUT_MS = 240_000;

/**
 * 観測コマンドの追加試行回数（#2525）。合計試行は 1 + この値。
 *
 * fetch-failed の起票条件を「3 晩連続」（常設運行記録 issue のコメント列を
 * 数える `checkRecentFetchFailed`）から「その夜のうち」へ変えたことの対価を
 * ここで払う。単発の rate limit / ネットワーク断・DNS 一時失敗をそのまま
 * issue にすると、翌朝に自然回復している alert が定常的に溜まり、
 * 「issue があれば本物」という #2525 の前提が崩れる。
 *
 * **retry 対象は「一過性と分類できた失敗」だけ**（`isRetriableObservationFailure`）。
 * 特に timeout kill は除外する: `OBSERVATION_COMMAND_TIMEOUT_MS` は 240s で
 * job 全体の予算は `timeout-minutes: 15`（900s）。hang したコマンドを 3 回
 * 走らせると 720s + setup（checkout / pnpm install / Sentry CLI）で予算を
 * 超え、残りの check の観測・alert 起票・サマリ 1 行ごと runner に kill
 * される。**この不等式は `scripts/ci/night-watch/run-all.test.ts` の
 * 「retry の総コストが job 予算を超えない」test が固定する。**
 */
const OBSERVATION_COMMAND_RETRIES = 2;

/** retry 間隔の基数（ミリ秒）。n 回目の待ちは base × n（1s → 2s）。 */
const OBSERVATION_RETRY_BASE_DELAY_MS = 1_000;

/** retry の待ち時間の合計（1s + 2s = 3s）。 */
const OBSERVATION_RETRY_TOTAL_DELAY_MS =
  ((OBSERVATION_COMMAND_RETRIES * (OBSERVATION_COMMAND_RETRIES + 1)) / 2) *
  OBSERVATION_RETRY_BASE_DELAY_MS;

/**
 * night-watch job の `timeout-minutes`（`.github/workflows/nightly.yml`）を
 * ミリ秒で持つ。workflow 側を変えたらここも変える。
 */
export const NIGHT_WATCH_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 観測コマンド 1 本が retry を含めて消費しうる最悪時間。
 *
 * **timeout を retry 対象から外していることが、この値が job 予算に収まる
 * 根拠**（`isRetriableObservationFailure`）。timeout が retry されると
 * 240s × 3 = 720s になり、setup（checkout / pnpm install / Sentry CLI）と
 * 合わせて `NIGHT_WATCH_JOB_TIMEOUT_MS` を超えて runner に kill される。
 * `run-all.test.ts` の不等式 test がこれを固定する（内製クロスレビュー
 * risk-reviewer 指摘、high。2026-09-01 実測で確定 — `execFileSync` の
 * timeout error は `killed` を持たず `signal: 'SIGKILL'` / `code: 'ETIMEDOUT'`
 * を返すため、旧実装の `error.killed` ガードは常に素通りしていた）。
 */
export const WORST_CASE_OBSERVATION_MS =
  OBSERVATION_COMMAND_TIMEOUT_MS + OBSERVATION_RETRY_TOTAL_DELAY_MS;

/**
 * 同期スリープ。夜勤は単一プロセスの直列実行（lib.mjs の
 * `reserveAlertRunSlot` コメント参照）で、待つ間に進められる仕事が無いため
 * async 化しない。`Atomics.wait` は実 timer を使うので busy loop にならない。
 * @param {number} ms
 */
function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Step 2 の観測コマンドを実行する共通 helper。secret を含む env override
 * （dependabot-alerts の PAT 等）はこの `env` 引数経由でのみ渡す —
 * `process.env` はここでは一切書き換えない（#2367 issue コメントのトークン
 * 分離設計）。
 *
 * retry するのは `isRetriableObservationFailure` が true を返すもの（spawn
 * 失敗・ネットワーク系）だけ。非 0 exit（本物の赤）と timeout kill は
 * 1 回で確定させる。
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl, env?: NodeJS.ProcessEnv, cwd?: string, retries?: number, sleepImpl?: (ms: number) => void }} [opts]
 * @returns {{ ok: true, stdout: string } | { ok: false, error: unknown }}
 */
export function execObservationCommand(
  cmd,
  args,
  {
    execFileImpl = execFileSync,
    env,
    cwd,
    retries = OBSERVATION_COMMAND_RETRIES,
    sleepImpl = sleepSync,
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const stdout = execFileImpl(cmd, args, {
        encoding: 'utf8',
        env: env ?? process.env,
        timeout: OBSERVATION_COMMAND_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        ...(cwd ? { cwd } : {}),
      });
      return { ok: true, stdout };
    } catch (error) {
      lastError = error;
      logObservationFailure(cmd, args, error, { attempt: attempt + 1, total: retries + 1 });
      if (!isRetriableObservationFailure(error)) break;
      if (attempt < retries) sleepImpl(OBSERVATION_RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }
  return { ok: false, error: lastError };
}

// GitHub Actions の job log（private、常設運行記録 issue とは別の出力先）へ
// 出す診断行の長さ上限。#2422: `sentry-new` の取得失敗が「取得失敗」とだけ
// 運行記録に残り、原因（認証切れ・ネットワーク断・応答パース不能等）が
// job log にも一切残らない診断性の欠陥を埋める。ここは public issue 本文
// （enum 化された自由文字列拒否が必要な場所）ではないため、error.message /
// error.stderr を要約せずそのまま出す。長さだけ切って runner ログの肥大を防ぐ。
const OBSERVATION_ERROR_LOG_MAX_CHARS = 500;

function truncateForLog(text) {
  return text.length > OBSERVATION_ERROR_LOG_MAX_CHARS
    ? `${text.slice(0, OBSERVATION_ERROR_LOG_MAX_CHARS)}…`
    : text;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {unknown} error
 * @param {{ attempt?: number, total?: number }} [progress]
 */
function logObservationFailure(cmd, args, error, { attempt, total } = {}) {
  const classification = classifyGhError(error);
  const detailParts = [];
  if (attempt !== undefined && total !== undefined && total > 1) {
    detailParts.push(`attempt=${attempt}/${total}`);
  }
  const message = /** @type {{ message?: unknown, stderr?: unknown }} */ (error)?.message;
  const stderr = /** @type {{ message?: unknown, stderr?: unknown }} */ (error)?.stderr;
  if (typeof message === 'string' && message.length > 0) {
    detailParts.push(`message=${truncateForLog(message)}`);
  }
  if (typeof stderr === 'string' && stderr.length > 0) {
    detailParts.push(`stderr=${truncateForLog(stderr)}`);
  }
  const detail = detailParts.length > 0 ? ` — ${detailParts.join(' ')}` : '';
  console.error(
    `::warning::観測コマンドが失敗しました（分類: ${classification}）: ${cmd} ${args.join(' ')}${detail}`,
  );
}

/**
 * `execFileSync` が投げる Error のうち、「process を spawn できなかった」
 * （ENOENT 等、`error.status` が無い）ものだけを true にする。「process は
 * 起動して非 0 exit で終了した」（`error.status` に実際の exit code が入る）
 * ものは false — こちらは checklist.md の exit-code kind の設計どおり
 * 「観測はできたが結果が異常」を意味し、取得失敗（本当に observe できな
 * かった）とは区別する。
 * @param {unknown} error
 */
function isSpawnFailure(error) {
  return typeof (/** @type {{ status?: unknown }} */ (error)?.status) !== 'number';
}

/**
 * `execFileSync` が timeout で子プロセスを kill した失敗か。
 *
 * **`error.killed` は見ない**（2026-09-01 実測、内製クロスレビュー
 * risk-reviewer 指摘 high）。`execFileSync` は `spawnSync` の戻り値を error へ
 * 写すだけで、そこに `killed` は含まれない。実測値:
 *
 *     execFileSync('sleep', ['5'], { timeout: 200, killSignal: 'SIGKILL' })
 *     → { signal: 'SIGKILL', status: null, code: 'ETIMEDOUT' }（killed は undefined）
 *
 * `killed` を見ていた旧実装は timeout を常に「retry してよい」と誤判定し、
 * 防ぐと宣言していた 240s × 3 をそのまま踏んでいた。
 * @param {unknown} error
 */
function isTimeoutFailure(error) {
  const e = /** @type {{ code?: unknown, signal?: unknown }} */ (error);
  return e?.code === 'ETIMEDOUT' || e?.signal === 'SIGKILL';
}

/**
 * `execObservationCommand` の retry 対象か（#2525）。
 *
 * **「一過性だと分類できた失敗」だけを retry する。** 判定は
 * `classifyGhError`（gh / sentry の stderr・message を読む既存の分類器）に
 * 委ね、`isSpawnFailure`（= `status` が数値でない）では切らない。
 *
 * spawn 失敗かどうかで切っていた旧実装は対象が反転していた（内製クロス
 * レビュー risk-reviewer 指摘 medium、2026-09-01 実測で確定）: 吸収したい
 * 失敗——gh の rate limit、GitHub の 5xx、DNS 一時失敗——は**プロセスが起動
 * して非 0 exit する**ため `status: 1` になり retry されず、逆に retry しても
 * 回復しない ENOENT と、retry してはいけない timeout だけが retry されていた。
 *
 *     execFileSync('gh', ['api', '<404 path>'])  → status: 1（数値）
 *
 * 現在の分類:
 * - **timeout kill** → 対象外（`isTimeoutFailure`。job 予算を溶かす）
 * - **rate-limited / network-error** → 対象。非 0 exit でも retry する
 * - **それ以外**（本物の赤の非 0 exit、ENOENT、auth-error、invalid-response）
 *   → 対象外。retry しても結果が変わらない。特に auth-error（token scope の
 *   退行）は 3 回叩いても同じで、その夜のうちに起票されるべき異常
 * @param {unknown} error
 */
function isRetriableObservationFailure(error) {
  if (isTimeoutFailure(error)) return false;
  const classification = classifyGhError(error);
  return classification === 'rate-limited' || classification === 'network-error';
}

/**
 * `process.env` から指定 key を除いた env オブジェクトを作る（元は変更しない）。
 * `GH_TOKEN`/`GITHUB_TOKEN`（issues:write 等を持つ既定トークン）を、それを
 * 必要としないサードパーティ依存コード（`pnpm docs:check` の docs-guard、
 * `docs:coverage`、`quality:deadcode:ci` の knip 等、いずれも gh を呼ばない）
 * から隠すために使う（push 前反証レビュー risk-reviewer 指摘、medium。
 * NIGHT_WATCH_DEPENDABOT_TOKEN / SENTRY_AUTH_TOKEN と同じ token 分離原則を
 * 既定の GH_TOKEN にも適用する）。
 */
function envWithout(...keys) {
  const env = { ...process.env };
  for (const key of keys) delete env[key];
  return env;
}

/**
 * exit-code kind（docs-check / deadcode）の観測。gh を必要としないため
 * `env`（呼び出し元が `envWithout('GH_TOKEN', 'GITHUB_TOKEN')` で用意する）を
 * 使い、GH_TOKEN を持たない状態で spawn する。**呼び出し元は
 * `process.env` からの秘密削除（`runNightWatch` 冒頭）が完了した後で
 * `envWithout` を呼ぶこと** — モジュール読み込み時に一度だけ計算すると、
 * その時点でまだ削除されていない NIGHT_WATCH_DEPENDABOT_TOKEN /
 * SENTRY_AUTH_TOKEN がスナップショットに焼き込まれ、削除が無意味になる。
 * @param {string} command
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl, env: NodeJS.ProcessEnv, sleepImpl?: (ms: number) => void }} opts
 */
function checkExitCode(command, args, { execFileImpl, env, sleepImpl }) {
  const result = execObservationCommand(command, args, { execFileImpl, env, sleepImpl });
  if (result.ok) return { status: 'green' };
  if (isSpawnFailure(result.error)) return { status: 'fetch-failed' };
  return { status: 'red' };
}

function parseNonNegativeInt(stdout) {
  const trimmed = stdout.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`数値ではない出力です: ${trimmed}`);
  }
  return Number(trimmed);
}

/**
 * count-baseline kind（docs-coverage / dependabot-alerts）の観測。この 2 つは
 * 常に exit 0 を返す設計（docs-coverage は index.ts 冒頭コメント参照、
 * dependabot-alerts は `--jq 'length'` が失敗するのは gh 側の障害時のみ）の
 * ため、非 0 exit・パース不能はどちらも「取得失敗」として扱う（red/fetch-failed
 * の曖昧さが無い）。
 * @param {string} command
 * @param {string[]} args
 * @param {number} baselineValue
 * @param {{ execFileImpl?: ExecFileImpl, env?: NodeJS.ProcessEnv, parse: (stdout: string) => number, sleepImpl?: (ms: number) => void }} opts
 */
function checkCountBaseline(command, args, baselineValue, { execFileImpl, env, parse, sleepImpl }) {
  const result = execObservationCommand(command, args, { execFileImpl, env, sleepImpl });
  if (!result.ok) return { status: 'fetch-failed' };
  let actual;
  try {
    actual = parse(result.stdout);
  } catch {
    return { status: 'fetch-failed' };
  }
  const judged = judgeCountBaseline(actual, baselineValue);
  if (judged === 'red') return { status: 'red', actual };
  if (judged === 'green-recommend') return { status: 'green-recommend', actual };
  return { status: 'green' };
}

// GitHub Actions の conclusion のうち「success 以外」を重大度順に並べる。
// 複数 job（heavy-red は E2E + Web の 2 job）を 1 run 分の代表値へ畳む時、
// この順で最初に一致したものを「その run の結論」として採用する（旧
// heavy-post-merge.yml の「run 全体の conclusion は job の worst-of」という
// 挙動を、job 単位判定でも再現するため）。未知の conclusion は末尾に置く
// （楽観側＝success 寄りに倒さない）。
const CONCLUSION_SEVERITY = [
  'action_required',
  'timed_out',
  'failure',
  'startup_failure',
  'stale',
  'cancelled',
  'neutral',
  'success',
];

export function worseConclusion(a, b) {
  const ai = CONCLUSION_SEVERITY.indexOf(a);
  const bi = CONCLUSION_SEVERITY.indexOf(b);
  if (ai === -1) return a; // 未知の値は無条件で「悪い方」扱い（fail closed）
  if (bi === -1) return b;
  return ai <= bi ? a : b;
}

/**
 * run-url kind（heavy-red / integration-red）の観測。**workflow ファイル名では
 * なく job 名で判定する**（#2483 CI ファイル統合: heavy-e2e / heavy-web /
 * integration が nightly.yml 内の job になり、複数 cron の run が同じ
 * `--workflow=nightly.yml` の下に混在するため、`--workflow=` だけでは
 * cron ごとに異なる job を区別できない）。
 *
 * 手順: (1) `gh run list --workflow=nightly.yml --branch main` で直近の run
 * 一覧（`runListLimit` 件）を新しい順に取得する。1 日 6 cron が同じ workflow
 * を共有するため、対象 job が実際に走った run に絞り込むには単純な直近 N 件
 * では足りない——`runListLimit` は数日分の余裕を持たせてある。(2) 各 run に
 * ついて `gh api .../actions/runs/{id}/jobs` で対象 job 名（複数指定可）を
 * 探し、全部が `conclusion === 'skipped'`（= その cron ではこの run に
 * 対象 job が 1 つも実行されなかった）の run は除外する。実行された job が
 * 複数あれば worst-of で 1 run 分の結論へ畳む（heavy-red は E2E / Web の
 * 2 job を 1 つの run として扱う旧 heavy-post-merge.yml の挙動を再現）。
 * (3) `targetCount` 件集まるか run 一覧を使い切ったら打ち切り、
 * `judgeWorkflowRun`（判定ロジックは無変更）へ渡す。
 *
 * 1 run 単位の job 取得失敗（一時的な rate limit 等）は次の run へ読み進める
 * ——1 件の失敗で全体を fetch-failed にすると、直近に本物の red がある時
 * ほど検出できなくなる（fail closed の方向を間違える）。ただし対象 job が
 * 1 件も見つからなければ「判定不能」として fetch-failed を返す（取得成功と
 * 失敗を区別できないが、どちらも「今回は判定できなかった」という結論は
 * 同じなので実害は無い）。
 *
 * @param {string[]} jobNames nightly.yml の対象 job の `name:` と完全一致
 *   させる（例: `['🎭 E2E Tests', '🌐 Web Build & E2E']`）。job 名を変えたら
 *   呼び出し側の定数も同時に変える。
 * @param {{ execFileImpl?: ExecFileImpl, now?: number, runListLimit?: number, targetCount?: number, sleepImpl?: (ms: number) => void }} [opts]
 */
export function checkWorkflowJobRun(
  jobNames,
  { execFileImpl, now, runListLimit = 30, targetCount = 3, sleepImpl } = {},
) {
  const listResult = execObservationCommand(
    'gh',
    [
      'run',
      'list',
      '--workflow=nightly.yml',
      '--branch',
      'main',
      '--limit',
      String(runListLimit),
      '--json',
      'databaseId,createdAt,url',
    ],
    // env は既定（process.env）のまま。この 2 本は gh を呼ぶので GH_TOKEN が要る。
    { execFileImpl, sleepImpl },
  );
  if (!listResult.ok) return { status: 'fetch-failed' };

  let runs;
  try {
    runs = JSON.parse(listResult.stdout);
  } catch {
    return { status: 'fetch-failed' };
  }
  if (!Array.isArray(runs) || runs.length === 0) return { status: 'fetch-failed' };

  const matched = [];
  for (const run of runs) {
    if (matched.length >= targetCount) break;
    // gh run list の JSON 出力（GitHub API 由来）を信頼しているが、他 wrapper
    // （alert-issue.mjs の evidence-url 検証、strip-status-labels.mjs の
    // Number.isInteger）と同じ「値の形は使う直前に検証する」規約に揃える
    // （push前反証レビュー risk-reviewer 指摘、P2）。
    if (!Number.isInteger(run.databaseId)) continue;
    const jobsResult = execObservationCommand(
      'gh',
      ['api', `repos/${REPO}/actions/runs/${run.databaseId}/jobs`, '--jq', '.jobs'],
      { execFileImpl, sleepImpl },
    );
    if (!jobsResult.ok) continue; // この run は諦めて次へ（1 run の一時失敗で全体を諦めない）

    let jobs;
    try {
      jobs = JSON.parse(jobsResult.stdout);
    } catch {
      continue;
    }
    if (!Array.isArray(jobs)) continue;

    const targetJobs = jobs.filter(
      (j) => jobNames.includes(j?.name) && j?.conclusion !== 'skipped',
    );
    if (targetJobs.length === 0) continue; // この run では対象 job が 1 つも実行されていない

    const status = targetJobs.some((j) => j.status !== 'completed')
      ? targetJobs.find((j) => j.status !== 'completed').status
      : 'completed';
    const conclusion = targetJobs
      .map((j) => j.conclusion)
      .reduce((worst, c) => (worst === null ? c : worseConclusion(worst, c)), null);
    const earliestStartedAt = targetJobs
      .map((j) => j.started_at)
      .filter(Boolean)
      .sort()[0];

    matched.push({
      status,
      conclusion,
      createdAt: earliestStartedAt || run.createdAt,
      url: targetJobs.find((j) => j.conclusion !== 'success')?.html_url ?? run.url,
    });
  }

  if (matched.length === 0) return { status: 'fetch-failed' };

  const judged = judgeWorkflowRun(matched, { now });
  const latestUrl = matched[0]?.url;
  if (judged.status === 'pending') return { status: 'pending', evidenceUrl: latestUrl };
  if (judged.status === 'red')
    return { status: 'red', evidenceUrl: judged.evidenceUrl ?? latestUrl };
  return { status: 'green' };
}

// alert-issue.mjs の MAX_SENTRY_EVIDENCE（5、export されていないため複製）。
// この定数は security boundary ではなく「何件送ろうとするか」の上限に過ぎない
// — 万一値がずれて多く送っても alert-issue.mjs 側の同名チェックが拒否し、
// reportRedCheck の evidence-less 再試行にフォールバックするだけなので実害は無い。
const SENTRY_EVIDENCE_CANDIDATES = 5;

/**
 * `sentry issue list` の `--limit`。`--limit` 引数と（将来 count 表示を扱う
 * コードがあれば）その基準値を同じ場所で管理するための定数化のみ
 * （マジックナンバー `100` の重複を避ける）。
 *
 * **`"${SENTRY_QUERY_LIMIT}+"` のような非数字 count 表示は導入しない**
 * （2026-08-25、push 前反証レビュー risk-reviewer 指摘、high。一度実装して
 * 自己発見・revert 済み）。`alert-issue.mjs` の sentry kind は
 * `DIGITS_RE = /^\d+$/` で `--count` を厳密検証しており、`"100+"` を渡すと
 * `buildAlertBody` が例外を投げる。`reportRedCheck` の evidence-less 再試行
 * も count 自体は変えないため必ず再度 throw し、**24h で新規 unresolved が
 * 100 件以上出た本番障害時（このチェックが最も必要な時）に限って alert
 * issue が起票されず、運行記録には実態と違う「取得失敗: sentry-new」だけが
 * 残る**という新しい回帰を作っていた。`alert-issue.mjs` は無変更のまま使う
 * 既存 wrapper（#2367 issue コメント）のため、count は常に
 * `String(issues.length)` の素の数字で渡す。
 * @type {number}
 */
const SENTRY_QUERY_LIMIT = 100;

/**
 * sentry kind（sentry-new）の観測。`--json --fields shortId,permalink` で
 * 構造化出力を取得する（prose 出力の parsing より安全。CHECK_DEFINITIONS の
 * command 文字列は起票 issue の表示用のままで、実行はこちらを使う —
 * 既存の設計方針〈表示用コマンドと実行コマンドは意図的に異なりうる〉を踏襲）。
 * `env` は GH_TOKEN を持たない base（呼び出し元の `envWithoutGh`）を渡す —
 * この CLI は gh を必要としないため、issues:write 等を持つ既定トークンを
 * 見せる理由が無い（push 前反証レビュー risk-reviewer 指摘、medium）。
 * @param {{ execFileImpl?: ExecFileImpl, sentryToken?: string, env?: NodeJS.ProcessEnv, sleepImpl?: (ms: number) => void }} [opts]
 */
export function checkSentryNew({ execFileImpl, sentryToken, env = process.env, sleepImpl } = {}) {
  const result = execObservationCommand(
    'sentry',
    [
      'issue',
      'list',
      'dayopt',
      '--query',
      'is:unresolved age:-24h',
      '--json',
      '--fields',
      'shortId,permalink',
      '--limit',
      String(SENTRY_QUERY_LIMIT),
    ],
    { execFileImpl, env: { ...env, SENTRY_AUTH_TOKEN: sentryToken }, sleepImpl },
  );
  if (!result.ok) return { status: 'fetch-failed' };
  let issues;
  try {
    const trimmed = result.stdout.trim();
    issues = trimmed === '' ? [] : JSON.parse(trimmed);
  } catch {
    return { status: 'fetch-failed' };
  }
  if (!Array.isArray(issues)) return { status: 'fetch-failed' };
  if (issues.length === 0) return { status: 'green' };
  const evidence = issues
    .slice(0, SENTRY_EVIDENCE_CANDIDATES)
    .map((issue) => `${issue.shortId} ${issue.permalink}`);
  return { status: 'red', count: issues.length, evidence };
}

/** @param {string} checkId @param {{ actual?: number, evidenceUrl?: string, count?: number, evidence?: string[] }} outcome */
export function buildAlertArgs(checkId, outcome) {
  const definition = CHECK_DEFINITIONS[checkId];
  switch (definition.kind) {
    case 'exit-code':
      return {};
    case 'count-baseline':
      return { actual: String(outcome.actual) };
    case 'run-url':
      return { 'evidence-url': outcome.evidenceUrl };
    case 'sentry':
      return { count: String(outcome.count), evidence: outcome.evidence ?? [] };
    default:
      throw new Error(`未対応の kind です: ${definition.kind}`);
  }
}

/**
 * `alert-issue.mjs` の `runAlertSync` を呼ぶ。sentry-new だけ、evidence が
 * `SENTRY_EVIDENCE_RE`（alert-issue.mjs 側、複製しない）と一致せず throw
 * した場合に、evidence 無し（count のみ）で 1 回だけ再試行する
 * （#2367 issue コメントの設計判断）。
 */
function reportRedCheck(checkId, args, { execFileImpl, runStatePath } = {}) {
  try {
    return runAlertSync({ checkId, args, execFileImpl, runStatePath });
  } catch (error) {
    if (checkId === 'sentry-new' && args.evidence?.length > 0) {
      return runAlertSync({ checkId, args: { ...args, evidence: [] }, execFileImpl, runStatePath });
    }
    throw error;
  }
}

/** `runAlertSync` の戻り値を run サマリの `results[]` エントリへ写像する。 */
function mapAlertResultToOutcome(checkId, alertResult) {
  if (alertResult.action === 'created' || alertResult.action === 'commented') {
    return { checkId, outcome: 'issue', issueNumber: alertResult.issueNumber };
  }
  if (alertResult.action === 'capped') {
    return { checkId, outcome: 'skipped', reason: 'run-cap-reached' };
  }
  // action: 'skipped'（dedup 検索失敗、alert-issue.mjs 内部の日本語 reason）
  return { checkId, outcome: 'skipped', reason: 'dedup-search-failed' };
}

/**
 * この結果は「赤を検出したのに issue を残せなかった」か。
 *
 * `runAlertSync` / `runFetchFailureAlertSync` は dedup 検索（`gh issue list
 * --search`）が失敗すると **throw せず** `{ action: 'skipped' }` を返す
 * （fail closed で誤起票を避ける設計、alert-issue.mjs）。この戻り値を
 * 「起票しなかった」で片付けると、gh 側の障害（token scope の退行・API
 * incident・secondary rate limit）の夜に **本物の赤あり / issue ゼロ /
 * job 緑** が成立する（内製クロスレビュー risk-reviewer 指摘、high）。
 *
 * #2525 より前はこの障害で Step 5（運行記録の gh 投稿）も一緒に失敗し、
 * その非 0 exit が backstop になっていた。運行記録を廃止した以上、
 * ここで明示的に拾わないと backstop が丸ごと消える。
 *
 * **`run-cap-reached` は対象外**。これは `MAX_NEW_ISSUES_PER_RUN` による
 * 意図的な減衰であって障害ではない。
 * @param {{ outcome: string, reason?: string }} entry
 */
function isAlertDeliveryFailure(entry) {
  return entry.outcome === 'skipped' && entry.reason === 'dedup-search-failed';
}

/**
 * 1 check-id の観測結果を起票判断へつなげ、`failed` /
 * `results` / `baselineRecommend` へ書き込む。
 * @param {string} checkId
 * @param {{ status: string, actual?: number, evidenceUrl?: string, count?: number, evidence?: string[] }} outcome
 * @param {{ execFileImpl?: ExecFileImpl, failed: string[], alertPostFailed: string[], results: unknown[], baselineRecommend: string[], runStatePath?: string }} deps
 */
function processCheckOutcome(
  checkId,
  outcome,
  {
    execFileImpl,
    failed,
    alertPostFailed,
    results,
    baselineRecommend,
    runStatePath,
    deferredFetchFailed,
  },
) {
  if (outcome.status === 'fetch-failed') {
    failed.push(checkId);
    // #2422: fetch-failure の起票はここでは行わず、全 check-id の red/pending
    // 判定（下の他分岐）が終わってから、まとめて処理する。
    // 理由（push前反証レビュー指摘・P2、PR #2445）: `reserveAlertRunSlot` の
    // 新規起票上限（`MAX_NEW_ISSUES_PER_RUN`）は run 全体で共有されている。
    // CHECK_IDS の並び順（dependabot-alerts が heavy-red/integration-red より
    // 先）のまま逐次処理すると、慢性的な fetch-failed が先に予算を使い切り、
    // 本物の CI 赤（heavy-red/integration-red）が `run-cap-reached` で
    // 起票されなくなる。夜勤の主目的（赤の起票）を副次目的（観測失敗の
    // 可視化）より優先するため、red/pending の予約を先に確定させる。
    // **#2525 で「3 晩連続」の条件は外したが、この順序は維持する** — 起票が
    // 当夜化したぶん fetch-failed が予算を取りにいく頻度はむしろ上がる。
    deferredFetchFailed.push(checkId);
    return;
  }
  if (outcome.status === 'green') {
    results.push({ checkId, outcome: 'green' });
    return;
  }
  if (outcome.status === 'green-recommend') {
    results.push({ checkId, outcome: 'green' });
    baselineRecommend.push(checkId);
    return;
  }
  if (outcome.status === 'pending') {
    // 単発の pending（cron 遅延で観測時点にまだ走っている）は判定保留のまま
    // 無音にする。連晩の stuck は `judgeWorkflowRun` の stale 判定が既に
    // red へ倒しているため、ここへは来ない（#2525。旧 `checkRecentPending`
    // による常設運行記録 issue のコメント列走査は廃止した）。
    console.log(`::notice::${checkId}: 直近 run が未完了のため判定を保留しました`);
    results.push({ checkId, outcome: 'pending' });
    return;
  }
  // outcome.status === 'red'
  const alertArgs = buildAlertArgs(checkId, outcome);
  try {
    const alertResult = reportRedCheck(checkId, alertArgs, { execFileImpl, runStatePath });
    const entry = mapAlertResultToOutcome(checkId, alertResult);
    results.push(entry);
    if (isAlertDeliveryFailure(entry)) {
      // throw されない起票失敗（dedup 検索が落ちて fail closed で見送られた）。
      // catch 節と同じ扱いへ倒さないと job が緑のまま赤が無音化する。
      console.error(
        `::error::${checkId} の赤を検出しましたが dedup 検索が失敗し起票を見送りました`,
      );
      failed.push(checkId);
      alertPostFailed.push(checkId);
    }
  } catch (error) {
    console.error(`::error::${checkId} の alert 投稿に失敗しました:`, error);
    failed.push(checkId);
    // 赤を検出したのに alert issue を起票できなかった、という夜勤の主目的
    // に反する最悪の組み合わせ。`failed` への計上（観測未完了扱い）は維持
    // しつつ、job の成否には別途この配列で反映する（Codex レビュー指摘・
    // 指揮台採用、PR #2380）。`runNightWatch` 側で run サマリを job log へ
    // 出した後に非 0 exit へ倒す — 「alert 投稿が失敗した」事実そのものが
    // サマリに残るよう、先に exitCode を立ててサマリを飛ばさない。
    alertPostFailed.push(checkId);
  }
}

/**
 * `processCheckOutcome` が deferred した fetch-failed check-id を、全 check-id の
 * red 判定が確定した後にまとめて処理する（#2422、P2 是正・PR #2445）。
 *
 * **#2525 で「3 晩連続」の条件を外し、その夜のうちに起票するようにした。**
 * 旧実装は `checkRecentFetchFailed` が常設運行記録 issue #2216 のコメント列を
 * 走査して連晩を数えていたが、そのコメント自体を廃止したため成立しない。
 * 一過性の失敗は `execObservationCommand` の run 内 retry
 * （`isRetriableObservationFailure`）が吸収するので、ここへ来る時点で
 * 「retry しても駄目だった」が確定している。既に open な escalation issue が
 * あれば `runFetchFailureAlertSync` の dedup がコメント追記へ倒す。
 * @param {string} checkId
 * @param {{ execFileImpl?: ExecFileImpl, alertPostFailed: string[], results: unknown[], runStatePath?: string }} deps
 */
function escalateFetchFailure(checkId, { execFileImpl, alertPostFailed, results, runStatePath }) {
  try {
    const alertResult = runFetchFailureAlertSync({
      checkId,
      execFileImpl,
      runStatePath,
    });
    const entry = mapAlertResultToOutcome(checkId, alertResult);
    results.push(entry);
    if (isAlertDeliveryFailure(entry)) {
      console.error(
        `::error::${checkId} の観測失敗を検出しましたが dedup 検索が失敗し起票を見送りました`,
      );
      alertPostFailed.push(checkId);
    }
  } catch (error) {
    console.error(`::error::${checkId} の fetch-failure alert 投稿に失敗しました:`, error);
    alertPostFailed.push(checkId);
  }
}

/**
 * run の結論を GitHub Actions の job log へ 1 行で残す（#2525）。
 *
 * 常設運行記録 issue #2216 への毎晩 1 コメントを廃止したため、「何件観測して
 * 何件起票したか」を人が後から読める場所がここだけになる。緑の夜は issue が
 * 1 件も増えないのが正常系なので、run ログにこの 1 行が無いことが「夜勤が
 * 途中で死んだ」の signal になる（docs/operations/night-watch.md §故障検出手順）。
 * @param {{ executed: number, failed: string[], results: { checkId: string, outcome: string }[] }} report
 */
export function buildRunSummaryLine({ executed, failed, results, alertPostFailed = [] }) {
  const count = (fn) => results.filter(fn).length;
  const issued = count((e) => e.outcome === 'issue');
  const pending = count((e) => e.outcome === 'pending');
  const capped = count((e) => e.outcome === 'skipped' && e.reason === 'run-cap-reached');
  // 観測できなかった check-id。`failed` には起票に失敗した分も混ざるため、
  // そちらを引いて「本当に観測できなかった件数」だけを出す（内製クロス
  // レビュー risk-reviewer 指摘 low: 唯一の人間可読な記録が、gh の起票失敗を
  // 観測コマンドの失敗として報告していた）。
  const fetchFailed = failed.filter((id) => !alertPostFailed.includes(id)).length;

  // pending だけの夜（heavy-e2e が 04:00 時点でまだ走っている、という日常）を
  // 「要確認」にしない。ここを厳しくすると verdict の識別力が落ちる。
  const hasProblem =
    fetchFailed > 0 ||
    alertPostFailed.length > 0 ||
    issued > 0 ||
    capped > 0 ||
    results.some((e) => e.outcome === 'skipped' && e.reason !== 'run-cap-reached');
  const allGreen = !hasProblem && pending === 0;
  const verdict = allGreen ? 'all green' : hasProblem ? '要確認' : '判定保留あり';

  return [
    `night-watch: ${verdict}`,
    `観測 ${executed}/${CHECK_IDS.size}`,
    `起票 ${issued}`,
    `保留 ${pending}`,
    `起票失敗 ${alertPostFailed.length}`,
    `予算超過 ${capped}`,
    `取得失敗 ${fetchFailed}`,
  ].join(' | ');
}

/**
 * 全 check-id を観測し、赤なら alert issue を起票する（#2525 で Step 1/4/5/6
 * を廃止し、この 2 段だけになった）。alert 投稿の失敗（赤を検出したのに
 * 起票できなかった）だけが非 0 exit の条件で、それ以外は緑で終える。
 * @param {{ execFileImpl?: ExecFileImpl, now?: number, runStatePath?: string, sleepImpl?: (ms: number) => void }} [opts]
 */
export function runNightWatch({ execFileImpl, now, runStatePath, sleepImpl } = {}) {
  // トークン分離: NIGHT_WATCH_DEPENDABOT_TOKEN / SENTRY_AUTH_TOKEN を
  // process.env から即座に取り除き、以降に spawn する pnpm 系コマンド
  // （docs:check 等、サードパーティ依存コードを大量実行する）から見えなく
  // する（#2367 issue コメントのトークン分離設計）。
  const dependabotToken = process.env.NIGHT_WATCH_DEPENDABOT_TOKEN;
  const sentryToken = process.env.SENTRY_AUTH_TOKEN;
  delete process.env.NIGHT_WATCH_DEPENDABOT_TOKEN;
  delete process.env.SENTRY_AUTH_TOKEN;

  // GH_TOKEN（issues:write 等を持つ既定トークン）も、それを必要としない
  // コマンド（docs:check/docs:coverage/quality:deadcode:ci/sentry はいずれも
  // gh を呼ばない）からは隠す（push 前反証レビュー risk-reviewer 指摘、
  // medium）。**上の delete 呼び出しの後で** envWithout を呼ぶこと — 先に
  // 呼ぶと NIGHT_WATCH_DEPENDABOT_TOKEN / SENTRY_AUTH_TOKEN がまだ
  // process.env に残っている状態のスナップショットが焼き込まれ、上の
  // delete が無意味になる。
  const envWithoutGh = envWithout('GH_TOKEN', 'GITHUB_TOKEN');

  const baseline = readBaseline();

  const failed = [];
  const alertPostFailed = [];
  const results = [];
  const baselineRecommend = [];

  /** @type {Record<string, { status: string, actual?: number, evidenceUrl?: string, count?: number, evidence?: string[] }>} */
  const checkOutcomes = {
    'docs-check': checkExitCode('pnpm', ['docs:check'], {
      execFileImpl,
      env: envWithoutGh,
      sleepImpl,
    }),
    'docs-coverage': checkCountBaseline('pnpm', ['docs:coverage'], baseline.docs_coverage_missing, {
      execFileImpl,
      env: envWithoutGh,
      parse: countDocsCoverageMissing,
      sleepImpl,
    }),
    deadcode: checkExitCode('pnpm', ['quality:deadcode:ci'], {
      execFileImpl,
      env: envWithoutGh,
      sleepImpl,
    }),
    'dependabot-alerts': checkCountBaseline(
      'gh',
      ['api', 'repos/Dayopt/dayopt/dependabot/alerts?state=open', '--jq', 'length'],
      baseline.dependabot_alert_count,
      {
        execFileImpl,
        env: { ...process.env, GH_TOKEN: dependabotToken },
        parse: parseNonNegativeInt,
        sleepImpl,
      },
    ),
    // job 名は nightly.yml の該当 job の `name:` と完全一致させる
    // （NIGHTLY_HEAVY_JOB_NAMES / NIGHTLY_INTEGRATION_JOB_NAME、定数化して
    // job 名変更時の更新漏れを検出しやすくしてある）。main 限定は旧設計を
    // 引き継ぐ: `--workflow=nightly.yml` は誰でも `workflow_dispatch` できる
    // ため、feature branch からの手動発火が直近 run を占有して main の赤を
    // 隠す・誤起票する事故を防ぐ（旧 heavy-post-merge.yml / integration.yml
    // と同じ理由、PR #2380 / #2333 の教訓を維持）。
    'heavy-red': checkWorkflowJobRun(NIGHTLY_HEAVY_JOB_NAMES, { execFileImpl, now, sleepImpl }),
    'integration-red': checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], {
      execFileImpl,
      now,
      sleepImpl,
    }),
    'sentry-new': checkSentryNew({ execFileImpl, sentryToken, env: envWithoutGh, sleepImpl }),
  };

  // #2422 の P2 是正（PR #2445）: fetch-failed の起票は他 check-id の
  // red 判定がすべて確定してから処理する（deferredFetchFailed に集める）。
  // 新規起票予算（reserveAlertRunSlot の run 全体共有カウンタ）を、慢性的な
  // 観測失敗より本物の CI 赤（heavy-red/integration-red）に優先して割り当てる。
  const deferredFetchFailed = [];
  for (const checkId of CHECK_IDS) {
    processCheckOutcome(checkId, checkOutcomes[checkId], {
      execFileImpl,
      failed,
      alertPostFailed,
      results,
      baselineRecommend,
      runStatePath,
      deferredFetchFailed,
    });
  }
  for (const checkId of deferredFetchFailed) {
    escalateFetchFailure(checkId, { execFileImpl, alertPostFailed, results, runStatePath });
  }

  // `failed` には「観測できなかった」に加えて「赤は観測できたが起票に失敗した」
  // も入る。executed（観測できた件数）はその重複を差し引かない — どちらも
  // 「この夜その check-id の結論を確定できなかった」で正しい。
  const executed = CHECK_IDS.size - new Set(failed).size;

  const report = { executed, failed, results, baselineRecommend, alertPostFailed };

  // run の結論を job log へ残す（#2525）。**exitCode を立てる前に出す** —
  // 先に倒して出力を飛ばすと、「赤を検出したのに起票できなかった」という
  // 最も知りたい事実がどこにも残らなくなる（Step 5 の投稿順序について
  // Codex が指摘した論点、PR #2380。出力先が issue から job log へ変わって
  // も同じ理由が効く）。
  console.log(buildRunSummaryLine(report));
  if (baselineRecommend.length > 0) {
    console.log(
      `::notice::baseline 更新推奨（実測が baseline を下回りました）: ${baselineRecommend.join(', ')}`,
    );
  }

  if (alertPostFailed.length > 0) {
    console.error(
      `::error::異常を検出しましたが alert issue を起票できませんでした: ${alertPostFailed.join(', ')}`,
    );
    process.exitCode = 1;
  }

  return { report };
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
  runNightWatch();
}
