import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * night-watch（.claude/skills/night-watch/SKILL.md）の gh 直叩きを wrapper へ寄せる
 * 共通基盤（#2291 v2 dispatch、PR #2309 未解決 thread の構造的解消）。
 *
 * 設計原則: **動的な値は shell へ二度渡さない**。Bash tool から見えるコマンドは
 * 常に固定形（`node scripts/night-watch/<script>.mjs <subcommand>` + 検証済みの
 * 位置引数のみ）で、guard（.claude/hooks/pre-tool-guard-impl.sh）は
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

/**
 * gh CLI を execFile 経由で呼ぶ。shell を経由しない。
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function runGh(args, { execFileImpl = execFileSync } = {}) {
  return execFileImpl('gh', args, { encoding: 'utf8' });
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

/** JST 曜日インデックス（0=日〜6=土）を返す。 */
export function jstWeekdayIndex(date = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date);
  return JST_WEEKDAY_INDEX[label];
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
// 破損した等）を無条件で信用しない。特に createdCount の上限チェックは、
// 壊れた/偽装された値が cap を最初から超過扱いにして全 alert を抑止する
// fail-closed 側の穴を防ぐ。
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
  writeFileSync(statePath, JSON.stringify(next), 'utf8');
  return { allowed: true };
}
