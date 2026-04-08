#!/usr/bin/env node
/**
 * eagle-lookup: Eagle ライブラリ内のデザインアセットを検索
 *
 * Claude Code から「BottomSheet のデザイン見せて」等で呼ばれる。
 * Eagle MCP 経由でアイテムを検索し、メタデータを表示する。
 *
 * Usage:
 *   npx tsx scripts/eagle-lookup.ts button              # フルテキスト検索（AND/OR/NOT対応）
 *   npx tsx scripts/eagle-lookup.ts --tags button,dark  # タグで検索（AND）
 *   npx tsx scripts/eagle-lookup.ts --review            # ★3以下の要レビュー一覧
 *   npx tsx scripts/eagle-lookup.ts --recent            # 直近追加のアイテム
 *   npx tsx scripts/eagle-lookup.ts --ref bottom-sheet  # ref:タグでインスピ+実装を対比
 *   npx tsx scripts/eagle-lookup.ts --color-check       # ブランドカラー逸脱候補
 *   npx tsx scripts/eagle-lookup.ts --ai "minimal nav"  # AI セマンティック検索
 *   npx tsx scripts/eagle-lookup.ts --stats             # ライブラリ概要
 */

import {
  aiSearchByText,
  aiSearchStatus,
  checkConnection,
  countItems,
  queryItems,
  searchByTags,
  type EagleItem,
} from './eagle-api.js';

// ─────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

const TAGS_ARG = getArgValue('--tags');
const REF_ARG = getArgValue('--ref');
const AI_ARG = getArgValue('--ai');
const REVIEW_MODE = args.includes('--review');
const RECENT_MODE = args.includes('--recent');
const COLOR_CHECK_MODE = args.includes('--color-check');
const STATS_MODE = args.includes('--stats');
const FREE_TEXT = args.find((a) => !a.startsWith('--'));

// ─────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────

function displayItems(items: EagleItem[], title: string) {
  console.log();
  console.log(`━━━ ${title} (${items.length} items) ━━━`);
  console.log();

  if (items.length === 0) {
    console.log('  (no results)');
    return;
  }

  for (const item of items) {
    const stars = '★'.repeat(item.star || 0) + '☆'.repeat(5 - (item.star || 0));
    const tags = item.tags.join(', ');
    console.log(`  ${stars}  ${item.name}`);
    console.log(`         tags: [${tags}]`);

    if (item.annotation) {
      const lines = item.annotation.split('\n');
      for (const line of lines) {
        if (line.startsWith('storybook:') || line.startsWith('source:')) {
          console.log(`         ${line.trim()}`);
        }
      }
    }

    console.log(`         ext: ${item.ext}  ${item.width}x${item.height}`);
    console.log();
  }
}

// ─────────────────────────────────────────────────────────
// Search Modes
// ─────────────────────────────────────────────────────────

async function searchByFreeText(query: string): Promise<EagleItem[]> {
  return queryItems(query, { fullDetails: true });
}

async function searchByTagList(tagStr: string): Promise<EagleItem[]> {
  const tags = tagStr.split(',').map((t) => t.trim());
  const items = await searchByTags(tags, { limit: 200, fullDetails: true });
  return items.filter((item) => tags.every((t) => item.tags.includes(t)));
}

async function searchReview(): Promise<EagleItem[]> {
  const items = await searchByTags(['current', 'component'], { limit: 500, fullDetails: true });
  return items.filter((item) => (item.star ?? 0) <= 3);
}

async function searchRecent(): Promise<EagleItem[]> {
  const items = await searchByTags(['current'], { limit: 20, fullDetails: true });
  return items.sort((a, b) => b.modificationTime - a.modificationTime);
}

async function searchRef(componentName: string): Promise<EagleItem[]> {
  return searchByTags([`ref:${componentName}`], { limit: 50, fullDetails: true });
}

async function searchColorCheck(): Promise<EagleItem[]> {
  return searchByTags(['color-check'], { limit: 50 });
}

async function searchAi(query: string): Promise<EagleItem[]> {
  const status = await aiSearchStatus();
  if (!status.ready) {
    console.log(`  ⚠️  AI Search: ${status.status}（プラグインが有効でない可能性）`);
    console.log('  フォールバック: フルテキスト検索を使用');
    return queryItems(query);
  }
  return aiSearchByText(query, { limit: 20 });
}

async function showStats(): Promise<void> {
  const total = await countItems();
  const current = await countItems({ tags: ['current'] });
  const deprecated = await countItems({ tags: ['deprecated'] });
  const marketing = await countItems({ tags: ['marketing'] });

  console.log();
  console.log('━━━ 📊 ライブラリ概要 ━━━');
  console.log();
  console.log(`  Total:      ${total}`);
  console.log(`  Current:    ${current}`);
  console.log(`  Deprecated: ${deprecated}`);
  console.log(`  Marketing:  ${marketing}`);
  console.log();
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  const connected = await checkConnection();
  if (!connected) {
    console.error(
      '❌ Eagle MCP に接続できません。Eagle アプリと MCP プラグインが起動しているか確認してください。',
    );
    process.exit(1);
  }

  if (STATS_MODE) {
    await showStats();
  } else if (REVIEW_MODE) {
    const items = await searchReview();
    displayItems(items, '🔍 要レビュー（★3以下 + current）');
  } else if (RECENT_MODE) {
    const items = await searchRecent();
    displayItems(items, '📅 最近追加されたアイテム');
  } else if (COLOR_CHECK_MODE) {
    const items = await searchColorCheck();
    displayItems(items, '⚠️ ブランドカラー逸脱候補');
  } else if (AI_ARG) {
    const items = await searchAi(AI_ARG);
    displayItems(items, `🧠 AI Search: "${AI_ARG}"`);
  } else if (REF_ARG) {
    const items = await searchRef(REF_ARG);
    const inspirations = items.filter((i) => i.tags.includes('inspiration'));
    const components = items.filter((i) => i.tags.includes('component'));
    displayItems(inspirations, `🎨 参考UI (ref:${REF_ARG})`);
    displayItems(components, `🔧 実装 (ref:${REF_ARG})`);
  } else if (TAGS_ARG) {
    const items = await searchByTagList(TAGS_ARG);
    displayItems(items, `🏷️ Tags: ${TAGS_ARG}`);
  } else if (FREE_TEXT) {
    const items = await searchByFreeText(FREE_TEXT);
    displayItems(items, `🔎 Search: "${FREE_TEXT}"`);
  } else {
    console.log('Usage:');
    console.log('  npx tsx scripts/eagle-lookup.ts button             # フルテキスト検索');
    console.log('  npx tsx scripts/eagle-lookup.ts --tags dark,button  # タグ検索（AND）');
    console.log('  npx tsx scripts/eagle-lookup.ts --review            # 要レビュー一覧');
    console.log('  npx tsx scripts/eagle-lookup.ts --recent            # 直近追加');
    console.log('  npx tsx scripts/eagle-lookup.ts --ref bottom-sheet  # インスピ+実装対比');
    console.log('  npx tsx scripts/eagle-lookup.ts --color-check       # カラー逸脱候補');
    console.log('  npx tsx scripts/eagle-lookup.ts --ai "minimal nav"  # AI セマンティック検索');
    console.log('  npx tsx scripts/eagle-lookup.ts --stats             # ライブラリ概要');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
