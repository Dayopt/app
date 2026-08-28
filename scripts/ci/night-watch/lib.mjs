import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * night-watch（.claude/skills/night-watch/SKILL.md）の gh 直叩きを wrapper へ寄せる
 * 共通基盤（#2291 v2 dispatch、PR #2309 未解決 thread の構造的解消）。
 *
 * 設計原則: **動的な値は shell へ二度渡さない**。Bash tool から見えるコマンドは
 * 常に固定形（`node scripts/ci/night-watch/<script>.mjs <subcommand>` + 検証済みの
 * 位置引数のみ）で、guard（scripts/hooks/pre-tool-guard-impl.sh）は
 * is_single_simple_command + no-redirect の一般規則だけで守れる。実際に危険な
 * 部分（issue 本文・タイトル・検索クエリの構築、gh への引数受け渡し）はこの
 * ファイルと各 script が `execFileSync` の argv 配列で行う。argv 配列は shell を
 * 経由しないため、値の中にどんな文字（backtick・blockquote・ANSI-C escape が
 * shell 展開でできあがった文字列など）が入っていても、それが gh の flag として
 * 再解釈されることは無い（.op-env.human 境界と同じ「値をコマンドラインに載せない」
 * 設計だが、こちらは「値を再度 shell に渡さない」変種）。
 */

export const REPO = 'Dayopt/dayopt';

/**
 * @typedef {(file: string, args: string[], options?: { encoding?: string }) => string} ExecFileImpl
 * 実体は `node:child_process` の `execFileSync`（string encoding 指定時の戻り値）。
 * test では差し替え可能な最小限の呼び出し形だけを型に持たせる。
 */

// `execFileSync` の既定 maxBuffer は 1MB で、超えると ENOBUFS で throw する。
// gh の応答量は public repo では第三者が動かせる変数（issue / PR の件数と本文長）
// なので、既定のままだと「観測が黙って落ちる」を外から誘発できる。呼び出し側は
// --jq 射影で応答を絞るのが第一防御（morning-brief の fetchOpenPrs 参照）で、
// これはその裏の余裕。大きすぎる値は OOM を招くので 32MB に留める。
export const GH_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/**
 * gh CLI を execFile 経由で呼ぶ。shell を経由しない。
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function runGh(args, { execFileImpl = execFileSync } = {}) {
  return execFileImpl('gh', args, { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES });
}

/**
 * gh CLI の JSON 出力をパースして返す。
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function runGhJson(args, opts = {}) {
  const out = runGh(args, opts);
  return JSON.parse(out);
}

/** JST（Asia/Tokyo）暦日を YYYY-MM-DD で返す。引数省略時は現在時刻。 */
export function jstDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * JST 暦日の N 日前を YYYY-MM-DD で返す。DST が無い JST では、JST 深夜 0 時の
 * 瞬間から 24h × N 引けば常に N 日前の JST 暦日になるため、UTC 演算で安全に求まる。
 */
export function jstDaysAgoString(days, date = new Date()) {
  const todayJst = jstDateString(date);
  const jstMidnight = new Date(`${todayJst}T00:00:00+09:00`);
  jstMidnight.setUTCDate(jstMidnight.getUTCDate() - days);
  return jstDateString(jstMidnight);
}

/** JST 暦日の前日を YYYY-MM-DD で返す。 */
export function jstYesterdayString(date = new Date()) {
  return jstDaysAgoString(1, date);
}

/**
 * GitHub 検索クエリの日境界レンジ（`<qualifier>:<start>..<end>` の右辺）。
 * `endDateStr` を省略すると `startDateStr` 単日のレンジになる（dod-candidate.mjs
 * の月曜拡張窓のように複数日にまたがるレンジが必要な呼び出し元は明示的に渡す）。
 */
export function jstDayRange(startDateStr, endDateStr = startDateStr) {
  return `${startDateStr}T00:00:00+09:00..${endDateStr}T23:59:59+09:00`;
}

// JST 曜日名 → インデックス（0=日, 1=月, ..., 6=土）。night-watch の起点が
// 05:00 JST 毎日運行へ確定した際（#2334 コメント）、盤面 issue の起票だけは
// 平日のみに絞り、DoD 監査候補選定は月曜だけ金〜日の3日分をまとめて拾う設計に
// なった。両方が同じ JST 曜日判定を必要とするため共通ユーティリティにする。
const JST_WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * JST 曜日インデックス（0=日〜6=土）を返す。`Intl.DateTimeFormat` が想定外の
 * label を返した場合は例外を投げる（push前反証レビュー risk-reviewer 指摘、
 * P3）。無言で fallback すると `isJstWeekend` / `isJstMonday` がどちらも
 * false（平日扱い）を返し、weekend skip が無音で無効化される。
 */
export function jstWeekdayIndex(date = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date);
  const index = JST_WEEKDAY_INDEX[label];
  if (index === undefined) {
    throw new Error(`未知の JST 曜日ラベルです: ${label}`);
  }
  return index;
}

/** JST で土曜日または日曜日か。 */
export function isJstWeekend(date = new Date()) {
  const idx = jstWeekdayIndex(date);
  return idx === 0 || idx === 6;
}

/** JST で月曜日か。 */
export function isJstMonday(date = new Date()) {
  return jstWeekdayIndex(date) === 1;
}

/** issue/comment URL 末尾の番号を取り出す（`gh issue create/comment` の stdout 形式）。 */
export function extractTrailingNumber(url) {
  const match = url.trim().match(/(\d+)(?:#[^/]*)?$/);
  return match ? Number(match[1]) : null;
}

/**
 * heavy-red / integration-red（`gh run list ... --json conclusion,status,...`）の
 * 判定規約の正本。**直近 run（配列先頭、gh run list は新しい順）が未完了
 * （`status` が `in_progress` / `queued`）なら、判定を保留すべきかを返す**。
 *
 * GitHub Actions の scheduled workflow は数十分規模の遅延が日常的に起きる。
 * 旧判定規約は status を無条件で赤判定へ含めており、単に実行中というだけの
 * run を赤と誤検出していた（#2341、integration.yml の schedule-run margin が
 * 30分しかなく実際に誤起票しうると判明）。true を返した check-id は §Step2
 * fail-closed 原則と同じ経路（`<check-id>: 取得失敗`、Step 5 の `failed` へ
 * 記録）へ倒し、赤とは判定しない・alert-issue.mjs を呼ばない。
 *
 * 過去の run（配列 2 件目以降）が in_progress のまま止まっている場合まで
 * 拾わない（そのような状態は通常発生せず、拾おうとすると「実行中」の通常
 * 判定と区別できなくなる）。
 * @param {{ status: string }[]} runs
 * @returns {boolean}
 */
export function isLatestWorkflowRunPending(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return false;
  const status = runs[0]?.status;
  return status === 'in_progress' || status === 'queued';
}

/**
 * 当日 JST タイトルの盤面 issue を探す。無ければ null。
 * dod-candidate.mjs（Step 4）・run-log.mjs（Step 5 の当日盤面 issue への 1 行
 * コメント）の両方が使う共通ルックアップ。
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function findTodayBoardIssue({ execFileImpl } = {}) {
  const title = `盤面 ${jstDateString()}`;
  const openBoardIssues = runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--label',
      'type:board',
      '--json',
      'number,title',
    ],
    { execFileImpl },
  );
  return openBoardIssues.find((issue) => issue.title === title) ?? null;
}

/**
 * night-watch Step 3（alert-issue.mjs）の 1 run あたり起票上限（#2332）が使う
 * run-scoped state。check-id ごとに独立した process 呼び出しの間で状態を
 * 共有するため、gh を経由しない local file を使う。
 *
 * plan-review（#2332）で確定した設計:
 * - **同一 check-id は 1 run につき 1 回だけ**（新規起票・既存issueへの追記を
 *   問わない）。prompt injection が同じ check-id へ `report` を繰り返し呼ぶ
 *   ループ（issue #2332 が「無制限の追記」として懸念した class）を、点で
 *   数え上げるのではなく class ごと閉じる
 * - **新規起票のみ追加で `MAX_NEW_ISSUES_PER_RUN` 件に cap**（SKILL.md
 *   §Step3 point 5 が元々定めていた「誤登録・想定外の大量検出の機械的減衰」の
 *   意図を保つ。7 check-id が同時赤化した場合の新規 issue 濫造を防ぐ）
 * - **TTL でスコープする（JST 暦日ではない）**。日付スコープだと、Routine が
 *   run 途中で死んだ日に手動代行（SKILL.md §故障モード）が走ると、前 run が
 *   使い切った予算を引き継いで復旧 run が 1 件も起票できなくなる。夜勤 1 run
 *   は分オーダーで完了するため、`ALERT_RUN_STATE_TTL_MS` を大きく超える間隔が
 *   空けば別 run とみなしてよい
 * - **state が読めない/壊れている時は fail-open**（無制限扱いで gh 呼び出しを
 *   通す）。cap の目的は誤登録の減衰であって、state 機構自体の不調で
 *   night-watch の唯一の通知チャネル（issue 起票・コメント）を無音にしては
 *   いけない。ただし不健全である事実は `healthy: false` として呼び出し元
 *   （run-log.mjs Step 5）へ伝え、運行記録コメントへ機械生成の 1 行として
 *   残す（Claude の自己申告に頼らず、wrapper 自身が同じ state file を読んで
 *   報告する）
 * - **単一プロセス直列実行が前提**。night-watch は 1 セッションが Bash tool
 *   呼び出しを 1 つずつ順に実行する（並行実行しない）ため、read-modify-write
 *   の TOCTOU は発生しない
 */
export const ALERT_RUN_STATE_TTL_MS = 60 * 60 * 1000;
export const MAX_NEW_ISSUES_PER_RUN = 3;
const DEFAULT_ALERT_RUN_STATE_PATH = join(tmpdir(), 'dayopt-night-watch-alert-run-state.json');
const MAX_ACTED_CHECK_IDS = 32;

function freshAlertRunState() {
  return { updatedAt: Date.now(), actedCheckIds: [], createdCount: 0 };
}

// 想定外に壊れた state（第三者が予測可能な tmp path へ書いた、部分書き込みで
// 破損した等）を**構造面でのみ**検証する（createdCount の範囲・actedCheckIds
// の型と長さ）。**中身の正当性（actedCheckIds に実在する check-id が並んで
// いるか）までは検証しない**（push前反証レビュー risk-reviewer 指摘、P2。
// 旧コメントは「壊れた/偽装された値が cap を超過扱いにする」ことだけを防ぐと
// 主張していたが、実装が防いでいるのはそれだけで、構造的に妥当な偽装値
// （実在する check-id を並べた state）を先回りして書けば TTL の間 alert を
// 無音化できる余地は防げていなかった。night-watch セッション自身はこの経路に
// 到達できない（層3 が Write/Edit を無条件拒否し、Bash allowlist に汎用書き
// 込み手段が無いため）。state file は固定名（DEFAULT_ALERT_RUN_STATE_PATH）で
// tmpdir 配下に置かれるため、tmpdir を共有する別プロセス・別ユーザーからの
// 到達性は実行環境依存。フルに閉じるには run 識別子で state を紐付ける設計
// 変更が要る（follow-up issue で検討、mode 0o600 での書き込みは軽減策として
// reserveAlertRunSlot 側に追加済み）。
function isValidAlertRunState(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt > 0 &&
    Array.isArray(value.actedCheckIds) &&
    value.actedCheckIds.length <= MAX_ACTED_CHECK_IDS &&
    value.actedCheckIds.every((id) => typeof id === 'string') &&
    Number.isInteger(value.createdCount) &&
    value.createdCount >= 0 &&
    value.createdCount <= MAX_NEW_ISSUES_PER_RUN
  );
}

/**
 * @typedef {{ healthy: boolean, updatedAt: number, actedCheckIds: string[], createdCount: number }} AlertRunState
 */

/**
 * state file を読む。無い/壊れている/TTL 超過のいずれも fresh state を返す
 * （fail-open）。`healthy: false` は「壊れていた」ことだけを表し、`healthy`
 * の値に関わらず返る `actedCheckIds`/`createdCount` は常に安全な fresh 値。
 * @param {{ statePath?: string }} [opts]
 * @returns {AlertRunState}
 */
export function readAlertRunState({ statePath = DEFAULT_ALERT_RUN_STATE_PATH } = {}) {
  let raw;
  try {
    raw = readFileSync(statePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      // 未作成（run 最初の呼び出し）。異常ではないため healthy: true。
      return { healthy: true, ...freshAlertRunState() };
    }
    // ENOENT 以外（権限不足等）は state 機構の不調として報告する。
    return { healthy: false, ...freshAlertRunState() };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ファイルは存在するが破損している（部分書き込み・想定外の書き手）。
    // fail-open はするが、単純な未作成とは区別して報告する。
    return { healthy: false, ...freshAlertRunState() };
  }
  if (!isValidAlertRunState(parsed)) {
    return { healthy: false, ...freshAlertRunState() };
  }
  if (Date.now() - parsed.updatedAt > ALERT_RUN_STATE_TTL_MS) {
    return { healthy: true, ...freshAlertRunState() };
  }
  return {
    healthy: true,
    updatedAt: parsed.updatedAt,
    actedCheckIds: parsed.actedCheckIds,
    createdCount: parsed.createdCount,
  };
}

/**
 * check-id が今 run で action してよいかを判定し、許可するなら state を
 * 即座に書き込む（gh 呼び出しの**前**に予約する。gh 呼び出しの後に加算する
 * と、gh が失敗してリトライされた時に消費した試行が計上されず、injection
 * ループが上限を超えて gh を叩き続けられる）。
 * @param {{ checkId: string, willCreate: boolean, statePath?: string }} params
 * @returns {{ allowed: true } | { allowed: false, reason: 'run-cap-reached' }}
 */
export function reserveAlertRunSlot({
  checkId,
  willCreate,
  statePath = DEFAULT_ALERT_RUN_STATE_PATH,
}) {
  const state = readAlertRunState({ statePath });
  if (state.actedCheckIds.includes(checkId)) {
    return { allowed: false, reason: 'run-cap-reached' };
  }
  if (willCreate && state.createdCount >= MAX_NEW_ISSUES_PER_RUN) {
    return { allowed: false, reason: 'run-cap-reached' };
  }
  const next = {
    updatedAt: Date.now(),
    actedCheckIds: [...state.actedCheckIds, checkId],
    createdCount: state.createdCount + (willCreate ? 1 : 0),
  };
  try {
    // mode: 0o600 は Node の writeFileSync 仕様上 **新規作成時にのみ**適用
    // される（既存ファイルの mode は変更しない）。night-watch が先にこの
    // state file を作れた通常系では他ユーザーからの読み書きを防ぐが、
    // isValidAlertRunState 冒頭のコメントが示す脅威（第三者が先回りで偽装
    // state を作る）そのものへの対策にはならない（push前反証レビュー
    // risk-reviewer 指摘、P3。先に作られていれば mode は effect 無し）。
    // フルに閉じるには run 識別子で state を紐付ける設計変更が要る
    // （follow-up issue #2340 で検討）。
    writeFileSync(statePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // 書き込み失敗（tmpdir が read-only / ENOSPC / 権限不足）でも fail-open を
    // 維持する（push前反証レビュー risk-reviewer 指摘、P2）。ここで例外を
    // 伝播させると gh を一切呼ばずに CLI が exit 1 し、その run の全 check-id
    // で起票・追記が 1 件も出ない — cap の目的（誤登録の減衰）を大きく超えて
    // night-watch の唯一の通知チャネルを無音にしてしまう。
  }
  return { allowed: true };
}
