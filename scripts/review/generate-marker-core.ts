/**
 * `[internal-review]` marker 本文の pure な組み立てロジック。
 *
 * gh 実行・stdout 出力などの副作用は generate-marker.ts（CLI 側）に置き、
 * ここでは文字列組み立てと入力検証だけを行う。branch:finish の
 * gate（scripts/git/finish-branch.sh）が要求する marker 契約（5 点チェック +
 * zerolike 判定）を、生成側で機械的に満たすのが目的。
 */

const HEAD_SHA_RE = /^[0-9a-f]{40}$/;

export interface MarkerInput {
  /** `gh pr view --json headRefOid` で実測した head SHA（40 桁 hex）。手入力は想定しない。 */
  headSha: string;
  /** 実行した subagent 名。カンマ区切り、または `docs-only`。空文字列は不可。 */
  agent: string;
  p1Count: number;
  /** P1 が 0 件の時は付けられない（zerolike 書式を崩すため）。 */
  p1Note?: string;
  p2Count: number;
  /** P2 が 0 件の時は付けられない（zerolike 書式を崩すため）。 */
  p2Note?: string;
  /** P3 は zerolike 判定の対象外のため自由記述。空なら行ごと省略する。 */
  p3?: string;
}

/**
 * P1/P2 の 1 行を組み立てる。0 件は finish-branch.sh の zerolike 正規表現
 * `^(0|0件|0 件|なし|[Nn]one)$` に完全一致する「なし」固定にし、注釈を許さない
 * （`P1: なし（注釈…）` のような書式が gate を誤って非ゼロ判定させた実事故の再発防止）。
 */
function formatCountLine(label: 'P1' | 'P2', count: number, note: string | undefined): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${label}Count は 0 以上の整数で指定してください: ${count}`);
  }
  if (count === 0) {
    if (note && note.trim()) {
      throw new Error(
        `${label} が 0 件の時は注釈を付けられません（zerolike 書式を維持するため。理由や補足は P3 か経緯欄へ）。`,
      );
    }
    return 'なし';
  }
  const base = `${count} 件`;
  return note && note.trim() ? `${base}（${note.trim()}）` : base;
}

/** `pr-cross-review` skill が Workflow 経由で reviewer を起動した結果、1 role ぶんのエントリ。 */
export interface ReviewResultEntry {
  role: string;
  /**
   * `ok` = schema 検証済みの構造化出力を得た。`empty` = agent() が null を返した
   * （書き出し停止・turn 枯渇など）。`error` = 呼び出し自体が例外を投げた。
   * `text-fallback` = Workflow 経路を諦め、Agent tool 経由の旧 text contract で
   * 代替した（Main が明示的に選んだ場合のみこの値にする）。
   */
  status: 'ok' | 'empty' | 'error' | 'text-fallback';
}

/**
 * Workflow が返した `{role, status, result}[]` から `agent:` フィールドの値を導出する。
 *
 * `ok` / `text-fallback` 以外が 1 件でもあれば marker 生成そのものを拒否する
 * （#2348: 1 role が結果を返さなくても Main が `--agent` へ手で書けば gate を
 * 素通りしていた穴を、値の手入力自体を無くすことで塞ぐ）。`text-fallback` は
 * `role(text-fallback)` として明記し、schema 強制を通った marker と区別できる
 * ようにする（効果測定を汚染しないため）。
 */
export function deriveAgentFieldFromReviewResult(entries: ReviewResultEntry[]): string {
  if (entries.length === 0) {
    throw new Error('--review-result の JSON が空です。最低 1 件の reviewer 結果が必要です。');
  }

  const unresolved = entries.filter((e) => e.status !== 'ok' && e.status !== 'text-fallback');
  if (unresolved.length > 0) {
    throw new Error(
      '以下の reviewer が有効な結果を返していません: ' +
        unresolved.map((e) => `${e.role}(${e.status})`).join(', ') +
        '。marker を生成せず、再実行するか text-fallback を明示してから再実行してください。',
    );
  }

  return entries
    .map((e) => (e.status === 'text-fallback' ? `${e.role}(text-fallback)` : e.role))
    .join(', ');
}

export function buildMarkerBody(input: MarkerInput): string {
  if (!HEAD_SHA_RE.test(input.headSha)) {
    throw new Error(`head SHA は 40 桁 hex を実測して渡してください: "${input.headSha}"`);
  }
  if (!input.agent || !input.agent.trim()) {
    throw new Error('agent は必須です（実行した subagent 名、または docs-only）。');
  }

  const p1Line = formatCountLine('P1', input.p1Count, input.p1Note);
  const p2Line = formatCountLine('P2', input.p2Count, input.p2Note);

  const lines = [
    '[internal-review]',
    `head: ${input.headSha}`,
    `agent: ${input.agent.trim()}`,
    `P1: ${p1Line}`,
    `P2: ${p2Line}`,
  ];

  if (input.p3 && input.p3.trim()) {
    lines.push(`P3: ${input.p3.trim()}`);
  }

  return lines.join('\n');
}
