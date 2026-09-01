/**
 * `[codex-issue-review]` 証跡（#2530）の pure なロジック。
 *
 * gh 実行・stdout 出力などの副作用は CLI 側
 * （`scripts/tasks/generate-issue-review-marker.mjs` /
 * `scripts/tasks/issue-review-gate.mjs`）に置き、ここでは canonical 化・
 * fingerprint 計算・marker 組み立て・証跡検証だけを行う。
 *
 * **なぜ fingerprint が要るか**: PR の `[internal-review]` marker は head SHA で
 * 現在の diff へ束縛できるが、Issue には commit のような機械的な identity が無い。
 * Issue 本文は review 後にも編集できるため、「`[codex-issue-review]` コメントが
 * 存在する」だけでは「今の本文がレビューされた」証明にならない。そこで
 * canonical(title + body + review-relevant labels) の SHA-256 を marker へ焼き、
 * gate 側で再計算して突き合わせる（本文が変われば fingerprint が変わり、旧 review は
 * 自動的に stale になる）。
 *
 * **なぜ .mjs か**: `scripts/tasks/issue-review-gate.mjs` は
 * `scripts/tasks/finish-branch.sh` から素の `node` で起動される
 * （`protected-path-gate.mjs` と同じ経路）。tsx を挟まないため
 * `.ts` にはできない。
 */

import { createHash } from 'node:crypto';

export const ISSUE_REVIEW_MARKER = '[codex-issue-review]';

/**
 * Codex GitHub 連携 bot の login。GraphQL の `author.login` は
 * `chatgpt-codex-connector`、REST の `user.login` は `chatgpt-codex-connector[bot]`
 * と表記が割れる（2026-09-01 実測）。`scripts/tasks/finish-branch.sh` の
 * Codex review object gate と同じ値を使う（片方だけ変えると gate がズレる）。
 */
export const CODEX_BOT_LOGIN = 'chatgpt-codex-connector';

/**
 * login が Codex bot のものか判定する。`[bot]` サフィックスの有無を吸収する。
 * GitHub の user login には `[` を含められないため、この正規化で人間の login が
 * bot と誤認されることはない。
 * @param {string|undefined|null} login
 */
export function isCodexBotLogin(login) {
  return String(login ?? '').replace(/\[bot\]$/, '') === CODEX_BOT_LOGIN;
}

/** marker を投稿できる authorAssociation。この repo は public なので第三者を除外する。 */
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

/**
 * fingerprint に含める label。**`review:full` の有無だけ**を見る。
 *
 * 全 label を含めると `status:ready` → `status:in-progress`（dispatch 時に必ず
 * 起きる）だけで fingerprint が変わり、着手の瞬間に自分の review を stale に
 * してしまう。逆に label を一切見ないと「`review:full` を後付けした Issue が、
 * 付ける前の review を証跡として使える」穴が開く。必要十分はこの 1 つ。
 */
export const REVIEW_RELEVANT_LABEL = 'review:full';

/**
 * 改行コードと行末空白を正規化する。GitHub の web UI 編集は CRLF や
 * 行末空白を混ぜることがあり、内容が変わっていないのに fingerprint だけ
 * 変わる（= 無意味な re-review 要求）のを避ける。
 * @param {string} text
 */
function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}

/**
 * fingerprint の入力となる canonical 表現を組み立てる。
 * @param {{title?: string, body?: string, labels?: string[]}} issue
 * @returns {string}
 */
export function canonicalizeIssueForReview(issue) {
  const labels = Array.isArray(issue?.labels) ? issue.labels : [];
  const hasReviewFull = labels.some((l) => String(l).trim() === REVIEW_RELEVANT_LABEL);
  return [
    `title:${normalizeText(issue?.title)}`,
    `body:${normalizeText(issue?.body)}`,
    `labels:${hasReviewFull ? REVIEW_RELEVANT_LABEL : ''}`,
  ].join('\n');
}

/**
 * canonical 表現の SHA-256（64 桁 hex）。
 * @param {string} canonical
 */
export function computeIssueFingerprint(canonical) {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** issue オブジェクトから直接 fingerprint を得る shorthand。 */
export function computeIssueFingerprintFromIssue(issue) {
  return computeIssueFingerprint(canonicalizeIssueForReview(issue));
}

/**
 * P1/P2 の 1 行を組み立てる。0 件は gate の zerolike 判定
 * （`^(0|0件|0 件|なし|[Nn]one)$`）へ完全一致する「なし」固定にし、注釈を許さない
 * （`scripts/lib/generate-marker-core.ts` と同じ規律。注釈付き 0 件が gate を
 * 誤通過させた PR #2053 の再発防止）。
 * @param {'P1'|'P2'} label
 * @param {number} count
 * @param {string|undefined} note
 */
export function formatIssueReviewCountLine(label, count, note) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${label} の件数は 0 以上の整数で指定してください: ${count}`);
  }
  if (count === 0) {
    if (note && note.trim()) {
      throw new Error(
        `${label} が 0 件の時は注釈を付けられません（zerolike 書式を維持するため。補足は P3 へ）。`,
      );
    }
    return 'なし';
  }
  const base = `${count} 件`;
  return note && note.trim() ? `${base}（${note.trim()}）` : base;
}

/**
 * `[codex-issue-review]` marker 本文を組み立てる。
 *
 * `status` は入力ではなく導出する: P1/P2 が 0 件なら `pass`、非ゼロなら
 * `resolutionNote`（本文修正済み・反論根拠・別 issue 化のいずれか）がある時だけ
 * `pass`、無ければ `findings`（= gate は通らない）。「指摘が出たが対応した」を
 * 記録できる唯一の経路を明示的に残しつつ、無言の pass 化を防ぐ。
 *
 * @param {{
 *   issueNumber: number,
 *   fingerprint: string,
 *   reviewedCommentUrl: string,
 *   p1Count: number,
 *   p1Note?: string,
 *   p2Count: number,
 *   p2Note?: string,
 *   p3?: string,
 *   resolutionNote?: string,
 * }} input
 */
export function buildIssueReviewMarkerBody(input) {
  if (!Number.isInteger(input?.issueNumber) || input.issueNumber <= 0) {
    throw new Error(`issue 番号は正の整数で指定してください: ${input?.issueNumber}`);
  }
  if (!FINGERPRINT_RE.test(String(input?.fingerprint ?? ''))) {
    throw new Error(
      `fingerprint は 64 桁 hex（SHA-256）である必要があります: "${input?.fingerprint}"。` +
        '手書きせず generator に計算させてください。',
    );
  }
  if (!input?.reviewedCommentUrl || !String(input.reviewedCommentUrl).trim()) {
    throw new Error('reviewed-comment（Codex のレビューコメント URL）は必須です。');
  }

  const p1Line = formatIssueReviewCountLine('P1', input.p1Count, input.p1Note);
  const p2Line = formatIssueReviewCountLine('P2', input.p2Count, input.p2Note);

  const hasFindings = input.p1Count > 0 || input.p2Count > 0;
  const resolution = input.resolutionNote && input.resolutionNote.trim();
  const status = !hasFindings || resolution ? 'pass' : 'findings';

  const lines = [
    ISSUE_REVIEW_MARKER,
    `issue: #${input.issueNumber}`,
    `fingerprint: ${input.fingerprint}`,
    `reviewed-comment: ${String(input.reviewedCommentUrl).trim()}`,
    `status: ${status}`,
    `P1: ${p1Line}`,
    `P2: ${p2Line}`,
  ];

  if (resolution) {
    lines.push(`resolution: ${resolution}`);
  }
  if (input.p3 && String(input.p3).trim()) {
    lines.push(`P3: ${String(input.p3).trim()}`);
  }

  return lines.join('\n');
}

/** 本文先頭の空白と CR を落とす（引用行 `> …` は marker 判定で落ちる）。 */
function trimmedBody(comment) {
  return String(comment?.body ?? '')
    .replace(/\r/g, '')
    .replace(/^\s+/, '');
}

function matchLine(body, key) {
  const m = body.match(new RegExp(`^${key}:[ \\t]*(\\S.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

const ZEROLIKE_RE = /^(0|0件|0 件|なし|[Nn]one)$/;

/**
 * Issue に `[codex-issue-review]` marker が 1 件でも存在するか（内容の妥当性は問わない）。
 *
 * **`review:full` ラベルの後付け削除による fail-open を塞ぐために使う**（#2530 Issue
 * Review P2）。「レビューが停止した Issue からラベルを外して軽量経路で着手する」
 * 迂回を許すと、gate は「リスクの再分類」と「失敗したレビューの回避」を区別できない。
 * 一度でも review を始めた Issue は、current な pass 証跡が出るまで gate 対象に
 * 残す（ラベルを外しても降格しない）。
 *
 * @param {Array<{body?: string}>} comments
 */
export function hasAnyIssueReviewEvidence(comments) {
  return (Array.isArray(comments) ? comments : []).some((c) =>
    trimmedBody(c).startsWith(ISSUE_REVIEW_MARKER),
  );
}

/**
 * 「最新の marker」を 1 件だけ選ぶ。
 *
 * 複数の marker（findings 版と pass 版など）が同居した時に「どれか 1 件でも pass なら
 * 通す」設計だと、古い pass が新しい findings を上書きしてしまう（#2530 Issue
 * Review P2「複数の相反する current evidence」）。取得順への暗黙依存も避け、
 * `createdAt` の明示的な比較で最後の 1 件を選び、**その 1 件だけ**を判定対象にする。
 * createdAt が無い場合は配列末尾（GitHub の comments は昇順）を後勝ちとする。
 *
 * @param {Array<{createdAt?: string}>} markers
 */
function selectLatestMarker(markers) {
  return markers.reduce((latest, current) => {
    if (!latest) return current;
    const a = new Date(current.createdAt ?? 0).getTime();
    const b = new Date(latest.createdAt ?? 0).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return current;
    return a >= b ? current : latest;
  }, null);
}

/**
 * Issue のコメント一覧から証跡を検証する。
 *
 * 二層構造にしている理由:
 * - **Codex bot コメントの実在**（`CODEX_BOT_LOGIN`）が「レビューが実際に行われた」
 *   証明。member が書ける marker だけでは自己申告になる。
 * - **marker の fingerprint 一致**が「レビュー対象が今の Issue 内容だった」証明。
 *   bot コメントだけでは、その後に本文を書き換えた場合を検出できない。
 *
 * どちらか片方では通さない（fail closed）。
 *
 * **trust boundary の明示**: marker の P1/P2 件数と `resolution:` は Main の自己申告で
 * あり、gate は Codex の自然文 findings をパースしない（できない）。担保は
 * 「OWNER/MEMBER/COLLABORATOR しか投稿できないこと」＋「Codex 本体のコメントが
 * 同じ Issue に一次情報として残ること」の 2 つ。`[internal-review]` の `agent:` 行と
 * 同じ境界で、機械証明ではなく監査可能性のための記録として扱う。
 *
 * @param {{
 *   comments: Array<{authorAssociation?: string, author?: {login?: string}, body?: string, createdAt?: string}>,
 *   issueNumber: number,
 *   expectedFingerprint: string,
 * }} input
 * @returns {{ok: boolean, reason?: string, steps: Record<string, number>}}
 */
export function validateIssueReviewEvidence(input) {
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const issueNumber = input?.issueNumber;
  const expectedFingerprint = String(input?.expectedFingerprint ?? '');

  const botComments = comments.filter((c) => isCodexBotLogin(c?.author?.login));

  const step1 = comments.filter((c) => trimmedBody(c).startsWith(ISSUE_REVIEW_MARKER));
  const step2 = step1.filter((c) => TRUSTED_ASSOCIATIONS.has(String(c?.authorAssociation ?? '')));
  const step3 = step2.filter((c) => matchLine(trimmedBody(c), 'issue') === `#${issueNumber}`);
  const step4 = step3.filter(
    (c) => matchLine(trimmedBody(c), 'fingerprint') === expectedFingerprint,
  );

  // ここから先は **最新の 1 件だけ**を見る。複数 marker の OR 判定にすると、
  // 古い pass が新しい findings を打ち消してしまう。
  const latest = selectLatestMarker(step4);
  const latestBody = latest ? trimmedBody(latest) : '';
  const statusPass = latest && matchLine(latestBody, 'status') === 'pass';
  // P1/P2 が非ゼロを申告しているのに resolution: が無い marker は無効にする。
  // status 行だけを見ていると、非ゼロ申告のまま `status: pass` を手書きした
  // marker が通ってしまう（generator は導出するが、marker 自体は手書きできる）。
  const p1 = latest ? matchLine(latestBody, 'P1') : null;
  const p2 = latest ? matchLine(latestBody, 'P2') : null;
  const hasFindings = [p1, p2].some((v) => v !== null && !ZEROLIKE_RE.test(v));
  const findingsResolved = Boolean(!hasFindings || matchLine(latestBody, 'resolution'));

  const steps = {
    botComment: botComments.length,
    marker: step1.length,
    trustedAuthor: step2.length,
    issueMatch: step3.length,
    fingerprintMatch: step4.length,
    statusPass: statusPass ? 1 : 0,
    findingsResolved: statusPass && findingsResolved ? 1 : 0,
  };

  if (botComments.length === 0) {
    return {
      ok: false,
      steps,
      reason: `Codex（${CODEX_BOT_LOGIN}）のレビューコメントがありません。実装前レビューが未実施です。`,
    };
  }
  if (step1.length === 0) {
    return {
      ok: false,
      steps,
      reason: `本文が「${ISSUE_REVIEW_MARKER}」で始まるコメントがありません。`,
    };
  }
  if (step2.length === 0) {
    return {
      ok: false,
      steps,
      reason: 'marker コメントの投稿者が OWNER/MEMBER/COLLABORATOR ではありません。',
    };
  }
  if (step3.length === 0) {
    return {
      ok: false,
      steps,
      reason: `marker の \`issue:\` 行が #${issueNumber} と一致しません。`,
    };
  }
  if (step4.length === 0) {
    return {
      ok: false,
      steps,
      reason:
        `marker の fingerprint が現在の Issue 内容（${expectedFingerprint}）と一致しません。` +
        'レビュー後に title / body / review:full ラベルが変わっています（stale）。再レビューが必要です。',
    };
  }
  if (!statusPass) {
    return {
      ok: false,
      steps,
      reason: '最新の marker の `status:` が pass ではありません（古い pass では通しません）。',
    };
  }
  if (!findingsResolved) {
    return {
      ok: false,
      steps,
      reason: 'P1/P2 の指摘が非ゼロなのに `resolution:` 行がありません（対応・反論の根拠が必要）。',
    };
  }

  return { ok: true, steps };
}
