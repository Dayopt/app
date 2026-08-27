#!/usr/bin/env node

/**
 * Destructive migration 検知 — PR に追加された `supabase/migrations/**` の新規ファイルを
 * 走査し、DROP TABLE / DROP COLUMN / TRUNCATE / 列の型変更（narrowing かどうかは
 * 機械では判定しないため、ALTER COLUMN ... TYPE を検知したら人間の確認対象として扱う）/
 * UPDATE backfill（#2433。migration 自身が実行する既存行の書き換え）を検出する。
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
  // #2433（台帳 第2段）: UPDATE backfill を検知対象へ追加する。第8段（色再割当て等）が
  // 持ち込む「既存行の書き換え」は DROP と同じく forward-only で、code revert では戻らない
  // （backup restore しかない）。それが検知されないまま通る状態を、来る前に塞ぐ。
  //
  // `topLevelOnly` — この repo の migration は大半が SECURITY DEFINER 関数の定義を含む
  // （public に definer 関数が 126 個ある実測）。関数本体の UPDATE は RPC のロジックであって
  // backfill ではないため、素朴に照合すると事実上すべての migration に発火し、checker が
  // 「常に警告が出るから読まない」状態＝ノイズになる。関数・プロシージャの本体だけを
  // 除外したテキストに対して照合する（`DO $$ ... $$` の匿名ブロックは migration 自身が
  // 実行するので**除外しない**。ここを外すと `DO $$ BEGIN UPDATE ... END $$;` という
  // backfill の書き方が丸ごと素通りする）。判定は「DO ブロックか否か」を文の先頭で見る
  // （`CREATE FUNCTION` の含有で見るとコメント内の同語で騙される。risk-reviewer 指摘）。
  //
  // `SET` を必須にすることで `ON UPDATE CASCADE` / `FOR UPDATE` / `BEFORE UPDATE ON` /
  // `CREATE POLICY ... FOR UPDATE` / `GRANT UPDATE ON` / `has_table_privilege(..,'UPDATE')`
  // がすべて外れる。省略可能な別名（`UPDATE t AS x SET` / `UPDATE t x SET`）と
  // `UPDATE ONLY t SET` は拾う。
  // 同じ「既存行の書き換え」を別構文で書いたもの。第8段の色再割当ては upsert 形で
  // 書かれうるため、UPDATE だけ塞いでも素通りする（push 前反証の risk-reviewer 指摘）。
  {
    kind: 'UPSERT_BACKFILL',
    re: /\bON\s+CONFLICT\b[\s\S]{0,200}?\bDO\s+UPDATE\s+SET\b/i,
    label: 'upsert backfill（ON CONFLICT DO UPDATE SET。既存行を書き換える）',
    topLevelOnly: true,
  },
  {
    kind: 'MERGE_BACKFILL',
    re: /\bMERGE\s+INTO\b[\s\S]{0,400}?\bWHEN\s+MATCHED\b[\s\S]{0,80}?\bTHEN\s+(?:UPDATE\s+SET|DELETE)\b/i,
    label: 'MERGE backfill（WHEN MATCHED THEN UPDATE / DELETE。既存行を書き換える）',
    topLevelOnly: true,
  },
  {
    kind: 'UPDATE_BACKFILL',
    re: /\bUPDATE\s+(?:ONLY\s+)?[\w".]+(?:\s+(?:AS\s+)?(?!SET\b)[\w"]+)?\s+SET\b/i,
    label: 'UPDATE backfill（既存行の書き換え。forward-only、code revert では戻らない）',
    topLevelOnly: true,
  },
];

function stripSqlLineComments(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * `topLevelOnly` パターン用のテキストを 1 パスで作る。
 *
 * 「migration 自身がその場で実行する SQL」だけを残し、それ以外（コメント・文字列リテラル・
 * 関数本体）を空白へ潰す。**文字数と改行位置を 1:1 で保つ**ので、呼び出し側の
 * offset -> line 逆引きは元テキストと共有できる。
 *
 * 層を重ねた正規表現ではなく単一の走査にしてある。前の実装はブロックコメント除去と
 * dollar-quote 判定を別パスでやっており、**dollar-quote の中にある `/*` を本物のコメント
 * 開始として扱ってしまう**穴があった（閉じ `*` + `/` が無ければファイル末尾まで潰れ、後続の
 * backfill が丸ごと消える）。状態を 1 つ持って左から舐めれば、その取り違えは構造的に起きない。
 *
 * 残すもの / 潰すもの:
 * - `-- 行コメント` … 潰す
 * - `/* ブロックコメント *' + '/` … 潰す。**閉じていなければ潰さない**（壊れた SQL で
 *   検知を失うより、余計に拾って人間に見せる方が安全側）
 * - `'文字列リテラル'` … 潰す（リテラル中の "UPDATE ... SET" で誤検知しないため）
 * - `$$ ... $$` … **匿名 `DO` ブロックだけ残す**。DO は migration がその場で実行する文なので
 *   中の UPDATE は本物の backfill。関数・プロシージャ本体は RPC のロジックなので潰す
 *
 * @param {string} sql 生の migration テキスト
 * @returns {string} 同じ長さ・同じ改行位置のテキスト
 */
function maskForTopLevelScan(sql) {
  const out = sql.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };

  let i = 0;
  // 直近の `;` の位置。dollar-quote が匿名 DO ブロックかを「文の先頭」で判定するのに使う。
  let stmtStart = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const nl = sql.indexOf('\n', i);
      const stop = nl === -1 ? sql.length : nl;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === '/' + '*') {
      const close = sql.indexOf('*' + '/', i + 2);
      if (close === -1) {
        // 閉じないブロックコメント。潰すとファイル末尾までの検知を失うので、
        // コメントとして扱わずそのまま進む（安全側 = 検知を残す）。
        i += 2;
        continue;
      }
      blank(i, close + 2);
      i = close + 2;
      continue;
    }

    if (sql[i] === "'") {
      // 単一引用符の文字列。'' はエスケープされた引用符。
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      const stop = Math.min(j + 1, sql.length);
      blank(i + 1, stop - 1);
      i = stop;
      continue;
    }

    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const bodyStart = i + tag.length;
      const close = sql.indexOf(tag, bodyStart);
      if (close === -1) {
        i += tag.length;
        continue;
      }
      // 文の**先頭**が DO なら匿名ブロック。含有ではなく先頭で見るので、直前のコメントや
      // 別の文に同じ語があっても騙されない。
      //
      // 判定は **`out`（ここまでマスク済みのテキスト）** に対して行う。生の `sql` を見ると、
      // 直前のブロックコメントが未除去のまま先頭一致に割り込み、`/* ... */\nDO $$` を
      // 「DO で始まっていない」と誤判定する（実測で再現）。`out` なら comment は既に
      // 空白へ潰れているので、先頭アンカーが期待どおり効く。
      const isAnonymousBlock = /^\s*DO\b/i.test(out.slice(stmtStart, i).join(''));
      if (!isAnonymousBlock) blank(bodyStart, close);
      i = close + tag.length;
      continue;
    }

    if (sql[i] === ';') stmtStart = i + 1;
    i += 1;
  }

  return out.join('');
}

/**
 * @param {string} sql migration ファイルの内容
 * @returns {{ kind: string, label: string, line: number, snippet: string }[]}
 */
export function detectDestructivePatterns(sql) {
  const cleaned = stripSqlLineComments(sql);
  // `topLevelOnly` パターン専用のテキスト。ブロックコメントと、匿名 DO ブロック以外の
  // dollar-quoted 本体を空白へ潰す（長さ・改行位置は `cleaned` と 1:1 のまま）ので、
  // 行分割・offset -> line 逆引きは両者で共有できる。
  const topLevelCleaned = maskForTopLevelScan(sql);
  const lines = cleaned.split('\n');
  const topLevelLines = topLevelCleaned.split('\n');
  const findings = [];
  const seen = new Set();

  const record = (kind, label, line, snippet) => {
    const key = `${kind}:${line}`;
    if (seen.has(key)) return; // 同一行内マッチと後段の全文パスの重複を防ぐ
    seen.add(key);
    findings.push({ kind, label, line, snippet: snippet.trim().slice(0, 200) });
  };

  lines.forEach((line, index) => {
    for (const { kind, re, label, topLevelOnly } of PATTERNS) {
      // 判定は scope に応じたテキストで行い、**表示する snippet は常に元の行**にする
      // （潰した空白を人間へ見せても意味が無い。マッチした時点でその範囲は非潰しなので、
      // 元の行を出しても取り違えは起きない）。
      const subject = topLevelOnly ? topLevelLines[index] : line;
      if (re.test(subject)) {
        record(kind, label, index + 1, line);
      }
    }
  });

  // risk-reviewer 指摘: 整形された SQL は `ALTER TABLE x\n  ALTER COLUMN y\n  TYPE z;` の
  // ように句が複数行へ折り返されることがあり、行単位の検査だけでは false negative になる。
  // 各行の連結オフセットを記録した上で空白正規化した全文にも一度マッチさせ、マッチ開始位置を
  // 含む行へ逆引きする（近似ではなく厳密な offset -> line マッピング）。
  // **2 つのテキストで offset を共有しない。** `stripSqlLineComments` は `--` 以降を
  // 削除して行を**短くする**ため、`cleaned` と `maskForTopLevelScan(sql)`（生の長さを
  // 保つ）では同じ行でも長さが違う。offset 表を共有すると topLevel 側のマッチ位置が
  // ずれ、ファイルの行数を超える行番号を報告する（実測で確認）。行**数**は一致するので、
  // 行単位の突き合わせだけは index で共有できる。
  const buildFlattened = (sourceLines) => {
    const offsets = [];
    let text = '';
    sourceLines.forEach((line, index) => {
      offsets.push({ offset: text.length, line: index + 1 });
      text += `${line} `;
    });
    return { text, offsets };
  };
  const lineForOffsetIn = (offsets, offset) => {
    let result = 1;
    for (const entry of offsets) {
      if (entry.offset > offset) break;
      result = entry.line;
    }
    return result;
  };

  const flat = buildFlattened(lines);
  const flatTopLevel = buildFlattened(topLevelLines);

  for (const { kind, re, label, topLevelOnly } of PATTERNS) {
    const { text, offsets } = topLevelOnly ? flatTopLevel : flat;
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let match = globalRe.exec(text);
    while (match !== null) {
      record(kind, label, lineForOffsetIn(offsets, match.index), match[0]);
      match = globalRe.exec(text);
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
