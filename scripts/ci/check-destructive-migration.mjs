#!/usr/bin/env node

/**
 * Destructive migration 検知 — PR に追加された `supabase/migrations/**` の新規ファイルを
 * 走査し、DROP TABLE / DROP COLUMN / TRUNCATE / 列の型変更（narrowing かどうかは
 * 機械では判定しないため、ALTER COLUMN ... TYPE を検知したら人間の確認対象として扱う）を
 * 検出する。
 *
 * scope（#2272）: 検知の機械化だけを行う。検知結果を理由に merge を機械的にブロックする
 * gate 化・EXPLICIT AUTHORITY の執行そのものは #2175 の scope。このスクリプトはラベル付与
 * と PR コメントで人間の目に留める（fail open — job 自体は失敗させない）。
 *
 * 対象は「新規追加された」migration ファイルのみ（`status === 'added'`）。既存 migration
 * の unrelated な diff（コメント修正など）でノイズを出さないため。migration は原則
 * append-only なので、追加ファイルの検知で実務上十分カバーできる。
 *
 * 使い方（入力は NDJSON — 1 行 1 JSON object。`gh api --paginate ... --jq '.[] | {filename,status} | tojson'`
 * の出力形式と一致させ、複数ページに分かれても安全にパースできるようにしている）:
 *   printf '%s\n' '{"filename":"supabase/migrations/x.sql","status":"added"}' \
 *     | node scripts/ci/check-destructive-migration.mjs --stdin
 *   ... --github-output を付けると GITHUB_OUTPUT 向けの `key=value` 行を出す
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_PREFIX = 'supabase/migrations/';

/**
 * 検出パターン。`kind` はラベル・コメント文面で使う識別子。
 * SQL コメント行（`--`）を先に除去してから判定する（コメント中の DROP 言及で
 * 誤検知しないため）。
 */
// risk-reviewer 指摘（#2271/#2272 push前反証レビュー）: DELETE FROM / DROP POLICY /
// REVOKE / RENAME は DROP TABLE 等と同等かそれ以上に不可逆・認可漏れに直結するため追加した。
// rls-snapshot:check は DROP POLICY / REVOKE を「snapshot 未更新なら検出する」が、
// snapshot を同一 PR で再生成されると素通りするため、ここでも独立に検知する。
const PATTERNS = [
  { kind: 'DROP_TABLE', re: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { kind: 'DROP_COLUMN', re: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { kind: 'DELETE_FROM', re: /\bDELETE\s+FROM\b/i, label: 'DELETE FROM（データ削除）' },
  { kind: 'TRUNCATE', re: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
  { kind: 'DROP_POLICY', re: /\bDROP\s+POLICY\b/i, label: 'DROP POLICY（RLS 境界の削除）' },
  { kind: 'REVOKE', re: /\bREVOKE\b/i, label: 'REVOKE（権限の剥奪、意図した縮小か要確認）' },
  {
    kind: 'RENAME',
    re: /\bRENAME\s+(COLUMN|TO)\b/i,
    label: 'RENAME（クライアント契約の破壊的変更）',
  },
  { kind: 'DROP_FUNCTION', re: /\bDROP\s+FUNCTION\b/i, label: 'DROP FUNCTION' },
  { kind: 'DROP_TRIGGER', re: /\bDROP\s+TRIGGER\b/i, label: 'DROP TRIGGER' },
  { kind: 'DROP_CONSTRAINT', re: /\bDROP\s+CONSTRAINT\b/i, label: 'DROP CONSTRAINT' },
  {
    kind: 'ALTER_COLUMN_TYPE',
    re: /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i,
    label: '列の型変更（narrowing かどうかは目視確認が必要）',
  },
];

function stripSqlLineComments(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * @param {string} sql migration ファイルの内容
 * @returns {{ kind: string, label: string, line: number, snippet: string }[]}
 */
export function detectDestructivePatterns(sql) {
  const cleaned = stripSqlLineComments(sql);
  const lines = cleaned.split('\n');
  const findings = [];
  const seen = new Set();

  const record = (kind, label, line, snippet) => {
    const key = `${kind}:${line}`;
    if (seen.has(key)) return; // 同一行内マッチと後段の全文パスの重複を防ぐ
    seen.add(key);
    findings.push({ kind, label, line, snippet: snippet.trim().slice(0, 200) });
  };

  lines.forEach((line, index) => {
    for (const { kind, re, label } of PATTERNS) {
      if (re.test(line)) {
        record(kind, label, index + 1, line);
      }
    }
  });

  // risk-reviewer 指摘: 整形された SQL は `ALTER TABLE x\n  ALTER COLUMN y\n  TYPE z;` の
  // ように句が複数行へ折り返されることがあり、行単位の検査だけでは false negative になる。
  // 各行の連結オフセットを記録した上で空白正規化した全文にも一度マッチさせ、マッチ開始位置を
  // 含む行へ逆引きする（近似ではなく厳密な offset -> line マッピング）。
  const lineOffsets = [];
  let flattened = '';
  lines.forEach((line, index) => {
    lineOffsets.push({ offset: flattened.length, line: index + 1 });
    flattened += `${line} `;
  });
  const lineForOffset = (offset) => {
    let result = 1;
    for (const entry of lineOffsets) {
      if (entry.offset > offset) break;
      result = entry.line;
    }
    return result;
  };

  for (const { kind, re, label } of PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let match = globalRe.exec(flattened);
    while (match !== null) {
      record(kind, label, lineForOffset(match.index), match[0]);
      match = globalRe.exec(flattened);
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * @param {{ path: string, status: string, content: string }[]} files
 * @returns {{ path: string, findings: ReturnType<typeof detectDestructivePatterns> }[]}
 */
export function checkFiles(files) {
  const results = [];
  for (const file of files) {
    if (file.status !== 'added') continue;
    if (!file.path.startsWith(MIGRATIONS_PREFIX)) continue;
    const findings = detectDestructivePatterns(file.content);
    if (findings.length > 0) {
      results.push({ path: file.path, findings });
    }
  }
  return results;
}

export function formatSummary(results) {
  if (results.length === 0) {
    return '## Migration safety\n\n✅ 破壊的変更を検知しませんでした（新規追加 migration なし、または該当パターンなし）。\n';
  }
  const lines = [
    '## Migration safety',
    '',
    '⚠️ 新規追加された migration に破壊的変更の可能性があるパターンを検知しました。',
    '',
  ];
  for (const { path, findings } of results) {
    lines.push(`### \`${path}\``);
    for (const f of findings) {
      lines.push(`- L${f.line} **${f.label}**: \`${f.snippet}\``);
    }
    lines.push('');
  }
  lines.push(
    '本番へのこの種の変更は `CLAUDE.md` §協働のかたち の `EXPLICIT AUTHORITY`（明示指示 + 独立レビュー + dry-run/backup）を要する。',
  );
  return `${lines.join('\n')}\n`;
}

export function formatGithubOutput(results) {
  const destructive = results.length > 0 ? 'true' : 'false';
  return `destructive=${destructive}\n`;
}

// ─── CLI ────────────────────────────────────────────────────────────

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const githubOutput = args.includes('--github-output');

  if (!useStdin) {
    process.stderr.write('usage: check-destructive-migration.mjs --stdin < files.ndjson\n');
    process.exitCode = 1;
  } else {
    const raw = await readStdin();
    // risk-reviewer 指摘（#2271/#2272 push前反証レビュー）: `gh api --paginate` は
    // ページごとに jq filter を適用して stdout へ流すため、単一 JSON 配列へ包む filter
    // （`[.[] | {...}]`）を使うと複数ページで `[{...}]\n[{...}]` になり JSON.parse が
    // 例外を投げる。この経路を「JSON が壊れている = 検知なし」として fail open すると
    // 複数ページの PR で「安全」という誤った肯定シグナルを積極的に出してしまう。
    // NDJSON（1 行 1 JSON object、`--jq '.[] | {...} | tojson'` の出力形式）へ変更し、
    // ページ境界に対して安全にする。行単位でパースし、壊れた行はスキップして stderr に出す
    // （呼び出し元の workflow 側で「fetch 自体が失敗したか」は別途明示的に判定する）。
    /** @type {{ filename: string, status: string }[]} */
    const entries = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch (error) {
        process.stderr.write(
          `[check-destructive-migration] skipping unparsable line: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      }
    }

    const files = entries
      .filter(
        (e) => e && typeof e.filename === 'string' && e.filename.startsWith(MIGRATIONS_PREFIX),
      )
      .map((e) => {
        let content = '';
        try {
          content = readFileSync(resolve(ROOT, e.filename), 'utf8');
        } catch {
          // 削除・rename されたファイル等、ローカルに存在しない場合は空扱い（検知なし）
          content = '';
        }
        return { path: e.filename, status: e.status, content };
      });

    const results = checkFiles(files);

    if (githubOutput) {
      process.stdout.write(formatGithubOutput(results));
    } else {
      process.stdout.write(formatSummary(results));
    }
  }
}
