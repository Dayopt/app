#!/usr/bin/env node

/**
 * copy:check — Copy System 禁止表記スキャナー
 *
 * docs/glossary/forbidden-terms.md で定義された禁止語が messages に含まれていないかスキャンする。
 *
 * 動作モード:
 *   - デフォルト: 警告のみ (exit 0)。既存の違反が多いため、現在はリファクタリング移行中。
 *   - --strict: 違反があれば exit 1（Phase 2 messages 整理完了後に CI へ追加予定）
 *
 * Usage:
 *   pnpm copy:check
 *   pnpm copy:check --strict
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const MESSAGES_DIRS = [
  resolve(ROOT, 'apps/product/messages/ja'),
  resolve(ROOT, 'apps/web/messages/ja'),
];

const STRICT_MODE = process.argv.includes('--strict');

// ─── 禁止語定義 (docs/glossary/forbidden-terms.md と同期) ───

interface ForbiddenTerm {
  term: string;
  preferred: string;
  migration?: boolean;
  /** 値がこれらのパターンを含む場合は除外（文脈が正当） */
  excludePatterns?: string[];
}

/** 即座に使用を停止すべき語 */
const ACTIVE_FORBIDDEN: ForbiddenTerm[] = [
  { term: 'ラベル', preferred: 'タグ' },
  {
    term: 'レビュー',
    preferred: '振り返り（ページ名として）',
    // プレビュー / 法的レビュー / コードレビュー / AI インサイトのレビュー等は許容
    excludePatterns: ['プレビュー', '法的レビュー', 'レビューを受ける', 'レビューインサイト'],
  },
];

/** 移行中の語（現行 messages での使用はあるが、新規追加は禁止） */
const MIGRATION_TARGETS: ForbiddenTerm[] = [
  { term: 'タスク', preferred: 'エントリ', migration: true },
  { term: 'ログイン', preferred: 'サインイン', migration: true },
  { term: 'ログアウト', preferred: 'サインアウト', migration: true },
];

// ─── JSON 走査ユーティリティ ───

function getAllStringValues(obj: unknown, prefix = ''): Array<{ keyPath: string; value: string }> {
  const results: Array<{ keyPath: string; value: string }> = [];

  if (typeof obj === 'string') {
    results.push({ keyPath: prefix, value: obj });
  } else if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      results.push(...getAllStringValues(val, path));
    }
  }

  return results;
}

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

// ─── スキャン結果 ───

interface Finding {
  file: string;
  keyPath: string;
  value: string;
  term: string;
  preferred: string;
  migration: boolean;
}

const findings: Finding[] = [];

// ─── スキャン実行 ───

for (const messagesDir of MESSAGES_DIRS) {
  let files: string[];
  try {
    files = readdirSync(messagesDir).filter((f) => f.endsWith('.json'));
  } catch {
    continue;
  }

  for (const file of files) {
    const filePath = join(messagesDir, file);
    const relPath = relative(ROOT, filePath);
    const data = loadJson(filePath);
    const entries = getAllStringValues(data);

    for (const { keyPath, value } of entries) {
      for (const forbidden of [...ACTIVE_FORBIDDEN, ...MIGRATION_TARGETS]) {
        if (!value.includes(forbidden.term)) continue;
        if (forbidden.excludePatterns?.some((p) => value.includes(p))) continue;
        findings.push({
          file: relPath,
          keyPath,
          value,
          term: forbidden.term,
          preferred: forbidden.preferred,
          migration: forbidden.migration ?? false,
        });
      }
    }
  }
}

// ─── レポート出力 ───

const activeFindings = findings.filter((f) => !f.migration);
const migrationFindings = findings.filter((f) => f.migration);

console.log('\n── copy:check ──────────────────────────────────────');

if (activeFindings.length === 0 && migrationFindings.length === 0) {
  console.log('✅ 禁止表記なし\n');
  process.exit(0);
}

if (activeFindings.length > 0) {
  console.log(`\n⚠️  禁止表記 (${activeFindings.length} 件):`);
  for (const f of activeFindings) {
    console.log(`   ${f.file}`);
    console.log(`     キー: ${f.keyPath}`);
    console.log(`     値:   "${f.value}"`);
    console.log(`     禁止: "${f.term}" → 推奨: "${f.preferred}"\n`);
  }
}

if (migrationFindings.length > 0) {
  // 移行対象は語ごとにファイル集計して表示
  const byTerm = new Map<string, Set<string>>();
  for (const f of migrationFindings) {
    if (!byTerm.has(f.term)) byTerm.set(f.term, new Set());
    byTerm.get(f.term)!.add(f.file);
  }

  console.log(`\nℹ️  移行中（新規追加禁止、既存は Phase 2 で対応予定）:`);
  for (const [term, files] of byTerm) {
    const preferred = MIGRATION_TARGETS.find((t) => t.term === term)?.preferred ?? '';
    const count = migrationFindings.filter((f) => f.term === term).length;
    console.log(`   "${term}" → "${preferred}": ${count} 件 (${[...files].length} ファイル)`);
  }
  console.log();
}

console.log(
  `合計: ${activeFindings.length} 件の禁止表記、${migrationFindings.length} 件の移行対象`,
);
if (!STRICT_MODE) {
  console.log('(警告モード: --strict を付けると exit 1 になります)\n');
}

if (STRICT_MODE && activeFindings.length > 0) {
  process.exit(1);
}
