import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveProtectedPathGate } from '../ci/protected-path-gate.mjs';
import { REPO, runGh, runGhJson } from '../lib/gh.mjs';
import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * `pnpm ctx <N>` — L0 の「context pack」（AGENTS.md 委任・報告の作法 §L0、
 * routing skill §Worker recipe / L0）。
 *
 * Uber 原則⑤「AI が考える前に機械的に集められる文脈はここで終える」の Dayopt 写像。
 * AI セッションが issue / PR に着手する前に行う `gh issue view` / `gh pr list` /
 * `rg` / `Read` の 5〜10 手番を、gh の追加呼び出しなしで完結する 1 コマンドへ畳む。
 * 出力は 150 行以内の markdown、判断そのものはしない（判断材料の収集で止める）。
 *
 * 呼び出し予算: issue は最大 6 回、PR は最大 9 回の gh 呼び出しに収める
 * （search prs / graphql の 1 回 + 関連先の pr view を必要な分だけ）。
 *
 * deferred（次回以降）: `--comments` の bot 判定を login 完全一致以外（app slug）
 * まで広げる、`docs/decisions.md` 以外のログ（PR コメント内の decision 言及）の
 * 取り込み、related PR の再帰探索（epic の epic）、`protected-path-gate.mjs` が
 * spawn 経路に変わった場合の追随。
 */

const [REPO_OWNER, REPO_NAME] = REPO.split('/');

// --- 純関数群（test 対象） -------------------------------------------------

/** CLI 引数を解釈する。位置引数は issue/PR 番号 1 つのみ。 */
export function parseArgs(argv) {
  const options = {
    number: null,
    json: false,
    comments: 5,
    bodyLines: 60,
    allComments: false,
    post: false,
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--all-comments') {
      options.allComments = true;
    } else if (arg === '--post') {
      options.post = true;
    } else if (arg === '--comments') {
      options.comments = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--body-lines') {
      options.bodyLines = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(
        `未知の引数です: ${arg}（--json / --comments / --body-lines / --all-comments / --post のみ）`,
      );
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    throw new Error('issue/PR 番号を 1 つ指定してください: pnpm ctx <N>');
  }
  const number = Number(positionals[0]);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`不正な番号です: ${positionals[0]}`);
  }
  if (!Number.isInteger(options.comments) || options.comments < 0) {
    throw new Error('--comments は 0 以上の整数で指定してください');
  }
  if (!Number.isInteger(options.bodyLines) || options.bodyLines < 0) {
    throw new Error('--body-lines は 0 以上の整数で指定してください');
  }
  options.number = number;
  return options;
}

/** `gh api repos/.../issues/N` の応答が PR かどうか（`pull_request` キーの有無）。 */
export function isPullRequest(apiResponse) {
  return Boolean(apiResponse && apiResponse.pull_request);
}

/** body を先頭 maxLines 行へ切り詰める。0 行指定はそのまま全文を返す（切り詰めない）。 */
export function truncateBody(body, maxLines) {
  const text = body ?? '';
  if (!maxLines) return { text, truncated: false, remaining: 0 };
  const lines = text.split('\n');
  if (lines.length <= maxLines) return { text, truncated: false, remaining: 0 };
  return {
    text: lines.slice(0, maxLines).join('\n'),
    truncated: true,
    remaining: lines.length - maxLines,
  };
}

/** comment 本文を先頭 maxLines 行へ切り詰める（末尾の残り行数表示はしない、素の抜粋）。 */
export function truncateCommentBody(body, maxLines = 8) {
  const lines = (body ?? '').split('\n');
  return lines.slice(0, maxLines).join('\n');
}

/** login が `[bot]` で終わる（GitHub App コメント）かどうか。 */
export function isBotLogin(login) {
  return typeof login === 'string' && login.endsWith('[bot]');
}

/** text 中に「subtask」「tier」列を持つ markdown 表ヘッダ、または「分解表」の語があるか。 */
function hasBreakdownTable(text) {
  if (!text) return false;
  if (text.includes('分解表')) return true;
  return text.split('\n').some((line) => {
    if (!line.includes('|')) return false;
    const lower = line.toLowerCase();
    return lower.includes('subtask') && lower.includes('tier');
  });
}

/** text 中に DoD / 完了の定義 の言及があるか。 */
function hasDodMention(text) {
  return /(DoD|完了の定義)/.test(text ?? '');
}

/**
 * issue/PR の「判断の記録」を判定する（routing skill §目標状態、dispatch 手順 7）。
 * `comments` は REST `issues/N/comments` の生応答（`user.login` / `body`）。
 *
 * - DoD: bot 以外のコメント、または body に `DoD` / `完了の定義` の言及がある
 * - 分解表: コメントまたは body に `subtask`/`tier` 列を持つ表、または「分解表」の語がある
 * - brief: `CTX_MARKER` で始まるコメントがある（bot 判定は問わない ── ctx --post は
 *   通常ユーザー権限の gh 呼び出しで作られ bot login にならないため）
 */
export function detectJudgmentRecords(comments, body) {
  const list = Array.isArray(comments) ? comments : [];
  const bodyText = body ?? '';

  const dod =
    hasDodMention(bodyText) ||
    list.some((c) => !isBotLogin(c.user?.login) && hasDodMention(c.body ?? ''));

  const breakdown =
    hasBreakdownTable(bodyText) || list.some((c) => hasBreakdownTable(c.body ?? ''));

  const brief = list.some((c) => typeof c.body === 'string' && c.body.startsWith(CTX_MARKER));

  return { dod, breakdown, brief };
}

/** text 中の `## やること` セクションに、チェックリスト/箇条書き行が1つ以上あるか。 */
function hasYaruKotoChecklist(text) {
  if (!text) return false;
  const lines = text.split('\n');
  const startIdx = lines.findIndex((line) => /^#{1,6}\s*やること\s*$/.test(line.trim()));
  if (startIdx === -1) return false;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) break; // 次のセクションに入ったら終了
    if (/^\s*[-*]\s*(\[[ xX]\])?\s*\S/.test(line)) return true;
  }
  return false;
}

/**
 * issue body の「受け入れ条件 / 検証コマンド」を判定する（routing skill / dispatch §status:ready）。
 *
 * - acceptance: body に `受け入れ条件` または `完了条件` の語がある、または
 *   `## やること` セクションにチェックリスト/箇条書き行が1つ以上ある
 * - verification: `## 検証` セクション（または body 全体）に fenced code block、
 *   または `pnpm `/`gh `/`node `/`git `/`rg `/`npx ` で始まるインラインコード、
 *   または `expect(` の語がある
 */
export function detectAcceptanceCriteria(body) {
  const text = body ?? '';

  const acceptance =
    text.includes('受け入れ条件') || text.includes('完了条件') || hasYaruKotoChecklist(text);

  const hasFencedCodeBlock = /```/.test(text);
  const hasVerificationCommand =
    /`(pnpm|gh|node|git|rg|npx) [^`]*`/.test(text) || text.includes('expect(');
  const verification = hasFencedCodeBlock || hasVerificationCommand;

  return { acceptance, verification };
}

/**
 * `detectJudgmentRecords`（+ 任意で `detectAcceptanceCriteria`）の結果から次の一手ヒントを組む。
 * `records` に `acceptance`/`verification` フィールドが無ければその判定はスキップする。
 * 全て あり なら null。
 */
export function buildJudgmentHint(records) {
  if (!records) return null;
  const missing = [];
  if (!records.dod) missing.push('DoD');
  if (!records.breakdown) missing.push('分解表');
  if (!records.brief) missing.push('brief');
  if ('acceptance' in records && !records.acceptance) missing.push('受け入れ条件');
  if ('verification' in records && !records.verification) {
    missing.push('検証コマンド（dispatch §status:ready の機械判定）');
  }
  if (missing.length === 0) return null;
  return `判断の記録が欠けている: ${missing.join('・')}（routing skill 手順 1 / dispatch 手順 7）`;
}

/**
 * REST `issues/N/comments` の応答から、bot を除外（`allComments` 指定時は除外しない）
 * した上で最新 K 件を返す。
 */
export function selectComments(comments, k, allComments) {
  const list = Array.isArray(comments) ? comments : [];
  const filtered = allComments ? list : list.filter((c) => !isBotLogin(c.user?.login));
  return k > 0 ? filtered.slice(-k) : [];
}

// `Closes #1, #2` のようにキーワード 1 つに複数番号が並ぶ形まで拾う。
const LINK_KEYWORD_RE = /\b(?:Closes|Refs|Fixes)\s+((?:#\d+)(?:\s*,\s*#\d+)*)/gi;

/** body 中の `Closes/Refs/Fixes #N` 群から番号を重複無しで抽出する（出現順）。 */
export function extractLinkedIssueNumbers(body) {
  if (!body) return [];
  const found = [];
  const re = new RegExp(LINK_KEYWORD_RE);
  let match = re.exec(body);
  while (match) {
    const nums = match[1].match(/\d+/g) ?? [];
    for (const n of nums) found.push(Number(n));
    match = re.exec(body);
  }
  return [...new Set(found)];
}

/** issue body から親 epic 番号を推定する（`sub-issue of #M` 優先、無ければ `Refs #M` の初出）。 */
export function extractParentEpic(body) {
  if (!body) return null;
  const subIssueMatch = body.match(/sub-issue of #(\d+)/i);
  if (subIssueMatch) return Number(subIssueMatch[1]);
  const refsMatch = body.match(/\bRefs\s+#(\d+)/i);
  if (refsMatch) return Number(refsMatch[1]);
  return null;
}

const PATH_TOKEN_RE = /[\w@./-]+\.(?:ts|tsx|mjs|cjs|js|md|mdx|sql|yml|yaml|json|sh)/g;

/** body からパスらしき token を抽出する（実在確認は呼び出し側 `filterExistingPaths` で行う）。 */
export function extractPathTokens(body) {
  if (!body) return [];
  const matches = body.match(PATH_TOKEN_RE) ?? [];
  return [...new Set(matches)];
}

/** `existsFn` で実在確認できた path だけ残す（`cwd` 起点の相対解決）。 */
export function filterExistingPaths(tokens, existsFn, cwd) {
  return tokens.filter((token) => {
    try {
      return existsFn(join(cwd, token));
    } catch {
      return false;
    }
  });
}

/** ある issue/PR 番号を指す `Closes/Refs/Fixes #N` を body に持つかどうか。 */
export function bodyReferencesNumber(body, number) {
  if (!body) return false;
  const re = new RegExp(`\\b(?:Closes|Refs|Fixes)\\s+(?:#\\d+\\s*,\\s*)*#${number}\\b`, 'i');
  return re.test(body);
}

/**
 * `statusCheckRollup`（CheckRun / StatusContext 混在配列）を SUCCESS/FAILURE/PENDING
 * の 3 分類へ畳む。`conclusion`（CheckRun）→ `state`（StatusContext）→ `status` の順で
 * 読み、値が無い・未知なら pending 扱い（COMPLETED でない CheckRun 等）。
 */
export function computeCiRollup(rollup) {
  const counts = { success: 0, failure: 0, pending: 0 };
  const SUCCESS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
  const FAILURE = new Set([
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
  ]);
  for (const item of rollup ?? []) {
    const raw = String(item?.conclusion ?? item?.state ?? item?.status ?? '').toUpperCase();
    if (SUCCESS.has(raw)) counts.success += 1;
    else if (FAILURE.has(raw)) counts.failure += 1;
    else counts.pending += 1;
  }
  return counts;
}

/** GraphQL `reviewThreads(first:100){nodes{isResolved}}` から未解決 thread 数を数える。 */
export function countUnresolvedThreads(nodes) {
  return (nodes ?? []).filter((n) => n?.isResolved === false).length;
}

// ファイル一覧 → skill 候補の固定ルール表（AGENTS.md Skills 索引と対応）。
const SKILL_RULES = [
  {
    test: (f) => f.startsWith('supabase/migrations/') || f.startsWith('supabase/functions/'),
    skill: 'supabase',
  },
  {
    test: (f) => /^apps\/product\/src\/features\/[^/]+\/server\//.test(f),
    skill: 'trpc-router-creating',
  },
  { test: (f) => /^apps\/product\/src\/features\/[^/]+\/server\//.test(f), skill: 'security' },
  {
    test: (f) =>
      /^apps\/product\/src\/features\/auth\//.test(f) || /\/lib\/(?:stripe|billing)\//.test(f),
    skill: 'security',
  },
  {
    test: (f) => f.endsWith('.stories.tsx') || f.startsWith('packages/components/'),
    skill: 'storybook',
  },
  { test: (f) => f.startsWith('apps/product/messages/'), skill: 'i18n' },
  { test: (f) => f.startsWith('apps/web/content/'), skill: 'docs-writing' },
  {
    test: (f) => f.startsWith('scripts/hooks/') || f.startsWith('scripts/ci/'),
    skill: 'pr-cross-review',
  },
  { test: (f) => f.endsWith('.test.ts'), skill: 'test' },
  { test: (f) => f.startsWith('docs/'), skill: 'docs-writing' },
];

/** ファイル一覧（+ 保護対象判定）から関連 skill 候補を一意に列挙する。 */
export function mapSkills(files, protectedRequired) {
  const skills = new Set();
  for (const file of files ?? []) {
    for (const rule of SKILL_RULES) {
      if (rule.test(file)) skills.add(rule.skill);
    }
  }
  if (protectedRequired) skills.add('pr-cross-review');
  return [...skills];
}

/**
 * 次の一手のヒューリスティック。4 ケースを上から順に判定し、最初に成立したものを返す。
 * どれにも当てはまらない（例: issue で PR 紐付き済み）場合は空文字（次の一手セクション自体を出さない）。
 */
export function nextStep({
  kind,
  number,
  hasLinkedPr = false,
  isDraft = false,
  ciFailure = false,
  unresolvedThreads = 0,
  mergeStateStatus = '',
  linkedPrNumber = /** @type {number | null} */ (null),
}) {
  if (kind === 'issue' && !hasLinkedPr) return '分解表を issue コメントに書く（routing skill）';
  if (kind === 'issue' && hasLinkedPr) {
    return linkedPrNumber
      ? `linked PR #${linkedPrNumber} を進める（pnpm ctx ${linkedPrNumber}）`
      : 'linked PR を進める';
  }
  if (kind === 'pr' && (mergeStateStatus === 'DIRTY' || mergeStateStatus === 'BEHIND')) {
    return `origin/main を merge して追従する（mergeStateStatus: ${mergeStateStatus}）`;
  }
  if (kind === 'pr' && ciFailure) return '失敗 check を直す';
  if (kind === 'pr' && isDraft && (unresolvedThreads ?? 0) === 0) {
    return `pnpm check を通して ready 化する（gh pr ready ${number}）`;
  }
  if (kind === 'pr' && !isDraft && (unresolvedThreads ?? 0) > 0) return 'thread を resolve';
  if (kind === 'pr' && !isDraft && !ciFailure && (unresolvedThreads ?? 0) === 0) {
    return `pnpm branch:finish ${number}`;
  }
  return '';
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function formatFileList(files, max = 40) {
  if (!files || files.length === 0) return null;
  const shown = files.slice(0, max);
  const rest = files.length - shown.length;
  return { shown, rest };
}

/** pack（buildContextPack の出力）を markdown へ描画する。空セクションは丸ごと省く。 */
export function renderMarkdown(pack) {
  const lines = [];
  lines.push(`### #${pack.number} ${pack.header.title ?? '（タイトル未取得）'}`);

  const headerParts = [
    `種別: ${pack.kind === 'pr' ? 'PR' : 'issue'}`,
    `state: ${pack.header.state ?? '未取得'}`,
    `labels: ${pack.header.labels?.length ? pack.header.labels.join(', ') : 'なし'}`,
    `milestone: ${pack.header.milestone ?? 'なし'}`,
    `assignee: ${pack.header.assignee ?? 'なし'}`,
    `url: ${pack.header.url ?? '未取得'}`,
  ];
  lines.push(headerParts.join(' | '));

  if (pack.kind === 'pr') {
    const ci = pack.header.ciRollup;
    const ciText = ci
      ? `SUCCESS ${ci.success} / FAILURE ${ci.failure} / PENDING ${ci.pending}`
      : '未取得';
    const threadsText =
      pack.header.unresolvedThreads === null || pack.header.unresolvedThreads === undefined
        ? '未取得'
        : String(pack.header.unresolvedThreads);
    lines.push(
      [
        `${pack.header.headRefName ?? '未取得'} → ${pack.header.baseRefName ?? '未取得'}`,
        `isDraft: ${pack.header.isDraft ?? '未取得'}`,
        `mergeStateStatus: ${pack.header.mergeStateStatus ?? '未取得'}`,
        `reviewDecision: ${pack.header.reviewDecision ?? 'なし'}`,
        `CI: ${ciText}`,
        `未解決 thread: ${threadsText}`,
      ].join(' | '),
    );
  }
  lines.push('');

  if (pack.body) {
    lines.push('#### 本文');
    lines.push('');
    lines.push(pack.body.text || '（本文なし）');
    if (pack.body.truncated) {
      lines.push('');
      lines.push(`…（残り ${pack.body.remaining} 行）`);
    }
    lines.push('');
  }

  if (pack.comments === null) {
    lines.push('#### 直近コメント（最新 K 件）');
    lines.push('');
    lines.push('未取得（gh 呼び出し失敗）');
    lines.push('');
  } else if (pack.comments.length > 0) {
    lines.push(`#### 直近コメント（最新 ${pack.comments.length} 件）`);
    lines.push('');
    for (const comment of pack.comments) {
      lines.push(`**${comment.author}** (${comment.date})`);
      lines.push(comment.body);
      lines.push('');
    }
  }

  const related = pack.related;
  const relatedLines = [];
  if (related.parentEpic) {
    relatedLines.push(
      `- 親 epic: #${related.parentEpic.number} ${related.parentEpic.state ?? '未取得'} ${related.parentEpic.title ?? ''}`,
    );
  }
  if (related.prs) {
    for (const pr of related.prs) {
      relatedLines.push(`- #${pr.number} ${pr.state} ${pr.title} (${pr.headRefName ?? '未取得'})`);
    }
  }
  if (related.linkedIssues) {
    for (const issue of related.linkedIssues) {
      relatedLines.push(
        `- #${issue.number} ${issue.state} ${issue.title}${issue.labels?.length ? ` [${issue.labels.join(', ')}]` : ''}`,
      );
    }
  }
  if (relatedLines.length > 0) {
    lines.push('#### 関連');
    lines.push('');
    lines.push(...relatedLines);
    lines.push('');
  }

  const fileList = formatFileList(pack.files);
  if (fileList) {
    lines.push('#### 触るファイル');
    lines.push('');
    for (const file of fileList.shown) lines.push(`- ${file}`);
    if (fileList.rest > 0) lines.push(`- …他 ${fileList.rest} 件`);
    lines.push('');
    lines.push(
      `保護対象: ${pack.protectedRequired === null ? '未取得' : pack.protectedRequired ? '必要' : '不要'}`,
    );
    lines.push('');
  }

  if (pack.decisionLines.length > 0) {
    lines.push('#### 決定ログ');
    lines.push('');
    for (const line of pack.decisionLines) lines.push(`- ${escapeCell(line.replace(/^- /, ''))}`);
    lines.push('');
  }

  if (pack.skills.length > 0) {
    lines.push('#### 関連 skill 候補');
    lines.push('');
    lines.push(pack.skills.join(', '));
    lines.push('');
  }

  if (pack.judgmentRecords) {
    const r = pack.judgmentRecords;
    lines.push('#### 判断の記録');
    lines.push('');
    lines.push(
      `DoD: ${r.dod ? 'あり' : 'なし'} | 分解表: ${r.breakdown ? 'あり' : 'なし'} | brief: ${r.brief ? 'あり' : 'なし'} | 受け入れ条件: ${r.acceptance ? 'あり' : 'なし'} | 検証コマンド: ${r.verification ? 'あり' : 'なし'}`,
    );
    lines.push('');
  }

  if (pack.nextStep) {
    lines.push(`次の一手: ${pack.nextStep}`);
    if (pack.nextStepSecondary) {
      lines.push(pack.nextStepSecondary);
    }
  }

  // 末尾の空行を畳んで行数を安定させる。
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// --- gh 呼び出しを含む組み立て（main からのみ呼ばれる） ---------------------

/** 例外を握り潰して fallback を返す薄いラッパー。「未取得」を作るための唯一の場所。 */
function tryOr(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const DECISIONS_PATH = 'docs/decisions.md';

function collectDecisionLines(readFileImpl, cwd, numbers) {
  const raw = tryOr(() => readFileImpl(join(cwd, DECISIONS_PATH), 'utf8'), null);
  if (raw === null) return [];
  const needles = numbers.map((n) => `#${n}`);
  return raw
    .split('\n')
    .filter((line) => needles.some((needle) => line.includes(needle)))
    .map((line) => line.trim().slice(0, 200));
}

/**
 * issue/PR 番号から context pack を組み立てる。gh 呼び出しは各段で `tryOr` により
 * 個別に fail closed（そのセクションだけ「未取得」）にする ── 1 回の flake で
 * 全体を落とさない。
 */
export function buildContextPack(options, deps = {}) {
  const {
    execFileImpl,
    existsFn = existsSync,
    readFileImpl = readFileSync,
    cwd = process.cwd(),
  } = deps;
  const { number, comments: commentsK, bodyLines, allComments } = options;

  const base = tryOr(
    () => runGhJson(['api', `repos/${REPO}/issues/${number}`], { execFileImpl }),
    null,
  );
  const kind = base && isPullRequest(base) ? 'pr' : 'issue';

  let header;
  let rawBody;
  let files = null;
  let ciRollup = null;
  let unresolvedThreads = null;

  if (kind === 'pr') {
    const pr = tryOr(
      () =>
        runGhJson(
          [
            'pr',
            'view',
            String(number),
            '--json',
            'number,title,state,url,labels,milestone,assignees,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,body,files',
          ],
          { execFileImpl },
        ),
      null,
    );
    header = {
      title: pr?.title ?? base?.title ?? null,
      state: pr?.state ?? base?.state ?? null,
      labels: (pr?.labels ?? base?.labels ?? []).map((l) => l.name),
      milestone: pr?.milestone?.title ?? base?.milestone?.title ?? null,
      assignee: (pr?.assignees ?? base?.assignees ?? [])[0]?.login ?? null,
      url: pr?.url ?? base?.html_url ?? null,
      headRefName: pr?.headRefName ?? null,
      baseRefName: pr?.baseRefName ?? null,
      isDraft: pr?.isDraft ?? null,
      mergeStateStatus: pr?.mergeStateStatus ?? null,
      reviewDecision: pr?.reviewDecision ?? null,
      ciRollup: pr ? computeCiRollup(pr.statusCheckRollup) : null,
      unresolvedThreads: null,
    };
    rawBody = pr?.body ?? base?.body ?? '';
    files = pr?.files?.map((f) => f.path) ?? null;
    ciRollup = header.ciRollup;

    const threadNodes = tryOr(() => {
      const raw = runGh(
        [
          'api',
          'graphql',
          '-f',
          `query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}`,
          '-f',
          `owner=${REPO_OWNER}`,
          '-f',
          `name=${REPO_NAME}`,
          '-F',
          `number=${number}`,
        ],
        { execFileImpl },
      );
      return JSON.parse(raw).data.repository.pullRequest.reviewThreads.nodes;
    }, null);
    unresolvedThreads = threadNodes === null ? null : countUnresolvedThreads(threadNodes);
    header.unresolvedThreads = unresolvedThreads;
  } else {
    header = {
      title: base?.title ?? null,
      state: base?.state ?? null,
      labels: (base?.labels ?? []).map((l) => l.name),
      milestone: base?.milestone?.title ?? null,
      assignee: (base?.assignees ?? [])[0]?.login ?? null,
      url: base?.html_url ?? null,
    };
    rawBody = base?.body ?? '';
  }

  const bodyResult = truncateBody(rawBody, bodyLines);

  const commentsRaw = tryOr(
    () =>
      runGhJson(['api', `repos/${REPO}/issues/${number}/comments?per_page=100`], { execFileImpl }),
    null,
  );
  const comments =
    commentsRaw === null
      ? null
      : selectComments(commentsRaw, commentsK, allComments).map((c) => ({
          author: c.user?.login ?? '不明',
          date: (c.created_at ?? '').slice(0, 10),
          body: truncateCommentBody(c.body),
        }));

  // --- 関連 ---
  const related = { parentEpic: null, prs: null, linkedIssues: null };
  let linkedNumbers = [];

  if (kind === 'issue') {
    related.parentEpic = tryOr(() => {
      const epicNumber = extractParentEpic(rawBody);
      if (!epicNumber) return null;
      const epic = runGhJson(['api', `repos/${REPO}/issues/${epicNumber}`], { execFileImpl });
      return { number: epicNumber, state: epic.state, title: epic.title };
    }, null);

    const matchedPrs = tryOr(() => {
      const results = runGhJson(
        [
          'search',
          'prs',
          '--repo',
          REPO,
          `#${number}`,
          '--json',
          'number,title,state,body',
          '--limit',
          '20',
        ],
        { execFileImpl },
      );
      return results.filter((pr) => bodyReferencesNumber(pr.body, number));
    }, null);

    if (matchedPrs !== null) {
      // 触るファイル用に上位 3 件だけ headRefName + files を追加取得する。
      const enriched = matchedPrs.slice(0, 3).map((pr) =>
        tryOr(
          () => {
            const detail = runGhJson(
              ['pr', 'view', String(pr.number), '--json', 'headRefName,files'],
              {
                execFileImpl,
              },
            );
            return {
              ...pr,
              headRefName: detail.headRefName,
              files: detail.files?.map((f) => f.path) ?? [],
            };
          },
          { ...pr, headRefName: null, files: [] },
        ),
      );
      related.prs = enriched.map(({ number: n, state, title, headRefName }) => ({
        number: n,
        state,
        title,
        headRefName,
      }));
      files = [...new Set(enriched.flatMap((pr) => pr.files))];
    }
  } else {
    linkedNumbers = extractLinkedIssueNumbers(rawBody);
    if (linkedNumbers.length > 0) {
      related.linkedIssues = linkedNumbers.map((n) =>
        tryOr(
          () => {
            const issue = runGhJson(['api', `repos/${REPO}/issues/${n}`], { execFileImpl });
            return {
              number: n,
              state: issue.state,
              title: issue.title,
              labels: (issue.labels ?? []).map((l) => l.name),
            };
          },
          { number: n, state: '未取得', title: '未取得', labels: [] },
        ),
      );
    }
  }

  // --- 触るファイル（issue は関連 PR の files + body 中の実在 path token） ---
  if (kind === 'issue') {
    const tokens = extractPathTokens(rawBody);
    const existing = filterExistingPaths(tokens, existsFn, cwd);
    files = [...new Set([...(files ?? []), ...existing])];
  }

  const protectedRequired = files === null ? null : resolveProtectedPathGate(files).required;
  const skills = mapSkills(files ?? [], protectedRequired === true);

  const decisionNumbers = [
    number,
    ...(related.parentEpic ? [related.parentEpic.number] : []),
    ...linkedNumbers,
  ];
  const decisionLines = collectDecisionLines(readFileImpl, cwd, decisionNumbers);

  const hasLinkedPr = kind === 'issue' && Boolean(related.prs && related.prs.length > 0);
  const ciFailure = kind === 'pr' && Boolean(ciRollup && ciRollup.failure > 0);
  const step = nextStep({
    kind,
    number,
    hasLinkedPr,
    isDraft: header.isDraft,
    ciFailure,
    unresolvedThreads,
    mergeStateStatus: header.mergeStateStatus ?? '',
    linkedPrNumber: hasLinkedPr ? (related.prs[0]?.number ?? null) : null,
  });

  // 判断の記録（routing skill §目標状態 / dispatch 手順 7）。issue のみ判定する
  // （PR 側は trace.mjs が linked issue ごとに同じ detector を使い分ける）。
  const judgmentRecords =
    kind === 'issue'
      ? {
          ...detectJudgmentRecords(commentsRaw ?? [], rawBody),
          ...detectAcceptanceCriteria(rawBody),
        }
      : null;
  const judgmentHint = buildJudgmentHint(judgmentRecords);
  let finalNextStep = step;
  let nextStepSecondary = null;
  if (judgmentHint) {
    if (kind === 'issue' && !hasLinkedPr) {
      finalNextStep = judgmentHint;
    } else {
      nextStepSecondary = judgmentHint;
    }
  }

  return {
    number,
    kind,
    header,
    body: bodyResult,
    comments,
    related,
    files,
    protectedRequired,
    decisionLines,
    skills,
    judgmentRecords,
    nextStep: finalNextStep,
    nextStepSecondary,
  };
}

// --- `--post`（issue/PR コメントへの配達、idempotent 更新） ----------------

/** 配達コメントの先頭に置く隠しマーカー。このマーカーで始まるコメントが「ctx brief」。 */
export const CTX_MARKER = '<!-- ctx-brief -->';

/** コメント本文を組み立てる。1 行目は必ずマーカー（idempotent 判定の唯一の根拠）。 */
export function buildCommentBody({ number, date, markdown }) {
  return `${CTX_MARKER}\n**brief（\`pnpm ctx ${number}\`、${date}）**\n\n${markdown}\n`;
}

/** コメント一覧からマーカー付きの既存 ctx brief コメントを探す。無ければ null。 */
export function findMarkerComment(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list.find((c) => typeof c.body === 'string' && c.body.startsWith(CTX_MARKER)) ?? null;
}

/**
 * 投稿方法（PATCH で更新 / 新規作成）を argv 配列へ落とす。
 * body は tmpFile（os.tmpdir() 配下）経由で渡す ── shell 文字列に埋め込まない。
 */
export function buildPostArgs({ number, existingCommentId, tmpFile }) {
  if (existingCommentId) {
    return {
      mode: 'update',
      argv: [
        'api',
        '-X',
        'PATCH',
        `repos/${REPO}/issues/comments/${existingCommentId}`,
        '-F',
        `body=@${tmpFile}`,
      ],
    };
  }
  return {
    mode: 'create',
    argv: ['issue', 'comment', String(number), '--body-file', tmpFile],
  };
}

/**
 * `pnpm ctx N --post`: markdown を組み立てた後、issue/PR コメントとして配達する。
 * idempotent ── 既存の ctx brief コメント（`CTX_MARKER` で始まる）があれば PATCH で
 * 更新し、無ければ新規作成する。gh 呼び出しは `execFileImpl` 経由（shell を経由しない）。
 */
export function postContextBrief(pack, markdown, deps = {}) {
  const {
    execFileImpl,
    writeFileImpl = writeFileSync,
    mkdtempImpl = mkdtempSync,
    tmpDirPath = tmpdir(),
    now = () => new Date(),
  } = deps;

  const existingComments = runGhJson(
    ['api', `repos/${REPO}/issues/${pack.number}/comments?per_page=100`, '--paginate'],
    { execFileImpl },
  );
  const existing = findMarkerComment(existingComments);

  const date = now().toISOString().slice(0, 10);
  const body = buildCommentBody({ number: pack.number, date, markdown });

  const dir = mkdtempImpl(join(tmpDirPath, 'ctx-brief-'));
  const tmpFile = join(dir, 'body.md');
  writeFileImpl(tmpFile, body, 'utf8');

  const { mode, argv } = buildPostArgs({
    number: pack.number,
    existingCommentId: existing?.id ?? null,
    tmpFile,
  });

  if (mode === 'update') {
    const updated = runGhJson(argv, { execFileImpl });
    return { mode, url: updated?.html_url ?? null };
  }
  const out = runGh(argv, { execFileImpl });
  return { mode, url: out.trim() };
}

// --- CLI --------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv.slice(2));
  const pack = buildContextPack(options, {});
  if (options.post) {
    const markdown = renderMarkdown(pack);
    const result = postContextBrief(pack, markdown, {});
    process.stdout.write(
      `${result.mode === 'update' ? '更新' : '作成'}: ${result.url ?? '（URL 未取得）'}\n`,
    );
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMarkdown(pack)}\n`);
  }
}

if (isDirectExecution(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'ctx failed');
    process.exitCode = 1;
  }
}
