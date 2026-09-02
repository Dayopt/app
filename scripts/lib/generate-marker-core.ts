/**
 * `[internal-review]` marker 本文の pure な組み立てロジック。
 *
 * gh 実行・stdout 出力などの副作用は generate-marker.ts（CLI 側）に置き、
 * ここでは文字列組み立てと入力検証だけを行う。branch:finish の
 * gate（scripts/tasks/finish-branch.sh）が要求する marker 契約（5 点チェック +
 * zerolike 判定）を、生成側で機械的に満たすのが目的。
 */

const HEAD_SHA_RE = /^[0-9a-f]{40}$/;

export interface MarkerInput {
  /** `gh pr view --json headRefOid` で実測した head SHA（40 桁 hex）。手入力は想定しない。 */
  headSha: string;
  /** 実行した subagent 名。カンマ区切り、または `docs-only`。空文字列は不可。 */
  agent: string;
  /**
   * `deriveRoleFindingsField` が組み立てた role 別 findings 内訳（例:
   * `risk-reviewer=2(P1 1/P2 1), behavior-verifier=0`）。`--review-result` 経由で
   * reviewer を実際に起動した場合のみ渡す。未指定または空文字列なら `findings:` 行
   * 自体を省略する（`--agent` 直接指定・docs-only の場合は role 別内訳が無いため）。
   */
  roleFindingsField?: string;
  p1Count: number;
  /** P1 が 0 件の時は付けられない（zerolike 書式を崩すため）。 */
  p1Note?: string;
  p2Count: number;
  /** P2 が 0 件の時は付けられない（zerolike 書式を崩すため）。 */
  p2Note?: string;
  /** P3 は zerolike 判定の対象外のため自由記述。空なら行ごと省略する。 */
  p3?: string;
  /**
   * `derivePartialCoverageRoles` が抽出した role 名（#2417）。1 件でもあれば
   * `partialCoverageNote` が必須（下記 `buildMarkerBody` が強制する）。
   */
  partialCoverageRoles?: string[];
  /** partialCoverageRoles が 1 件でもある時に必須の、Main による明示的な扱いの記述。 */
  partialCoverageNote?: string;
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

/**
 * `pr-cross-review` skill が呼ぶ read-only reviewer の role 名。
 * `--agent` への直接手書きを拒否する時（`assertAgentFieldHasNoKnownReviewerRole`）と、
 * `--review-result` の role 集合検証の両方で使う唯一の定義。
 */
const KNOWN_REVIEWER_ROLES = new Set(['risk-reviewer', 'behavior-verifier', 'architecture-guard']);

/**
 * `--agent` へ既知の reviewer role 名を手書きすることを拒否する（PR #2354 クロスレビュー P2）。
 *
 * `--review-result` を新設した本 PR 自身が「1 role が結果を返していないのに
 * `--agent` へ手で書いて gate を通す」抜け道を塞ぐと宣言していたが、`--agent`
 * 経路そのものは temporarily 生きたままで、その抜け道がまだ開いていた。
 * reviewer を実際に起動した場合は必ず `--review-result` を使うことを強制する。
 * `role(text-fallback)` のような注釈付き表記も、base 部分が既知 role と一致すれば
 * 同様に拒否する（`--agent` へ直接書く形で text-fallback を偽装させないため）。
 */
export function assertAgentFieldHasNoKnownReviewerRole(agent: string): void {
  const tokens = agent.split(',').map((t) => t.trim());
  const found = tokens.filter((t) => KNOWN_REVIEWER_ROLES.has(t.replace(/\(.*\)$/, '').trim()));
  if (found.length > 0) {
    throw new Error(
      `--agent に reviewer 名（${found.join(', ')}）を直接指定できません。reviewer を実際に起動した場合は --review-result <path> を使ってください（#2348）。`,
    );
  }
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
  /**
   * schema 検証済みの構造化出力本体。`result.coverage` は `derivePartialCoverageRoles`、
   * `result.findings` は `deriveRoleFindingsField` が読む（他フィールドは Main が
   * 直接読む一次情報のままにし、ここではパースしない）。`findings` の各要素は
   * `cross-review-workflow.js` の SCHEMA_CONTRACT が定義する `{severity, target,
   * scenario, recommendationToMain}` だが、ここでは `severity` だけを見る。
   */
  result?: { coverage?: string; findings?: Array<{ severity?: string }> } | null;
}

/**
 * role ごとの findings 内訳を `P1`/`P2` の 2 段にまとめるための「高 severity」定義。
 * `cross-review-workflow.js` の SCHEMA_CONTRACT（severity enum）と 1:1 対応する:
 *   - risk-reviewer: critical/high/medium/low → critical・high を P1 相当とする
 *   - behavior-verifier / architecture-guard: blocker/warning → blocker を P1 相当とする
 * この 2 段分類は `AGENTS.md` の P1/P2 定義そのものではなく、role 固有の severity
 * enum を marker の `findings:` 行で読みやすくするための表示用の近似である。
 */
const HIGH_SEVERITY_BY_ROLE: Record<string, ReadonlySet<string>> = {
  'risk-reviewer': new Set(['critical', 'high']),
  'behavior-verifier': new Set(['blocker']),
  'architecture-guard': new Set(['blocker']),
};

/**
 * `--review-result` の `result.findings`（schema 強制済みの findings 配列）から
 * marker の `findings:` 行の値を組み立てる。role 別の指摘数は marker 本文にしか
 * 現れない唯一の authoritative な数値であり、`scripts/tasks/trace.mjs` はこの行を
 * 最優先で読み、無ければ review/issue comment の役割名部分一致という粗い
 * ヒューリスティックへ fall back する（trace.mjs 側のコメント参照）。
 *
 * - `status: 'ok'`（schema 強制済み）: `result.findings` を件数化する。**fail-closed**:
 *   `findings` が配列でなければ「壊れた入力」として拒否する（`derivePartialCoverageRoles`
 *   と同じ理由 — Main が `result` を手で刈り込んだ JSON を書くと、この安全網が
 *   無ければ無音で誤情報を marker に刻んでしまう）
 * - `status: 'text-fallback'`: StructuredOutput を経ていないため件数を信用できない。
 *   `role(text-fallback)=不明` として明示し、trace.mjs 側で推定へ fall back させる
 * - それ以外の status（`empty`/`error`）は無視する（`deriveAgentFieldFromReviewResult`
 *   が同じ entries に対して先に呼ばれ、そちらで例外を投げている前提）
 */
export function deriveRoleFindingsField(entries: ReviewResultEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.status === 'text-fallback') {
      parts.push(`${entry.role}(text-fallback)=不明`);
      continue;
    }
    if (entry.status !== 'ok') {
      continue;
    }
    const findings = entry.result?.findings;
    if (!Array.isArray(findings)) {
      throw new Error(
        `role "${entry.role}" は status:"ok" なのに result.findings が配列ではありません（${JSON.stringify(
          entry.result,
        )}）。Workflow の agent() が返した結果を result ごとそのまま JSON に書き出したか確認してください。`,
      );
    }
    const count = findings.length;
    if (count === 0) {
      parts.push(`${entry.role}=0`);
      continue;
    }
    const highSeverities = HIGH_SEVERITY_BY_ROLE[entry.role] ?? new Set<string>();
    const high = findings.filter(
      (f) => typeof f?.severity === 'string' && highSeverities.has(f.severity),
    ).length;
    const low = count - high;
    parts.push(`${entry.role}=${count}(P1 ${high}/P2 ${low})`);
  }
  return parts.join(', ');
}

const VALID_COVERAGE_VALUES = new Set(['complete', 'partial']);

/**
 * `status: 'ok'` かつ `result.coverage === 'partial'`（budget 逼迫で観点を打ち切った
 * 自己申告、#2417）の role 名を抽出する。
 *
 * pacing discipline を緩めて早期の StructuredOutput 呼び出しを許可すると、
 * 「schema 上は正常だが浅いレビュー」が `status: 'ok'` のまま marker を素通り
 * しうる（fail-open）。`coverage` フィールドはこれを machine-readable にする
 * ためのもので、この関数はその自己申告を marker 生成の判断へ橋渡しする。
 *
 * **fail-closed**: schema は `coverage` を required にしているため、
 * `status: 'ok'` なのに `result` 自体が欠落・`coverage` が欠落・未知の値、の
 * いずれも「壊れた入力」として拒否する（黙って「partial ではない」扱いにしない）。
 * `--review-result` JSON は Main が Write tool で手書きするため、旧 doc の
 * 「role/status のみ見る」を信じて `result` を刈り込んだ JSON を書くと、この
 * チェックが無いと fail-open が無音で再開してしまう（PR #2424 クロスレビュー P2）。
 */
export function derivePartialCoverageRoles(entries: ReviewResultEntry[]): string[] {
  const okEntries = entries.filter((e) => e.status === 'ok');
  const invalid = okEntries.filter(
    (e) =>
      !e.result ||
      typeof e.result.coverage !== 'string' ||
      !VALID_COVERAGE_VALUES.has(e.result.coverage),
  );
  if (invalid.length > 0) {
    throw new Error(
      '以下の role は status:"ok" なのに result.coverage が欠落または不正です: ' +
        invalid.map((e) => `${e.role}(${JSON.stringify(e.result)})`).join(', ') +
        '。Workflow の agent() が返した結果を result ごとそのまま JSON に書き出したか確認してください' +
        '（role/status だけに刈り込むと fail-open の safeguard が機能しません）。',
    );
  }

  return okEntries.filter((e) => e.result?.coverage === 'partial').map((e) => e.role);
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

  const blankRole = entries.some((e) => !e.role || !e.role.trim());
  if (blankRole) {
    throw new Error('--review-result の JSON に role が空のエントリがあります。');
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

  const partialCoverageRoles = input.partialCoverageRoles ?? [];
  if (
    partialCoverageRoles.length > 0 &&
    !(input.partialCoverageNote && input.partialCoverageNote.trim())
  ) {
    throw new Error(
      `partial coverage を報告した role があります（${partialCoverageRoles.join(', ')}）。` +
        '早期切り上げの浅いレビューを黙って gate 通過させないため、`--partial-coverage-note` で ' +
        'Main の明示的な扱い（追加確認済み／許容する理由など）を記述してください（#2417）。',
    );
  }

  const p1Line = formatCountLine('P1', input.p1Count, input.p1Note);
  const p2Line = formatCountLine('P2', input.p2Count, input.p2Note);

  const lines = ['[internal-review]', `head: ${input.headSha}`, `agent: ${input.agent.trim()}`];

  if (input.roleFindingsField && input.roleFindingsField.trim()) {
    lines.push(`findings: ${input.roleFindingsField.trim()}`);
  }

  lines.push(`P1: ${p1Line}`, `P2: ${p2Line}`);

  if (partialCoverageRoles.length > 0) {
    lines.push(
      `partial coverage: ${partialCoverageRoles.join(', ')}（${input.partialCoverageNote!.trim()}）`,
    );
  }

  if (input.p3 && input.p3.trim()) {
    lines.push(`P3: ${input.p3.trim()}`);
  }

  return lines.join('\n');
}
