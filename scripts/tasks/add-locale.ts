/**
 * 新言語追加スクリプト
 *
 * EN翻訳をテンプレートとして、新しいlocale用のメッセージファイルを生成する。
 * 値は "[TRANSLATE] {英語テキスト}" 形式で埋めるため、未翻訳箇所が一目でわかる。
 *
 * 使い方:
 *   npx tsx scripts/tasks/add-locale.ts <locale>
 *
 * 例:
 *   npx tsx scripts/tasks/add-locale.ts ko    # 韓国語を追加
 *   npx tsx scripts/tasks/add-locale.ts es    # スペイン語を追加
 *
 * 生成後に必要な手順:
 *   1. messages/<locale>/ の各JSONファイルを翻訳
 *   2. src/platform/i18n/routing.ts の locales 配列に追加
 *   3. npm run lint:i18n で整合性を確認
 */

import fs from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = resolve(__dirname, '../..', 'apps/product/messages');
const SOURCE_LOCALE = 'en';

function markForTranslation(obj: unknown, prefix = ''): unknown {
  if (typeof obj === 'string') {
    return `[TRANSLATE] ${obj}`;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) => markForTranslation(item, `${prefix}[${i}]`));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = markForTranslation(value, prefix ? `${prefix}.${key}` : key);
    }
    return result;
  }
  return obj;
}

function main() {
  const locale = process.argv[2];

  if (!locale) {
    console.error('使い方: npx tsx scripts/tasks/add-locale.ts <locale>');
    console.error('例:     npx tsx scripts/tasks/add-locale.ts ko');
    process.exit(1);
  }

  // バリデーション
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    console.error(`無効なlocale形式: "${locale}" (例: ko, es, zh-CN)`);
    process.exit(1);
  }

  const targetDir = path.join(MESSAGES_DIR, locale);

  if (fs.existsSync(targetDir)) {
    console.error(`messages/${locale}/ は既に存在します`);
    process.exit(1);
  }

  const sourceDir = path.join(MESSAGES_DIR, SOURCE_LOCALE);
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.json'));

  fs.mkdirSync(targetDir, { recursive: true });

  let totalKeys = 0;

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    const marked = markForTranslation(content);
    const targetPath = path.join(targetDir, file);

    fs.writeFileSync(targetPath, JSON.stringify(marked, null, 2) + '\n', 'utf-8');

    const keyCount = JSON.stringify(content).split('"').length; // rough estimate
    totalKeys += keyCount;
    console.log(`  ✅ ${file}`);
  }

  console.log('');
  console.log(`📁 messages/${locale}/ を作成しました（${files.length} ファイル）`);
  console.log('');
  console.log('次のステップ:');
  console.log(`  1. messages/${locale}/ の各JSONファイルを翻訳`);
  console.log(`     （未翻訳の値は "[TRANSLATE] ..." で始まります）`);
  console.log(`  2. src/platform/i18n/routing.ts の locales に '${locale}' を追加`);
  console.log('  3. npm run lint:i18n で整合性を確認');
}

main();
