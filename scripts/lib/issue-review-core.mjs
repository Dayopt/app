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
 * **`issue:` 行がこの issue を指す marker だけを数える。** marker の貼り間違い
 * （別 issue 宛ての marker を誤ってこの issue へ投稿した、引用として貼られた）で
 * 無関係な issue が恒久的に gate へ捕まり、削除以外に復旧手段が無くなる状態を
 * 作らないため（`[internal-review]` の汚染 marker が PR を塞ぎ続けた PR #2053 と
 * 同型の事故クラス）。正当な証跡は必ず正しい番号を持つので、この絞り込みで
 * 迂回防止は弱くならない。
 *
 * @param {Array<{body?: string}>} comments
 * @param {number} issueNumber
 */
export function hasAnyIssueReviewEvidence(comments, issueNumber) {
  return (Array.isArray(comments) ? comments : []).some((c) => {
    const body = trimmedBody(c);
    return body.startsWith(ISSUE_REVIEW_MARKER) && matchLine(body, 'issue') === `#${issueNumber}`;
  });
}

/**
 * `review:full` ラベルが**過去に剥がされた**履歴があるか。
 *
 * 「レビューが止まった Issue からラベルを外して軽量経路で着手する」迂回は、
 * marker が出る前（Codex が P1 を返した直後）に起きうる。marker の有無だけを見ると
 * その窓を取りこぼすため、ラベル削除イベント自体を降格の拒否条件にする
 * （push 前反証レビュー P2）。**「Codex コメントがあれば gate 対象」にはしない** —
 * それだと `review:full` と無関係な issue で誰かが一度 Codex を呼んだだけで
 * 恒久的に gate へ捕まり、通常の作業が止まる。
 *
 * @param {Array<{label?: {name?: string}}>} unlabeledEvents
 */
export function wasReviewFullLabelRemoved(unlabeledEvents) {
  return (Array.isArray(unlabeledEvents) ? unlabeledEvents : []).some(
    (e) => String(e?.label?.name ?? '') === REVIEW_RELEVANT_LABEL,
  );
}

/**
 * 「最新の marker」を 1 件だけ選ぶ。
 *
 * 複数の marker（findings 版と pass 版など）が同居した時に「どれか 1 件でも pass なら
 * 通す」設計だと、古い pass が新しい findings を上書きしてしまう（#2530 Issue
 * Review P2「複数の相反する current evidence」）。取得順への暗黙依存も避け、
 * `createdAt` の明示的な比較で最後の 1 件を選び、**その 1 件だけ**を判定対象にする。
 * `createdAt` 欠落は epoch 扱いなので、日付を持つ marker が常に勝つ（呼び出し側は
 * 必ず `createdAt` を取得する契約）。
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
 * 三層構造にしている理由:
 * - **Codex bot コメントの実在**（`CODEX_BOT_LOGIN`）が「レビューが実際に行われた」
 *   証明。member が書ける marker だけでは自己申告になる。
 * - **marker の fingerprint 一致**が「marker が現在の Issue 内容から作られた」証明。
 *   古い本文に対する marker はここで stale になる。
 * - **marker が指す Codex コメントが、Issue の最終更新より後である**ことが
 *   「今の内容がレビューされた」証明。fingerprint 一致だけでは「レビュー後に本文を
 *   書き換え、その本文で marker を作り直す」順序の逆転を検出できない
 *   （#2529/#2530 の push 前反証レビュー P2）。generator 側にも同じ検査があるが、
 *   marker は手書きできるため gate 側で必ず再検査する。
 *
 * どれか 1 つでも欠ければ通さない（fail closed）。
 *
 * **trust boundary の明示**: marker の P1/P2 件数と `resolution:` は Main の自己申告で
 * あり、gate は Codex の自然文 findings をパースしない（できない）。担保は
 * 「OWNER/MEMBER/COLLABORATOR しか投稿できないこと」＋「Codex 本体のコメントが
 * 同じ Issue に一次情報として残ること」の 2 つ。`[internal-review]` の `agent:` 行と
 * 同じ境界で、機械証明ではなく監査可能性のための記録として扱う。
 *
 * @param {{
 *   comments: Array<{authorAssociation?: string, author?: {login?: string}, body?: string, createdAt?: string, url?: string}>,
 *   issueNumber: number,
 *   expectedFingerprint: string,
 *   contentChangedAt?: string | null,
 * }} input
 * @returns {{ok: boolean, reason?: string, steps: Record<string, number>}}
 */
export function validateIssueReviewEvidence(input) {
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const issueNumber = input?.issueNumber;
  const expectedFingerprint = String(input?.expectedFingerprint ?? '');
  const contentChangedAt = input?.contentChangedAt ?? null;

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

  // marker が指す Codex コメントを実在確認し、それが Issue の最終更新より後かを見る。
  // これで `reviewed-comment:` 行が飾りではなく判定に効く（URL が実在の bot コメントを
  // 指していなければ通らない）。
  const reviewedUrl = latest ? matchLine(latestBody, 'reviewed-comment') : null;
  const reviewedComment = reviewedUrl
    ? botComments.find((c) => String(c?.url ?? '') === reviewedUrl)
    : null;
  const changedAtMs = contentChangedAt ? new Date(contentChangedAt).getTime() : null;
  const reviewedAtMs = reviewedComment ? new Date(reviewedComment.createdAt ?? 0).getTime() : null;
  // 時刻を解釈できない場合は「順序不明」として通さない（fail closed）。
  const reviewIsAfterEdit =
    reviewedComment !== null &&
    reviewedComment !== undefined &&
    (changedAtMs === null ||
      (!Number.isNaN(changedAtMs) &&
        reviewedAtMs !== null &&
        !Number.isNaN(reviewedAtMs) &&
        reviewedAtMs >= changedAtMs));

  // P1/P2 が非ゼロを申告しているのに resolution: が無い marker は無効にする。
  // status 行だけを見ていると、非ゼロ申告のまま `status: pass` を手書きした
  // marker が通ってしまう（generator は導出するが、marker 自体は手書きできる）。
  // **行そのものの欠落も無効にする** — 欠落を 0 件扱いにすると、P1/P2 行を書かない
  // だけで「なし」と書くより簡単に非ゼロ申告を回避できてしまう（push 前反証レビュー P2）。
  const p1 = latest ? matchLine(latestBody, 'P1') : null;
  const p2 = latest ? matchLine(latestBody, 'P2') : null;
  const countLinesPresent = p1 !== null && p2 !== null;
  const hasFindings = [p1, p2].some((v) => v !== null && !ZEROLIKE_RE.test(v));
  const findingsResolved =
    countLinesPresent && Boolean(!hasFindings || matchLine(latestBody, 'resolution'));

  const steps = {
    botComment: botComments.length,
    marker: step1.length,
    trustedAuthor: step2.length,
    issueMatch: step3.length,
    fingerprintMatch: step4.length,
    statusPass: statusPass ? 1 : 0,
    reviewedAfterEdit: statusPass && reviewIsAfterEdit ? 1 : 0,
    findingsResolved: statusPass && reviewIsAfterEdit && findingsResolved ? 1 : 0,
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
  if (!reviewIsAfterEdit) {
    if (!reviewedComment) {
      return {
        ok: false,
        steps,
        reason: `marker の \`reviewed-comment:\` が Codex（${CODEX_BOT_LOGIN}）の実在するコメントを指していません。`,
      };
    }
    return {
      ok: false,
      steps,
      reason:
        `marker が指す Codex レビュー（${reviewedComment.createdAt}）より後に Issue が更新されています（${contentChangedAt}）。` +
        '現在の内容はまだレビューされていません。再レビューが必要です。',
    };
  }
  if (!countLinesPresent) {
    return {
      ok: false,
      steps,
      reason: 'marker に `P1:` / `P2:` 行がありません（欠落を 0 件として扱いません）。',
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
