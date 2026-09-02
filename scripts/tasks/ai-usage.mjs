import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { REPO, runGhJson } from '../lib/gh.mjs';
import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * `pnpm ai:usage` — AI 経済メトリクス（Uber Software Factory 原則⑤「評価は
 * Token でなく Outcome」の Dayopt 写像、Sub-1。plan: dayopt-https-www-uber-com-
 * us-en-blog-ef-eventual-hare.md §Sub-1）。
 *
 * `~/.claude/projects/**\/*.jsonl` を 1 パスで walk し、指定期間（既定は前月の
 * 暦月。gardening step 1 が前月分を journal にするため）について以下を集計する:
 *
 *   A. 消費 — model 別 requests / output / input / cache_read / cache_creation、
 *      output 構成比、subagent 比（isSidechain）、cache TTL（1h/5m）内訳、
 *      cache miss 比
 *   B. context bloat proxy — tool_use → tool_result の chars を tool 名へ帰属
 *   C. 成果（gh 経由）— 当該期間の merged PR 数・revert PR 数（title proxy）・
 *      merged PR あたり output/cache_read token
 *   D. L0 候補検出 — Bash コマンドの先頭トークン頻度、および連続 tool_use
 *      チェイン（ユーザーの平文発話に遮られない連鎖）の上位
 *
 * **`scripts/hooks/session-token-usage.py` とはあえて共有しない。** あちらは
 * SessionStart 時に全 project 横断で直近 7 日 / 5 時間を見る「今すぐ委譲すべきか」
 * ビュー、こちらは 1 repo に絞った月次の「経済として健全か」ビュー。record 形状
 * （dedup は message.id、model ラベルは haiku/sonnet/opus/fable/mythos の部分一致、
 * mtime 窓での事前除外）は同じだが、`scripts/hooks/**` はクロスレビュー必須の
 * 保護対象 path であり、taxonomy test（scripts-taxonomy.test.ts）は package.json
 * エントリを持つ script を `scripts/tasks/` に置くことを要求する。共有 lib 化は
 * せず、知識だけこのヘッダへ複製する。drift が実害化したら共有化ではなく hook を
 * 削る方向で解く（月次ビューは週次ビューの上位集合）。
 *
 * deferred（次回以降）: 円 / ドル換算（per-token 価格がローカルに無い）、
 * push 回数・review round・MTTR（PR ごと timeline API が N 回必要）、
 * Codex P1 件数、F1、`effort` / `attributionSkill` 別内訳、16 アンチパターンの
 * 自動 flag（数値だけ出し判定は人間パートへ）、Human intervention 回数の自動計測
 * （AskUserQuestion 件数を jsonl から数える案。今回は journal 手書き）。
 */

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MODEL_LABELS = ['haiku', 'sonnet', 'opus', 'fable', 'mythos'];
const BASH_PREFIX_LEADERS = new Set(['pnpm', 'npx', 'gh', 'git']);

/** model 名を短いラベルへ畳む。集計対象外（`<synthetic>` 等）なら null。 */
export function normalizeModelLabel(raw) {
  if (!raw) return null;
  const name = String(raw).toLowerCase();
  if (name.startsWith('<')) return null;
  for (const label of MODEL_LABELS) {
    if (name.includes(label)) return label;
  }
  return String(raw).slice(0, 24);
}

/** `YYYY-MM-DD` 文字列から UTC 深夜の Date を作る。`endOfDay` なら翌日 00:00（inclusive 終端）。 */
function parseDateBoundary(value, endOfDay) {
  const [y, m, d] = value.split('-').map((n) => Number(n));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** 既定窓 = 前月の暦月（JST/UTC のズレは許容。月次 journal の粒度で十分）。 */
export function defaultWindow(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11、前月は m-1
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExclusive = new Date(Date.UTC(y, m, 1)); // 今月 1 日 00:00 = 前月末の翌日
  return { since: toDateStr(start), until: toDateStr(new Date(endExclusive.getTime() - 86400000)) };
}

/** CLI 引数を解釈する。未知の引数は例外。 */
export function parseArgs(argv, now = new Date()) {
  const options = { ...defaultWindow(now), json: false, cwdPrefix: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--since') {
      options.since = argv[i + 1];
      i += 1;
    } else if (arg === '--until') {
      options.until = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--cwd-prefix') {
      options.cwdPrefix = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`未知の引数です: ${arg}（--since / --until / --json / --cwd-prefix のみ）`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.since ?? '')) {
    throw new Error('--since は YYYY-MM-DD で指定する');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.until ?? '')) {
    throw new Error('--until は YYYY-MM-DD で指定する');
  }
  return options;
}

/**
 * @typedef {{ file: string, length: number, tools: Map<string, number> }} Chain
 */

/** 新しい集計器を作る。 */
export function createAggregate() {
  return {
    seenMessageIds: new Set(),
    models: new Map(), // label -> { requests, output, input, cacheRead, cacheCreation, sidechainRequests, sidechainOutput, ttl1h, ttl5m }
    toolNamesById: new Map(), // tool_use_id -> tool name（帰属できない tool_result は無視）
    toolResultSizes: new Map(), // tool name -> { calls, chars, max }
    bashPrefixes: new Map(), // prefix -> calls
    /** @type {Chain[]} */
    chains: [],
  };
}

function ensureModelBucket(models, label) {
  let bucket = models.get(label);
  if (!bucket) {
    bucket = {
      requests: 0,
      output: 0,
      input: 0,
      cacheRead: 0,
      cacheCreation: 0,
      sidechainRequests: 0,
      sidechainOutput: 0,
      ttl1h: 0,
      ttl5m: 0,
    };
    models.set(label, bucket);
  }
  return bucket;
}

/**
 * Bash `input.command` から先頭の cd セグメントを 1 回だけ剥がし、続く
 * コメント行・空行も読み飛ばして prefix トークンを返す。
 *
 * 剥がす形（実測の 2026-08 データで判明した既知パターン）:
 * - `cd <path> && <command>` / `cd <path>; <command>`
 * - `cd <path>\n<command>`（改行区切り。`&&` より出現頻度が高い）
 * - `cd "<quoted path>" && …`（`cd "$(git rev-parse --show-toplevel)" && …`
 *   のようにパス自体に空白を含む形。ダブル/シングルクォートの中身は空白可）
 *
 * コマンド全体が `cd <path>` だけ（後続コマンドが無い）の場合は L0 候補として
 * 意味を持たないため null を返す（カウントしない）。
 */
export function extractBashPrefix(command) {
  if (typeof command !== 'string') return null;
  const trimmed = command.trim();
  if (!trimmed) return null;

  const CD_PATH = '(?:"[^"]*"|\'[^\']*\'|\\S+)';
  if (new RegExp(`^cd\\s+${CD_PATH}\\s*$`).test(trimmed)) return null;

  let cmd = trimmed;
  const cdMatch = cmd.match(new RegExp(`^cd\\s+${CD_PATH}\\s*(?:&&|;|\\n)\\s*`));
  if (cdMatch) cmd = cmd.slice(cdMatch[0].length);

  // 先頭のコメント行（`# …`）・空行を読み飛ばす。
  const lines = cmd.split('\n');
  while (lines.length > 0) {
    const line = lines[0].trim();
    if (line === '' || line.startsWith('#')) {
      lines.shift();
      continue;
    }
    break;
  }
  cmd = lines.join('\n').trim();
  if (!cmd) return null;

  const tokens = cmd.split(/\s+/);
  const first = tokens[0];
  if (BASH_PREFIX_LEADERS.has(first) && tokens.length > 1) {
    return `${first} ${tokens[1]}`;
  }
  return first;
}

/**
 * tool_result の content から文字数を数える。string / `{type:'text',text}[]` の
 * どちらの形も受ける。
 */
function contentLength(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum, block) => {
      if (block && typeof block === 'object' && typeof block.text === 'string') {
        return sum + block.text.length;
      }
      return sum;
    }, 0);
  }
  return 0;
}

/**
 * 1 レコード（parse 済み JSON）を集計へ畳み込む。窓外・cwd 不一致・dedup 済みは
 * 無視する。isDirectExecution 系の副作用は持たず純関数として test できる。
 * @param {ReturnType<typeof createAggregate>} agg
 * @param {unknown} record
 * @param {{ sinceMs: number, untilMs: number, cwdPrefix: string }} bounds
 * @param {{ file: string }} ctx チェイン検出用に file 名を渡す
 */
export function foldUsageRecord(agg, record, bounds, ctx) {
  if (!record || typeof record !== 'object') return;

  if (record.type === 'assistant') {
    const message = record.message ?? {};
    const usage = message.usage ?? {};
    const messageId = message.id;
    const timestamp = record.timestamp ? Date.parse(record.timestamp) : NaN;
    const cwd = typeof record.cwd === 'string' ? record.cwd : '';

    const inWindow =
      Number.isFinite(timestamp) && timestamp >= bounds.sinceMs && timestamp < bounds.untilMs;
    const cwdMatches = !bounds.cwdPrefix || cwd.startsWith(bounds.cwdPrefix);

    // tool_use → 名前の Map は L0/B 集計に使うため、model 集計の窓外判定とは
    // 独立に常時記録する（tool_result 側は自分のタイムスタンプを持たないため）。
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (block && block.type === 'tool_use' && typeof block.id === 'string') {
        agg.toolNamesById.set(block.id, block.name ?? 'unknown');
        if (block.name === 'Bash' && block.input && typeof block.input.command === 'string') {
          const prefix = extractBashPrefix(block.input.command);
          if (prefix) {
            agg.bashPrefixes.set(prefix, (agg.bashPrefixes.get(prefix) ?? 0) + 1);
          }
        }
      }
    }

    if (inWindow && cwdMatches && messageId && !agg.seenMessageIds.has(messageId)) {
      agg.seenMessageIds.add(messageId);
      const label = normalizeModelLabel(message.model);
      if (label) {
        const bucket = ensureModelBucket(agg.models, label);
        bucket.requests += 1;
        bucket.output += usage.output_tokens ?? 0;
        bucket.input += usage.input_tokens ?? 0;
        bucket.cacheRead += usage.cache_read_input_tokens ?? 0;
        bucket.cacheCreation += usage.cache_creation_input_tokens ?? 0;
        bucket.ttl1h += usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
        bucket.ttl5m += usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
        if (record.isSidechain === true) {
          bucket.sidechainRequests += 1;
          bucket.sidechainOutput += usage.output_tokens ?? 0;
        }
      }
    }

    // チェイン検出: このレコードに tool_use が含まれれば「進行中チェイン」を継続。
    const toolUseBlocks = content.filter((b) => b && b.type === 'tool_use');
    if (toolUseBlocks.length > 0) {
      let chain = ctx.currentChain;
      if (!chain || chain.file !== ctx.file) {
        chain = { file: ctx.file, length: 0, tools: new Map() };
        ctx.currentChain = chain;
        agg.chains.push(chain);
      }
      chain.length += toolUseBlocks.length;
      for (const block of toolUseBlocks) {
        const name = block.name ?? 'unknown';
        chain.tools.set(name, (chain.tools.get(name) ?? 0) + 1);
      }
    }
    return;
  }

  if (record.type === 'user') {
    const message = record.message ?? {};
    const content = message.content;
    if (typeof content === 'string') {
      // 平文発話 = チェインを断ち切る。
      ctx.currentChain = null;
      return;
    }
    if (Array.isArray(content)) {
      let hasToolResult = false;
      for (const block of content) {
        if (block && block.type === 'tool_result') {
          hasToolResult = true;
          const name = agg.toolNamesById.get(block.tool_use_id) ?? 'unknown';
          const chars = contentLength(block.content);
          let sizeBucket = agg.toolResultSizes.get(name);
          if (!sizeBucket) {
            sizeBucket = { calls: 0, chars: 0, max: 0 };
            agg.toolResultSizes.set(name, sizeBucket);
          }
          sizeBucket.calls += 1;
          sizeBucket.chars += chars;
          if (chars > sizeBucket.max) sizeBucket.max = chars;
        } else if (block && block.type === 'text') {
          hasToolResult = false;
        }
      }
      if (!hasToolResult) {
        // plain text ブロックのみ（tool_result を含まない）= 発話としてチェインを断ち切る。
        ctx.currentChain = null;
      }
    }
  }
}

/** tool_result のサイズ集計だけを独立して呼びたい test 用の薄いラッパー。 */
export function collectToolResultSizes(
  records,
  bounds = { sinceMs: -Infinity, untilMs: Infinity, cwdPrefix: '' },
) {
  const agg = createAggregate();
  const ctx = { file: 'test', currentChain: null };
  for (const record of records) {
    foldUsageRecord(agg, record, bounds, ctx);
  }
  return agg.toolResultSizes;
}

/** L0 候補検出（Bash prefix 頻度 + チェイン）だけを独立して呼びたい test 用ラッパー。 */
export function collectL0Candidates(
  recordsByFile,
  bounds = { sinceMs: -Infinity, untilMs: Infinity, cwdPrefix: '' },
) {
  const agg = createAggregate();
  for (const [file, records] of Object.entries(recordsByFile)) {
    const ctx = { file, currentChain: null };
    for (const record of records) {
      foldUsageRecord(agg, record, bounds, ctx);
    }
  }
  return { bashPrefixes: agg.bashPrefixes, chains: agg.chains };
}

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** k/M/B 表記へ丸める（`scripts/hooks/session-token-usage.py` の `human()` と同じ閾値）。 */
export function human(value) {
  const v = Number(value) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function pct(value, total) {
  if (!total) return '—';
  return `${((value * 100) / total).toFixed(1)}%`;
}

/** markdown table cell の `|` を escape する（`scripts/lib/markdown-table.ts` は .ts のため .mjs から import 不可。複製せずインラインする）。 */
function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

/** repo root 配下の `.jsonl` を列挙する。`~/.claude/projects` が無ければ空配列。 */
function listJsonlFiles(projectsDir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true, recursive: true });
  } catch {
    return null; // 不在
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const dir = entry.parentPath ?? entry.path ?? projectsDir;
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

/** jsonl 全ファイルを walk して集計する（副作用: FS 読み込み）。 */
export function scanProjects({ projectsDir = PROJECTS_DIR, sinceMs, untilMs, cwdPrefix }) {
  const files = listJsonlFiles(projectsDir);
  if (files === null) return null;

  const agg = createAggregate();
  // mtime が since の 1 日前より古いファイルは窓外なのでスキップする。
  const mtimeCutoffMs = sinceMs - 86400000;

  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (stat.mtimeMs < mtimeCutoffMs) continue;

    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const ctx = { file, currentChain: null };
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      foldUsageRecord(agg, record, { sinceMs, untilMs, cwdPrefix }, ctx);
    }
  }
  return agg;
}

/** gh から当該期間の merged / revert PR 数を取る。失敗したら null（呼び出し側が「未取得」に倒す）。 */
export function fetchMergedPrStats({ since, until, execFileImpl } = {}) {
  const prs = runGhJson(
    [
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'merged',
      '--search',
      `merged:${since}..${until}`,
      '--limit',
      '500',
      '--json',
      'number,title',
    ],
    { execFileImpl },
  );
  const merged = prs.length;
  const reverts = prs.filter((pr) => /revert/i.test(pr.title ?? '')).length;
  return { merged, reverts };
}

/** A〜D + gh 成果を markdown へ描画する。fixture ベースの test で形を固定する。 */
export function renderMarkdown({ since, until, agg, prStats }) {
  const lines = [];
  lines.push(`### AI 経済メトリクス（${since}〜${until}）`);
  lines.push('');

  // 表 A: model 別消費
  const totalOutput = [...agg.models.values()].reduce((s, b) => s + b.output, 0);
  lines.push(
    '| model | requests | output | input | cache_read | cache_creation | output 構成比 | subagent 比 | cache 1h/5m 比 |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const modelRows = [...agg.models.entries()].sort((a, b) => b[1].output - a[1].output);
  for (const [label, bucket] of modelRows) {
    const subagentSharePct = pct(bucket.sidechainOutput, bucket.output);
    const ttlTotal = bucket.ttl1h + bucket.ttl5m;
    const ttlShare = ttlTotal
      ? `${((bucket.ttl1h * 100) / ttlTotal).toFixed(0)}%/${((bucket.ttl5m * 100) / ttlTotal).toFixed(0)}%`
      : '—';
    lines.push(
      `| ${escapeCell(label)} | ${bucket.requests} | ${human(bucket.output)} | ${human(bucket.input)} | ${human(bucket.cacheRead)} | ${human(bucket.cacheCreation)} | ${pct(bucket.output, totalOutput)} | ${subagentSharePct} | ${ttlShare} |`,
    );
  }
  if (modelRows.length === 0) {
    lines.push('| 未取得 | — | — | — | — | — | — | — | — |');
  }

  const totalCacheRead = [...agg.models.values()].reduce((s, b) => s + b.cacheRead, 0);
  const totalCacheCreation = [...agg.models.values()].reduce((s, b) => s + b.cacheCreation, 0);
  const missDenominator = totalCacheRead + totalCacheCreation;
  lines.push('');
  lines.push(
    `**cache miss 比（全 model 合算）**: ${
      missDenominator ? `${((totalCacheCreation * 100) / missDenominator).toFixed(1)}%` : '未取得'
    }`,
  );
  lines.push('');

  // 表 B: tool_result サイズ
  lines.push('| tool | calls | total chars | avg | max | 構成比 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  const totalChars = [...agg.toolResultSizes.values()].reduce((s, v) => s + v.chars, 0);
  const toolRows = [...agg.toolResultSizes.entries()]
    .sort((a, b) => b[1].chars - a[1].chars)
    .slice(0, 8);
  for (const [name, sizeBucket] of toolRows) {
    const avg = sizeBucket.calls ? Math.round(sizeBucket.chars / sizeBucket.calls) : 0;
    lines.push(
      `| ${escapeCell(name)} | ${sizeBucket.calls} | ${human(sizeBucket.chars)} | ${human(avg)} | ${human(sizeBucket.max)} | ${pct(sizeBucket.chars, totalChars)} |`,
    );
  }
  if (toolRows.length === 0) {
    lines.push('| 未取得 | — | — | — | — | — |');
  }
  lines.push('');

  // 表 C: 成果（gh）
  if (prStats) {
    const outputPerPr = prStats.merged ? Math.round(totalOutput / prStats.merged) : 0;
    const cacheReadPerPr = prStats.merged ? Math.round(totalCacheRead / prStats.merged) : 0;
    lines.push(`**merged PR 数**: ${prStats.merged}`);
    lines.push(`**revert PR 数（title proxy）**: ${prStats.reverts}`);
    lines.push(`**output tok / merged PR**: ${human(outputPerPr)}`);
    lines.push(`**cache_read tok / merged PR**: ${human(cacheReadPerPr)}`);
  } else {
    lines.push('**merged PR 数**: 未取得（gh 呼び出し失敗）');
    lines.push('**revert PR 数（title proxy）**: 未取得');
    lines.push('**output tok / merged PR**: 未取得');
    lines.push('**cache_read tok / merged PR**: 未取得');
  }
  lines.push('');

  // 表 D1: Bash prefix
  lines.push('| Bash prefix | calls |');
  lines.push('| --- | --- |');
  const prefixRows = topEntries(agg.bashPrefixes, 10);
  for (const [prefix, calls] of prefixRows) {
    lines.push(`| ${escapeCell(prefix)} | ${calls} |`);
  }
  if (prefixRows.length === 0) {
    lines.push('| 未取得 | — |');
  }
  lines.push('');

  // 表 D2: チェイン
  lines.push('| session | chain length | dominant tools |');
  lines.push('| --- | --- | --- |');
  const chainRows = [...agg.chains]
    .filter((c) => c.length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
  for (const chain of chainRows) {
    const dominant = topEntries(chain.tools, 3)
      .map(([name, count]) => `${name}×${count}`)
      .join(', ');
    const sessionLabel =
      chain.file
        .split('/')
        .pop()
        ?.replace(/\.jsonl$/, '')
        .slice(0, 8) ?? chain.file.slice(0, 8);
    lines.push(`| ${escapeCell(sessionLabel)} | ${chain.length} | ${escapeCell(dominant)} |`);
  }
  if (chainRows.length === 0) {
    lines.push('| 未取得 | — | — |');
  }

  return lines.join('\n');
}

function buildAggregateObject({ since, until, projectsDir, cwdPrefix }) {
  const sinceMs = parseDateBoundary(since, false).getTime();
  const untilMs = parseDateBoundary(until, true).getTime();
  const agg = scanProjects({ projectsDir, sinceMs, untilMs, cwdPrefix });
  return { sinceMs, untilMs, agg };
}

function getRepoRoot({ execFileImpl = execFileSync } = {}) {
  try {
    return execFileImpl('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwdPrefix = options.cwdPrefix ?? getRepoRoot();
  const { sinceMs, untilMs, agg } = buildAggregateObject({
    since: options.since,
    until: options.until,
    projectsDir: PROJECTS_DIR,
    cwdPrefix,
  });

  let prStats = null;
  try {
    prStats = fetchMergedPrStats({ since: options.since, until: options.until });
  } catch {
    prStats = null;
  }

  if (agg === null) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ since: options.since, until: options.until, error: 'projects_dir_missing', prStats }, null, 2)}\n`,
      );
    } else {
      process.stdout.write(
        `### AI 経済メトリクス（${options.since}〜${options.until}）\n\n未取得（~/.claude/projects が存在しない）\n`,
      );
    }
    return;
  }

  if (options.json) {
    const modelsObj = Object.fromEntries(agg.models);
    const toolResultSizesObj = Object.fromEntries(agg.toolResultSizes);
    const bashPrefixesObj = Object.fromEntries(agg.bashPrefixes);
    process.stdout.write(
      `${JSON.stringify(
        {
          since: options.since,
          until: options.until,
          models: modelsObj,
          toolResultSizes: toolResultSizesObj,
          bashPrefixes: bashPrefixesObj,
          chains: agg.chains
            .filter((c) => c.length > 0)
            .map((c) => ({ file: c.file, length: c.length, tools: Object.fromEntries(c.tools) })),
          prStats,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(
    `${renderMarkdown({ since: options.since, until: options.until, agg, prStats })}\n`,
  );
}

if (isDirectExecution(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'ai-usage failed');
    process.exitCode = 1;
  }
}
