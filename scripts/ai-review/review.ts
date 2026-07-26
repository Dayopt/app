#!/usr/bin/env node

/**
 * ai-review — 危険クラスの PR だけを外部モデルにレビューさせる pipeline。
 *
 * 存在理由: Dayopt のコードは実装もテストも内部レビューも同一モデル系統（Claude）が
 * 書くため、系統固有の盲点は内部でいくら重ねても検出できない。決定論的ゲート
 * （typecheck / lint / 2000+ unit / RLS integration / E2E）と Sentry + dogfooding が
 * 拾えるのは「落ちる・赤くなる・目に見える」失敗までで、RLS の穴や課金の二重計上の
 * ような「沈黙する失敗」には届かない。そこだけを、非 Anthropic 系モデルに見せる。
 *
 * 契約は scripts/ai-review/prompt.md（レビュー内容の正本）。本ファイルは配管だけを持つ。
 *
 * 判定:
 *   P0 あり     → exit 1（check fail → branch:finish の既存マージゲートが止める）
 *   P1 のみ     → exit 0 + PR に sticky comment
 *   findings 0  → exit 0（無言）
 *   API 障害等  → exit 0 + notice（インフラ障害では fail-open。所見では fail-closed）
 *
 * Usage:
 *   pnpm exec tsx scripts/ai-review/review.ts --dry-run
 *   pnpm exec tsx scripts/ai-review/review.ts --base <sha> --head <sha>
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 既定モデル。Gemini 3 Pro を非 Anthropic 系の第三の目として使う（Copilot が OpenAI 系
 * なので、Google 系を選ぶと Anthropic が書き OpenAI と Google が見る三系統になる）。
 * model id は provider 側で改称されうるため env で差し替えられる。404 の時は
 * 利用可能な id を notice に出す。
 */
export const DEFAULT_MODEL = 'gemini-3-pro-preview';

/** prompt に載せる diff の上限。超過分は落とし、落とした事実を prompt に明記する。 */
export const MAX_DIFF_BYTES = 180_000;
/** rules 添付 1 件あたりの上限。 */
export const MAX_ATTACHMENT_BYTES = 24_000;
/** sticky comment の同定に使う marker。人間のコメントと衝突しない形にする。 */
export const COMMENT_MARKER = '<!-- dayopt:ai-review -->';

export type Severity = 'P0' | 'P1';

export interface Finding {
  severity: Severity;
  title: string;
  file: string;
  line?: number;
  failureScenario: string;
  evidence: string;
}

export interface ReviewResult {
  summary: string;
  findings: Finding[];
}

/**
 * レビュー対象にする危険クラス path。
 * .github/workflows/ai-review.yml の paths filter と対応させる（contract test で固定）。
 */
export const DANGEROUS_PATH_PATTERNS: readonly RegExp[] = [
  /^supabase\/migrations\//,
  /^supabase\/functions\//,
  /^apps\/product\/src\/features\/[^/]+\/server\//,
  /^apps\/product\/src\/features\/auth\//,
  /^apps\/product\/src\/lib\/(database|supabase|trpc)\//,
  /^apps\/product\/src\/app\/api\//,
];

export interface RuleAttachment {
  /** repo-relative path */
  path: string;
  /** この rules を添付する条件 */
  when: RegExp;
  /** 添付時の見出し */
  label: string;
}

/**
 * diff の内容に応じて添付する repo 規約。外部モデルは Dayopt の規約を知らないので、
 * 「知らないから指摘できない / 知らないから的外れ」を両方潰すために渡す。
 */
export const RULE_ATTACHMENTS: readonly RuleAttachment[] = [
  {
    path: '.claude/skills/security/SKILL.md',
    when: /^(supabase\/|apps\/product\/src\/(features\/[^/]+\/server\/|features\/auth\/|lib\/(trpc|supabase|database)\/|app\/api\/))/,
    label: 'Dayopt security 規約',
  },
  {
    path: '.claude/rules/temporal-constraints.md',
    when: /^apps\/product\/src\/(features\/(timeblock|review|calendar)\/|lib\/(date|time))/,
    label: 'Dayopt 時刻・過去ブロック編集制約',
  },
  {
    path: '.claude/rules/feature-boundaries.md',
    when: /^apps\/product\/src\/features\//,
    label: 'Dayopt feature 境界',
  },
];

/** migration を触る PR にだけ渡す、現在有効な RLS / GRANT の snapshot。 */
export const RLS_SNAPSHOT_PATH = 'docs/engineering/data/db/rls-snapshot.md';

export function isDangerousPath(file: string): boolean {
  return DANGEROUS_PATH_PATTERNS.some((pattern) => pattern.test(file));
}

/** 添付すべき rules を、変更ファイル一覧から決める。 */
export function selectRuleAttachments(changedFiles: readonly string[]): RuleAttachment[] {
  return RULE_ATTACHMENTS.filter((attachment) =>
    changedFiles.some((file) => attachment.when.test(file)),
  );
}

/**
 * UTF-8 のバイト数で切り詰める。`String.prototype.slice` は UTF-16 code unit 単位なので、
 * バイト予算をそのまま渡すと日本語では意図より多く落ちる。マルチバイト文字の途中で
 * 切って U+FFFD を作らないよう、continuation byte（10xxxxxx）の手前まで戻す。
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= maxBytes) return text;
  let end = Math.max(0, maxBytes);
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString('utf8');
}

function clamp(text: string, maxBytes: number, note: string): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  return `${truncateToBytes(text, maxBytes)}\n\n…（${note}）`;
}

/**
 * snapshot が知っている table 名（`### <table>` 見出し）を返す。diff 側から SQL を
 * parse すると表記ゆれで拾い漏れるので、「snapshot にある名前が diff に出るか」の
 * 向きで突き合わせる。
 */
export function listSnapshotTables(snapshot: string): string[] {
  return [...snapshot.matchAll(/^### ([a-z_][a-z0-9_]*)\s*$/gim)].map((match) =>
    match[1].toLowerCase(),
  );
}

/**
 * RLS snapshot 全文は 45KB あり毎回渡すと無駄なので、diff が触る table の情報だけを
 * 組み立てる。1 件も一致しない時は先頭（凡例・全体方針）を渡す。
 *
 * **section 単位ではなく table 単位で組む。** snapshot は
 * `## RLS 有効状態` / `## ポリシー一覧（table 別）`（下に `### <table>`）/ `## GRANT 一覧`
 * の 3 カテゴリに、同じ table の情報が分散している。category 単位で拾うと
 * (a) 見出しの汎用語（`public` など）で無関係なカテゴリが丸ごと入り、
 * (b) 24KB の clamp で肝心の行が落ちる。実測では GRANT 一覧の該当行が 25.7KB 目にあり
 * 上限の外だった。table 単位で必要な行だけ集めれば数 KB に収まり、この問題が消える。
 */
export function extractRlsSections(snapshot: string, diff: string): string {
  const haystack = diff.toLowerCase();
  const touched = listSnapshotTables(snapshot).filter((table) => haystack.includes(table));

  if (touched.length === 0) {
    return clamp(
      snapshot.split(/\n(?=#{2,3} )/)[0] ?? '',
      MAX_ATTACHMENT_BYTES,
      '以降は該当 table なしのため省略',
    );
  }

  const lines = snapshot.split('\n');
  const parts: string[] = [];

  for (const table of touched) {
    // policy: `### <table>` から次の見出しまで
    const start = lines.findIndex((line) => line.trim().toLowerCase() === `### ${table}`);
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && !/^#{2,3} /.test(lines[end])) end += 1;
      parts.push(lines.slice(start, end).join('\n').trimEnd());
    }

    // RLS 有効状態: `| <table> | ✅ | — |` の行
    const status = lines.find((line) =>
      new RegExp(`^\\|\\s*${table}\\s*\\|`, 'i').test(line.trim()),
    );
    if (status) parts.push(`#### ${table} の RLS 有効状態\n\n${status.trim()}`);

    // GRANT: `public.<table>` と `public.<table>.<column>` の行。
    // `public.<table>_other` を拾わないよう、直後が識別子文字でないことを要求する。
    const grants = lines.filter((line) =>
      new RegExp(`public\\.${table}(?![a-z0-9_])`, 'i').test(line),
    );
    if (grants.length > 0) {
      parts.push(`#### ${table} の GRANT\n\n${grants.map((line) => line.trim()).join('\n')}`);
    }
  }

  return clamp(
    parts.join('\n\n'),
    MAX_ATTACHMENT_BYTES,
    'RLS snapshot が長いため以降を省略。必要なら該当 migration を根拠にする',
  );
}

export interface PromptInput {
  contract: string;
  diff: string;
  changedFiles: readonly string[];
  attachments: readonly { label: string; body: string }[];
  truncated: boolean;
  /** 危険クラスのうち diff 全量を載せられなかったファイル。 */
  incompleteDangerous?: readonly string[];
}

export function buildPrompt(input: PromptInput): string {
  const parts = [input.contract, '\n---\n\n## 参考: この PR に関係する Dayopt の規約\n'];

  if (input.attachments.length === 0) {
    parts.push('（添付なし）\n');
  }
  for (const attachment of input.attachments) {
    parts.push(`### ${attachment.label}\n\n${attachment.body}\n`);
  }

  parts.push('\n---\n\n## 変更されたファイル\n');
  parts.push(
    input.changedFiles
      .map((file) => `- ${file}${isDangerousPath(file) ? ' ← 危険クラス' : ''}`)
      .join('\n'),
  );

  if (input.truncated) {
    parts.push(
      '\n\n**注意**: diff が長いため一部を省略しています。省略部分については推測で指摘しないでください。',
    );
  }

  const incomplete = input.incompleteDangerous ?? [];
  if (incomplete.length > 0) {
    parts.push(
      '\n\n**重要**: 次の危険クラスファイルは diff の先頭部分しか含まれていません。',
      '見えている範囲だけで判断し、見えていない範囲を推測で指摘しないでください:\n',
      incomplete.map((file) => `- ${file}`).join('\n'),
    );
  }

  parts.push('\n\n---\n\n## Diff\n\n```diff\n');
  parts.push(input.diff);
  parts.push('\n```\n');

  return parts.join('');
}

/** Gemini structured output 用の schema。 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['P0', 'P1'] },
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          failureScenario: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['severity', 'title', 'file', 'failureScenario', 'evidence'],
      },
    },
  },
  required: ['summary', 'findings'],
} as const;

/**
 * モデル応答を検証する。shape が壊れている応答を「指摘なし」と読み替えると、
 * 黙って gate が無効化されるため、パースできない時は throw して infra 障害扱いにする。
 */
export function parseReviewResponse(text: string): ReviewResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`モデル応答が JSON ではない: ${text.slice(0, 200)}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('モデル応答が object ではない');
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.findings)) {
    throw new Error('モデル応答に findings 配列がない');
  }

  const findings = record.findings.map((item, index): Finding => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`findings[${index}] が object ではない`);
    }
    const finding = item as Record<string, unknown>;
    const severity = finding.severity;
    if (severity !== 'P0' && severity !== 'P1') {
      throw new Error(`findings[${index}].severity が不正: ${String(severity)}`);
    }
    for (const key of ['title', 'file', 'failureScenario', 'evidence'] as const) {
      if (typeof finding[key] !== 'string' || finding[key] === '') {
        throw new Error(`findings[${index}].${key} が空`);
      }
    }
    return {
      severity,
      title: finding.title as string,
      file: finding.file as string,
      line: typeof finding.line === 'number' ? finding.line : undefined,
      failureScenario: finding.failureScenario as string,
      evidence: finding.evidence as string,
    };
  });

  return {
    summary: typeof record.summary === 'string' ? record.summary : '',
    findings,
  };
}

export function hasBlockingFinding(result: ReviewResult): boolean {
  return result.findings.some((finding) => finding.severity === 'P0');
}

export function renderComment(
  result: ReviewResult,
  meta: { model: string; sha: string; incompleteDangerous?: readonly string[] },
): string {
  const lines = [COMMENT_MARKER, '## 🔍 ai-review', ''];
  lines.push(result.summary || '（要約なし）', '');

  const incomplete = meta.incompleteDangerous ?? [];
  if (incomplete.length > 0) {
    lines.push(
      `**危険クラスの ${incomplete.length} ファイルを最後までレビューできていないため、この check は fail しています。**`,
      'diff が予算（180KB）を超えており、次のファイルは先頭部分しか見ていません。指摘が無いことは安全の根拠になりません:',
      '',
      ...incomplete.map((file) => `- \`${file}\``),
      '',
      'PR を分割するか、`MAX_DIFF_BYTES` の引き上げを検討してください。',
      '',
    );
  }

  const blocking = result.findings.filter((finding) => finding.severity === 'P0');
  if (blocking.length > 0) {
    lines.push(
      `**P0 が ${blocking.length} 件あるため、この check は fail しています。**`,
      '誤検出だと判断した場合は、根拠をこの PR に書いた上で `ai-review` の必須設定を外すか、指摘を解消してください。',
      '',
    );
  }

  for (const finding of result.findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(`### ${finding.severity} — ${finding.title}`, '', `**場所**: \`${location}\``, '');
    lines.push(`**起きること**: ${finding.failureScenario}`, '');
    lines.push(`**根拠**: ${finding.evidence}`, '');
  }

  lines.push(
    '---',
    `_${meta.model} による自動レビュー（危険クラス path のみ実行 / commit \`${meta.sha.slice(0, 7)}\`）。`,
    `契約は \`scripts/ai-review/prompt.md\`。style・設計の好みは対象外です。_`,
  );

  return lines.join('\n');
}

// ─── 以下、副作用を持つ配管 ────────────────────────────────────────────

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function collectChangedFiles(base: string, head: string): string[] {
  return git(['diff', '--name-only', `${base}...${head}`])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * 危険クラスのファイルを **1 ファイルずつ** 予算配分して載せる。
 *
 * 以前は危険クラスをまとめて 1 本の diff にして上限で切っていたため、先頭の巨大な
 * migration 1 つが予算を食い尽くすと、後続の auth / RLS / server の変更がモデルに
 * 一切届かないまま「指摘なし」で check が green になりえた。安全ゲートとしては
 * 見落としが可視化されない方が危険なので、
 *
 * 1. 危険クラスの各ファイルに最低限の取り分を保証する（小さいファイルから確定させ、
 *    余った予算を大きいファイルへ回す water-filling）
 * 2. それでも全量を載せられなかったファイルを `incompleteDangerous` として返す
 *
 * の 2 点で「全ての危険ファイルがレビュアーに届く」ことを担保する。呼び出し側は
 * `incompleteDangerous` が空でない場合、レビュー結果に関わらず check を fail させる。
 */
export function collectDiff(
  base: string,
  head: string,
  files: readonly string[],
  /** テスト用。既定は git 呼び出し（callGemini の fetchImpl と同じ DI 方針）。 */
  diffImpl?: (file: string) => string,
): { diff: string; truncated: boolean; incompleteDangerous: string[] } {
  const dangerous = files.filter(isDangerousPath);
  const rest = files.filter((file) => !isDangerousPath(file));

  const fileDiff =
    diffImpl ??
    ((file: string): string =>
      git(['diff', '--no-color', '--unified=3', `${base}...${head}`, '--', file]));

  const chunks: string[] = [];
  const incompleteDangerous: string[] = [];
  let truncated = false;

  // 危険クラスには予算の全額を使わせる。非危険より先に配るので押し出される心配はなく、
  // 逆に一定比率で予約すると「非危険が使わない余りがあるのに危険を切る」ことになる。
  // incompleteDangerous は merge を止めるので、不要に立てない方が重要。
  const dangerousBudget = MAX_DIFF_BYTES;

  const sized = dangerous
    .map((file) => ({ file, text: fileDiff(file) }))
    .map((entry) => ({ ...entry, bytes: Buffer.byteLength(entry.text, 'utf8') }))
    // 小さい順に確定させると、余剰が自動的に大きいファイルへ回る。
    .sort((a, b) => a.bytes - b.bytes);

  let remainingBudget = dangerousBudget;
  let remainingCount = sized.length;

  for (const entry of sized) {
    const share = Math.floor(remainingBudget / Math.max(1, remainingCount));
    if (entry.bytes <= share) {
      chunks.push(entry.text);
      remainingBudget -= entry.bytes;
    } else {
      // 取り分に収まらないファイルも、先頭 share バイトは必ずモデルに見せる。
      if (share > 0) chunks.push(truncateToBytes(entry.text, share));
      incompleteDangerous.push(entry.file);
      truncated = true;
      remainingBudget -= share;
    }
    remainingCount -= 1;
  }

  // 非危険ファイルは文脈でしかないので、余った分だけ載せて足りなければ落とす。
  let contextBudget = MAX_DIFF_BYTES - (dangerousBudget - remainingBudget);
  for (const file of rest) {
    const text = fileDiff(file);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes <= contextBudget) {
      chunks.push(text);
      contextBudget -= bytes;
    } else {
      truncated = true;
    }
  }

  return { diff: chunks.join('\n'), truncated, incompleteDangerous };
}

function loadAttachments(
  changedFiles: readonly string[],
  diff: string,
): { label: string; body: string }[] {
  const attachments = selectRuleAttachments(changedFiles).map((attachment) => ({
    label: attachment.label,
    body: clamp(
      readFileSync(resolve(ROOT, attachment.path), 'utf8'),
      MAX_ATTACHMENT_BYTES,
      '以降は省略',
    ),
  }));

  const touchesMigrations = changedFiles.some((file) => file.startsWith('supabase/migrations/'));
  const snapshotPath = resolve(ROOT, RLS_SNAPSHOT_PATH);
  if (touchesMigrations && existsSync(snapshotPath)) {
    attachments.push({
      label: '現在有効な RLS / GRANT（該当 table 抜粋）',
      body: extractRlsSections(readFileSync(snapshotPath, 'utf8'), diff),
    });
  }

  return attachments;
}

function notice(message: string): void {
  console.log(`::notice title=ai-review::${message}`);
}

function warn(message: string): void {
  console.log(`::warning title=ai-review::${message}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((done) => setTimeout(done, ms));
}

interface GeminiCallOptions {
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl?: typeof fetch;
}

export async function callGemini(options: GeminiCallOptions): Promise<ReviewResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
      body,
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || text === '') {
        throw new Error('モデル応答が空（safety block などの可能性）');
      }
      return parseReviewResponse(text);
    }

    lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
    if (response.status === 404) {
      throw new Error(
        `model "${options.model}" が見つからない。AI_REVIEW_MODEL で現行の model id を指定してください。${lastError}`,
      );
    }
    // 429 / 5xx だけ retry する。400 系は投げ直しても同じ。
    if (response.status !== 429 && response.status < 500) break;
    await sleep(2000 * (attempt + 1));
  }

  throw new Error(`Gemini API 呼び出しに失敗: ${lastError}`);
}

interface CommentContext {
  token: string;
  repository: string;
  prNumber: string;
  fetchImpl?: typeof fetch;
}

/**
 * @param updateOnly 既存の sticky comment があれば更新するが、無ければ新規作成しない。
 *   指摘ゼロの run で使う。この tool は「沈黙をデフォルト」にする契約なので、クリーンな
 *   PR に新しいコメントを生やさない。一方で、前の run が残した P0 コメントは
 *   古い SHA のまま「fail しています」と表示し続けるため、更新は必要になる。
 */
async function upsertStickyComment(
  context: CommentContext,
  body: string,
  updateOnly = false,
): Promise<void> {
  const doFetch = context.fetchImpl ?? fetch;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${context.token}`,
    'content-type': 'application/json',
  };
  const base = `https://api.github.com/repos/${context.repository}`;

  const listed = await doFetch(`${base}/issues/${context.prNumber}/comments?per_page=100`, {
    headers,
  });
  if (!listed.ok) throw new Error(`comment 一覧の取得に失敗: HTTP ${listed.status}`);
  const comments = (await listed.json()) as { id: number; body?: string }[];
  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  if (updateOnly && !existing) return;

  const target = existing
    ? `${base}/issues/comments/${existing.id}`
    : `${base}/issues/${context.prNumber}/comments`;
  const written = await doFetch(target, {
    method: existing ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!written.ok) throw new Error(`comment の投稿に失敗: HTTP ${written.status}`);
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  // workflow の env は未設定でも空文字で渡るため、?? ではなく || で既定へ落とす。
  const base = argValue(argv, '--base') || process.env.AI_REVIEW_BASE_SHA || 'origin/main';
  const head = argValue(argv, '--head') || process.env.AI_REVIEW_HEAD_SHA || 'HEAD';
  const model = process.env.AI_REVIEW_MODEL || DEFAULT_MODEL;

  // 手動 dispatch は「paths に当たらない PR を見せたい」ための入口なので、
  // 危険クラス判定で弾くと入口そのものが無意味な green になる。force で素通しする。
  const force = argv.includes('--force') || process.env.AI_REVIEW_FORCE === 'true';

  const changedFiles = collectChangedFiles(base, head);
  const dangerous = changedFiles.filter(isDangerousPath);
  if (dangerous.length === 0 && !force) {
    notice('危険クラスの変更がないためレビューをスキップしました。');
    return 0;
  }
  if (dangerous.length === 0) {
    notice(`force 指定のため、危険クラス外の ${changedFiles.length} ファイルをレビューします。`);
  }

  const { diff, truncated, incompleteDangerous } = collectDiff(base, head, changedFiles);
  if (diff.trim() === '') {
    notice('diff が空のためレビューをスキップしました。');
    return 0;
  }

  const contract = readFileSync(resolve(ROOT, 'scripts/ai-review/prompt.md'), 'utf8');
  const attachments = loadAttachments(changedFiles, diff);
  const prompt = buildPrompt({
    contract,
    diff,
    changedFiles,
    attachments,
    truncated,
    incompleteDangerous,
  });

  if (dryRun) {
    console.log(`model: ${model}`);
    console.log(`危険クラスのファイル: ${dangerous.length} / ${changedFiles.length}`);
    console.log(`添付 rules: ${attachments.map((item) => item.label).join(', ') || 'なし'}`);
    console.log(`prompt bytes: ${Buffer.byteLength(prompt, 'utf8')} (truncated: ${truncated})`);
    console.log(`全量を載せられなかった危険ファイル: ${incompleteDangerous.join(', ') || 'なし'}`);
    return 0;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // secret 未設定・fork PR ではレビューできないが、それは所見ではないので通す。
    warn('GEMINI_API_KEY が未設定のためレビューをスキップしました。');
    return 0;
  }

  let result: ReviewResult;
  try {
    result = await callGemini({ apiKey, model, prompt });
  } catch (error) {
    // インフラ障害で PR を止めない。止めるのは所見があった時だけ。
    warn(`レビューを実行できませんでした（PR はブロックしません）: ${String(error)}`);
    return 0;
  }

  const clean = result.findings.length === 0 && incompleteDangerous.length === 0;
  const body = renderComment(result, { model, sha: head, incompleteDangerous });
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.AI_REVIEW_PR_NUMBER;
  // クリーンな run でも、既存の sticky comment があれば更新する。前の run の P0 コメントが
  // 古い SHA のまま「fail しています」と残るのを防ぐ（新規作成はしない）。
  if (token && repository && prNumber) {
    try {
      await upsertStickyComment({ token, repository, prNumber }, body, clean);
    } catch (error) {
      // comment 失敗は gate の結果を変えない（gate は exit code 側）。
      warn(`comment を投稿できませんでした: ${String(error)}`);
    }
  }

  if (clean) {
    notice(`指摘なし（${dangerous.length} 件の危険クラスファイルを確認）。`);
    return 0;
  }

  console.log(body);

  // 危険クラスを最後まで見られていない run は、指摘の有無に関わらず通さない。
  // 「見ていないから指摘が無い」を green で表現すると偽の安心になる。
  if (incompleteDangerous.length > 0) {
    console.log(
      `::error title=ai-review::危険クラスの ${incompleteDangerous.length} ファイルを最後までレビューできていません（diff が ${MAX_DIFF_BYTES} bytes を超過）。`,
    );
    return 1;
  }

  if (hasBlockingFinding(result)) {
    console.log(`::error title=ai-review::P0 の指摘があります。PR の comment を確認してください。`);
    return 1;
  }
  notice(`P1 の指摘が ${result.findings.length} 件あります（マージはブロックしません）。`);
  return 0;
}

// import 時（test）には実行しない。直接起動された時だけ main を回す。
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      // 想定外の例外も fail-open にする（レビュー不能で PR を止めない）。
      warn(`予期しないエラーでレビューを中断しました: ${String(error)}`);
      process.exitCode = 0;
    });
}
