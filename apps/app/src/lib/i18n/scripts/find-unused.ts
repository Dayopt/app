#!/usr/bin/env node

/**
 * 未使用 i18n キー検出スクリプト
 *
 * コードベースで使用されていない翻訳キーを検出します。
 *
 * 使用方法:
 *   npx tsx src/platform/i18n/scripts/find-unused.ts
 *   npm run i18n:unused
 */

import { readdir, readFile } from 'fs/promises';
import { glob } from 'glob';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..', '..', '..', '..');
const MESSAGES_DIR = join(ROOT_DIR, 'messages');
const SRC_DIR = join(ROOT_DIR, 'src');

/**
 * JSONオブジェクトからすべてのキーパスを抽出
 */
function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * すべての翻訳キーを取得（en をベースに）
 */
async function getAllTranslationKeys(): Promise<Set<string>> {
  const localeDir = join(MESSAGES_DIR, 'en');
  const files = await readdir(localeDir);
  const allKeys = new Set<string>();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = join(localeDir, file);
    const content = await readFile(filePath, 'utf-8');
    const json = JSON.parse(content) as Record<string, unknown>;
    const keys = extractKeys(json);

    keys.forEach((key) => allKeys.add(key));
  }

  return allKeys;
}

/**
 * ソースコードからt()関数の引数を抽出
 */
function extractUsedKeys(content: string): string[] {
  const keys: string[] = [];

  // t('key'), t("key"), t(`key`)
  const patterns: RegExp[] = [
    /\bt\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\bt\(\s*['"`]([^'"`]+)['"`]\s*,/g,
    // getTranslations の namespace 指定後の使用
    // useTranslations('namespace') 後の t('key') は namespace.key になる
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) keys.push(match[1]);
    }
  }

  return keys;
}

/**
 * ソースファイルから使用されているキーを収集
 */
async function getUsedKeys(): Promise<Set<string>> {
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: SRC_DIR,
    ignore: ['**/*.d.ts', '**/node_modules/**'],
  });

  const usedKeys = new Set<string>();

  for (const file of files) {
    const filePath = join(SRC_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const keys = extractUsedKeys(content);

    keys.forEach((key) => usedKeys.add(key));
  }

  return usedKeys;
}

/**
 * キーの親パスをすべて取得
 */
function getParentPaths(key: string): string[] {
  const parts = key.split('.');
  const paths: string[] = [];

  for (let i = 1; i <= parts.length; i++) {
    paths.push(parts.slice(0, i).join('.'));
  }

  return paths;
}

async function main(): Promise<void> {
  console.log('🔍 未使用 i18n キーを検索中...\n');

  const [allKeys, usedKeys] = await Promise.all([getAllTranslationKeys(), getUsedKeys()]);

  console.log(`📊 統計:`);
  console.log(`   定義されているキー: ${allKeys.size}`);
  console.log(`   コードで参照されているキー: ${usedKeys.size}\n`);

  // 使用されているキーとその親パスを収集
  const usedWithParents = new Set<string>();
  for (const key of usedKeys) {
    getParentPaths(key).forEach((p) => usedWithParents.add(p));
  }

  // 未使用キーを検出
  const unused: string[] = [];
  for (const key of allKeys) {
    // キー自体が使用されていない、かつ親パスとしても使用されていない
    if (!usedWithParents.has(key)) {
      unused.push(key);
    }
  }

  // ドメイン別にグループ化
  const byDomain = new Map<string, string[]>();
  for (const key of unused) {
    const domain = key.split('.')[0] ?? 'unknown';
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(key);
  }

  if (unused.length === 0) {
    console.log('✅ 未使用のキーは見つかりませんでした');
    return;
  }

  console.log(`⚠️  ${unused.length} 件の未使用キーが見つかりました:\n`);

  for (const [domain, keys] of [...byDomain.entries()].sort()) {
    console.log(`📁 ${domain} (${keys.length}件)`);
    keys.sort().forEach((key) => console.log(`   - ${key}`));
    console.log();
  }

  console.log('='.repeat(50));
  console.log('\n💡 ヒント:');
  console.log('   - 動的キー（t(`prefix.${var}`)）は検出できません');
  console.log('   - namespace指定後のキーは部分一致で検出されます');
  console.log('   - 削除前に手動で使用箇所を確認してください');
}

main().catch((err: unknown) => {
  console.error('エラー:', err);
  process.exit(1);
});
