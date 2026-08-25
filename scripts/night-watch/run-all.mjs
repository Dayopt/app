import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CHECK_DEFINITIONS, runAlertSync } from './alert-issue.mjs';
import { runBoardSync } from './board-issue.mjs';
import { runDodCandidateSelect } from './dod-candidate.mjs';
import { isLatestWorkflowRunPending } from './lib.mjs';
import { runMorningBrief } from './morning-brief.mjs';
import { CHECK_IDS, checkRecentPending, runBoardNote, runOpsLogReport } from './run-log.mjs';

/**
 * night-watch SKILL.md §自動パートの Step 1〜5 を GitHub Actions cron から
 * model 不在で完走させるオーケストレータ（#2367、Claude Routine からの移植。
 * 経緯は docs/projects 配下ではなく issue #2367 のコメント列を正本とする）。
 * Step 6（朝編成ブリーフ、#2370）も同じ run の最後に実行する。
 *
 * 既存 wrapper（board-issue.mjs / alert-issue.mjs / dod-candidate.mjs /
 * run-log.mjs / lib.mjs）は無変更のまま import して使う。唯一の例外は
 * `run-log.mjs` の `checkRecentPending`（github-actions[bot] の login を
 * trusted author として OR 追加した点修正、#2367 issue コメントで指揮台が
 * 承認済み）。ここに書くのは、旧設計で Claude（LLM）の裁量に委ねていた
 * 「観測結果を読んで red/green を判定する」部分だけ。
 *
 * Step 0（自己検証）は SKILL.md 側で廃止した。GitHub Actions の
 * `permissions:` ブロックはジョブ開始前に server 側で GITHUB_TOKEN を強制
 * するため、同じ非敵対的な script 自身によるランタイム自己検証より本質的に
 * 強い。手動代行（指揮台のローカル実行）の前提条件としての
 * `echo $DAYOPT_NIGHT_WATCH` 確認は SKILL.md 側に残す。
 */

const BASELINE_PATH = fileURLToPath(
  new URL('../../.claude/skills/night-watch/baseline.json', import.meta.url),
);

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
 * heavy-red / integration-red の判定（SKILL.md §自動パート の Step 2 参照）。
 * pending 判定は `isLatestWorkflowRunPending`（lib.mjs、正本）にそのまま委ねる。
 * pending でなければ、**直近 run（runs[0]）の terminal 結果を基準に**判定
 * する: 直近 run が `status: 'completed'` かつ `conclusion !== 'success'`
 * なら赤、または fetch した run（直近3件）のいずれにも直近24hのsuccessが
 * 無ければ赤。
 *
 * 直近3件のいずれかが非successなら赤、という旧判定は誤起票を常態化させて
 * いた（Codex レビュー指摘、指揮台採用・issue #2367 コメント参照）:
 * heavy-post-merge/integration.yml は nightly と push:main が同一
 * concurrency group（cancel-in-progress: true）のため、main push のたびに
 * nightly run が `conclusion=cancelled` になるのは日常的に発生する
 * （SKILL.md 自身が明記）。直近が success でも 2 件前の cancelled で赤に
 * なってしまっていた。
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
 * @param {{ status: string, conclusion: string | null, createdAt: string, url: string }[]} runs
 * @param {{ now?: number }} [opts]
 */
export function judgeWorkflowRun(runs, { now = Date.now() } = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error('runs は非空配列である必要があります');
  }
  if (isLatestWorkflowRunPending(runs)) {
    return { status: 'pending' };
  }
  const latest = runs[0];
  const latestNonSuccessTerminal = latest.status === 'completed' && latest.conclusion !== 'success';
  const hasRecentSuccess = runs.some(
    (run) =>
      run.conclusion === 'success' &&
      now - new Date(run.createdAt).getTime() <= WORKFLOW_RUN_WINDOW_MS,
  );
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
 * Step 2 の観測コマンドを実行する共通 helper。secret を含む env override
 * （dependabot-alerts の PAT 等）はこの `env` 引数経由でのみ渡す —
 * `process.env` はここでは一切書き換えない（#2367 issue コメントのトークン
 * 分離設計）。
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl, env?: NodeJS.ProcessEnv, cwd?: string }} [opts]
 * @returns {{ ok: true, stdout: string } | { ok: false, error: unknown }}
 */
export function execObservationCommand(cmd, args, { execFileImpl = execFileSync, env, cwd } = {}) {
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
    return { ok: false, error };
  }
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
 * @param {{ execFileImpl?: ExecFileImpl, env: NodeJS.ProcessEnv }} opts
 */
function checkExitCode(command, args, { execFileImpl, env }) {
  const result = execObservationCommand(command, args, { execFileImpl, env });
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
 * @param {{ execFileImpl?: ExecFileImpl, env?: NodeJS.ProcessEnv, parse: (stdout: string) => number }} opts
 */
function checkCountBaseline(command, args, baselineValue, { execFileImpl, env, parse }) {
  const result = execObservationCommand(command, args, { execFileImpl, env });
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

/**
 * run-url kind（heavy-red / integration-red）の観測。
 * @param {string[]} runListArgs
 * @param {{ execFileImpl?: ExecFileImpl, now?: number }} [opts]
 */
function checkWorkflowRun(runListArgs, { execFileImpl, now } = {}) {
  const result = execObservationCommand('gh', ['run', 'list', ...runListArgs], { execFileImpl });
  if (!result.ok) return { status: 'fetch-failed' };
  let runs;
  try {
    runs = JSON.parse(result.stdout);
  } catch {
    return { status: 'fetch-failed' };
  }
  if (!Array.isArray(runs) || runs.length === 0) return { status: 'fetch-failed' };
  const judged = judgeWorkflowRun(runs, { now });
  const latestUrl = runs[0]?.url;
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
 * @param {{ execFileImpl?: ExecFileImpl, sentryToken?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function checkSentryNew({ execFileImpl, sentryToken, env = process.env } = {}) {
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
    { execFileImpl, env: { ...env, SENTRY_AUTH_TOKEN: sentryToken } },
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

/** `runAlertSync` の戻り値を Step 5 の `results[]` エントリへ写像する。 */
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
 * 1 check-id の観測結果を Step 3 の起票判断へつなげ、`failed` /
 * `results` / `baselineRecommend` へ書き込む。
 * @param {string} checkId
 * @param {{ status: string, actual?: number, evidenceUrl?: string, count?: number, evidence?: string[] }} outcome
 * @param {{ execFileImpl?: ExecFileImpl, failed: string[], alertPostFailed: string[], results: unknown[], baselineRecommend: string[], runStatePath?: string }} deps
 */
function processCheckOutcome(
  checkId,
  outcome,
  { execFileImpl, failed, alertPostFailed, results, baselineRecommend, runStatePath },
) {
  if (outcome.status === 'fetch-failed') {
    failed.push(checkId);
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
  let redOutcome = outcome;
  if (outcome.status === 'pending') {
    let escalate = false;
    try {
      escalate = checkRecentPending(checkId, { execFileImpl }).consecutivePending;
    } catch (error) {
      console.error(
        `::warning::${checkId} の pending escalation 判定に失敗しました（pending のまま扱います）:`,
        error,
      );
    }
    if (!escalate) {
      results.push({ checkId, outcome: 'pending' });
      return;
    }
    redOutcome = { status: 'red', evidenceUrl: outcome.evidenceUrl };
  }
  // redOutcome.status === 'red'
  const alertArgs = buildAlertArgs(checkId, redOutcome);
  try {
    const alertResult = reportRedCheck(checkId, alertArgs, { execFileImpl, runStatePath });
    results.push(mapAlertResultToOutcome(checkId, alertResult));
  } catch (error) {
    console.error(`::error::${checkId} の alert 投稿に失敗しました:`, error);
    failed.push(checkId);
    // 赤を検出したのに alert issue を起票できなかった、という夜勤の主目的
    // に反する最悪の組み合わせ。`failed` への計上（観測未完了扱い・板note
    // の「一部取得失敗」表示）は維持しつつ、job の成否には別途この配列で
    // 反映する（Codex レビュー指摘・指揮台採用、PR #2380）。
    // `runNightWatch` 側で Step 5（運行記録）の投稿後に非 0 exit へ倒す —
    // Step 5 の記録自体は「alert 投稿が失敗した」事実も含めて必ず残す
    // ため、先に exitCode を立てて Step 5 をスキップさせない。
    alertPostFailed.push(checkId);
  }
}

/** Step 1（盤面起票）を実行し、run-log.mjs の `board` schema へ写像する。 */
function runStep1Board({ execFileImpl } = {}) {
  try {
    const result = runBoardSync({ execFileImpl });
    if (result.action === 'created') {
      return { status: 'success', issueNumber: result.issueNumber };
    }
    if (result.reason === 'weekend') {
      return { status: 'weekend' };
    }
    return { status: 'skip' };
  } catch (error) {
    return { status: 'fail', reason: classifyGhError(error) };
  }
}

/**
 * Step 4（DoD 監査候補選定）を実行する。`run-log.mjs` の `dod` schema には
 * `fail` 相当の状態が無い（既存 wrapper を無変更に保つ制約、#2367 issue
 * コメントで指揮台へ確認済み）ため、想定外の失敗は `status: 'none'` として
 * 報告した上で `dod4Failed: true` を返し、呼び出し元が job を fail させる
 * （事実と異なる 1 行が常設運行記録 issue に残る代わりに、job の赤で検出可能
 * にする設計判断）。
 */
function runStep4Dod({ execFileImpl, randomImpl } = {}) {
  try {
    const result = runDodCandidateSelect({ execFileImpl, randomImpl });
    if (result.reason === 'weekend') {
      return { dod: { status: 'weekend' }, dod4Failed: false };
    }
    if (result.selected) {
      return { dod: { status: 'candidate', prNumber: result.selected.number }, dod4Failed: false };
    }
    return { dod: { status: 'none' }, dod4Failed: false };
  } catch (error) {
    console.error('::error::Step 4（DoD候補選定）が失敗しました:', error);
    return { dod: { status: 'none' }, dod4Failed: true };
  }
}

/**
 * Step 1〜5 を順に実行する。各 Step は個別に失敗を許容し、Step 5（運行記録）
 * が必ず実行されるようにする。Step 5 自体の投稿失敗、または Step 4 の
 * 想定外失敗（schema 制約で報告内容が不正確になる、上記参照）は非 0 exit で
 * job を fail させる。
 * @param {{ execFileImpl?: ExecFileImpl, randomImpl?: () => number, now?: number, runStatePath?: string }} [opts]
 */
export function runNightWatch({ execFileImpl, randomImpl, now, runStatePath } = {}) {
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

  const board = runStep1Board({ execFileImpl });

  const failed = [];
  const alertPostFailed = [];
  const results = [];
  const baselineRecommend = [];

  /** @type {Record<string, { status: string, actual?: number, evidenceUrl?: string, count?: number, evidence?: string[] }>} */
  const checkOutcomes = {
    'docs-check': checkExitCode('pnpm', ['docs:check'], { execFileImpl, env: envWithoutGh }),
    'docs-coverage': checkCountBaseline('pnpm', ['docs:coverage'], baseline.docs_coverage_missing, {
      execFileImpl,
      env: envWithoutGh,
      parse: countDocsCoverageMissing,
    }),
    deadcode: checkExitCode('pnpm', ['quality:deadcode:ci'], { execFileImpl, env: envWithoutGh }),
    'dependabot-alerts': checkCountBaseline(
      'gh',
      ['api', 'repos/Dayopt/dayopt/dependabot/alerts?state=open', '--jq', 'length'],
      baseline.dependabot_alert_count,
      {
        execFileImpl,
        env: { ...process.env, GH_TOKEN: dependabotToken },
        parse: parseNonNegativeInt,
      },
    ),
    'heavy-red': checkWorkflowRun(
      [
        '--workflow=heavy-post-merge.yml',
        // integration-red と同じく main に限定する（PR #2380 クロスレビュー
        // 指摘、P2）。heavy-post-merge.yml は workflow_dispatch を持つため、
        // 誰かが feature branch で手動 dispatch すると、その run が
        // runs[0] になり main と無関係に heavy-red が誤起票される（または
        // feature branch の success が直近成功として main の赤を隠す）。
        '--branch',
        'main',
        '--limit',
        '3',
        '--json',
        'conclusion,status,headSha,createdAt,url',
      ],
      { execFileImpl, now },
    ),
    'integration-red': checkWorkflowRun(
      [
        '--workflow=integration.yml',
        '--branch',
        'main',
        '--limit',
        '3',
        '--json',
        'conclusion,status,headSha,createdAt,url',
      ],
      { execFileImpl, now },
    ),
    'sentry-new': checkSentryNew({ execFileImpl, sentryToken, env: envWithoutGh }),
  };

  for (const checkId of CHECK_IDS) {
    processCheckOutcome(checkId, checkOutcomes[checkId], {
      execFileImpl,
      failed,
      alertPostFailed,
      results,
      baselineRecommend,
      runStatePath,
    });
  }

  const executed = CHECK_IDS.size - failed.length;

  const { dod, dod4Failed } = runStep4Dod({ execFileImpl, randomImpl });

  const report = { executed, failed, results, baselineRecommend, board, dod };
  let step5Failed = false;
  try {
    runOpsLogReport({ report, execFileImpl, alertRunStatePath: runStatePath });
  } catch (error) {
    console.error('::error::Step 5（運行記録）の投稿に失敗しました:', error);
    step5Failed = true;
  }

  try {
    const allGreen = failed.length === 0 && results.every((entry) => entry.outcome === 'green');
    const issued = results.filter((entry) => entry.outcome === 'issue').length;
    runBoardNote({ note: { allGreen, issued, observed: executed }, execFileImpl });
  } catch (error) {
    // 当日盤面への 1 行は運行記録の補助であり、失敗しても運行記録自体は
    // 落とさない（board の状態次第で当日盤面が無いのは正常系にも起こる —
    // weekend や fail 時）。
    console.error('board-note の投稿に失敗しました（非致命）:', error);
  }

  // Step 6（#2370）: 朝編成ブリーフ。観測データの機械整形のみで判断を含まない。
  // 失敗しても他 Step の結果（運行記録・alert 起票）は既に確定しているため
  // run 全体は失敗にしない（非致命）。ただし完全な無音は避ける —
  // `::warning::` で GitHub Actions の annotation に残す（Codex レビュー
  // 指摘、指揮台採用。issue #2367 コメント参照。蒸留層 #2372 の入力が
  // 欠けても「ブリーフ無し」と「正常」を区別できるようにする。
  // `process.exitCode` は立てない — Step 6 は観測の付加価値であり、夜勤
  // 本体（Step 1〜5）の成否とは切り分ける）。
  //
  // `skipped` 経路（当日盤面 issue が無い、または既に投稿済み）も無音に
  // しない。特に `no-board-issue` は Step 1（起票）の失敗を示唆しうるため、
  // `::notice::` annotation を残す（PR #2380 クロスレビュー指摘、P3）。
  try {
    const briefResult = runMorningBrief({ execFileImpl, now });
    if (briefResult.action === 'skipped') {
      console.log(`::notice::朝編成ブリーフを skip しました（reason: ${briefResult.reason}）`);
    }
  } catch (error) {
    console.error('::warning::朝編成ブリーフの投稿に失敗しました（非致命）:', error);
  }

  // alert 投稿失敗（赤を検出したのに alert issue を起票できなかった）は
  // Step 5（運行記録）の投稿後に判定する。この順序が重要 — 先に exitCode
  // を立てて Step 5 の実行自体を止めてしまうと、「alert 投稿が失敗した」
  // という事実そのものが常設運行記録 issue に残らなくなる（Codex レビュー
  // 指摘・指揮台採用、PR #2380）。
  if (step5Failed || dod4Failed || alertPostFailed.length > 0) {
    process.exitCode = 1;
  }

  return { board, dod, report };
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
