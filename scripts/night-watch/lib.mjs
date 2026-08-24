import { execFileSync } from 'node:child_process';

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
 * JST 暦日の前日を YYYY-MM-DD で返す。DST が無い JST では、JST 深夜 0 時の
 * 瞬間から 24h 引けば常に前日の JST 暦日になるため、UTC 演算で安全に求まる。
 */
export function jstYesterdayString(date = new Date()) {
  const todayJst = jstDateString(date);
  const jstMidnight = new Date(`${todayJst}T00:00:00+09:00`);
  jstMidnight.setUTCDate(jstMidnight.getUTCDate() - 1);
  return jstDateString(jstMidnight);
}

/** GitHub 検索クエリの日境界レンジ（`<qualifier>:<start>..<end>` の右辺）。 */
export function jstDayRange(dateStr) {
  return `${dateStr}T00:00:00+09:00..${dateStr}T23:59:59+09:00`;
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
