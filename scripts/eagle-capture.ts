#!/usr/bin/env node
/**
 * eagle-capture: Playwright で Storybook ストーリーをスクリーンショット撮影
 *
 * Storycap の代替。Storybook v10 + Playwright で直接撮影する。
 * Storybook が起動済みであること（localhost:6006）。
 *
 * Usage:
 *   npx tsx scripts/eagle-capture.ts                      # 全ストーリー撮影
 *   npx tsx scripts/eagle-capture.ts --limit 10           # 先頭10件のみ
 *   npx tsx scripts/eagle-capture.ts --filter "Button"    # タイトルにButtonを含むもの
 *   npx tsx scripts/eagle-capture.ts --theme dark         # darkテーマのみ
 *   npx tsx scripts/eagle-capture.ts --theme both         # light+dark両方（デフォルト）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const STORYBOOK_URL = 'http://localhost:6006';
const OUT_DIR = path.join(ROOT, 'screenshots');

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

/** スキップ対象のタイトルプレフィックス */
const SKIP_PREFIXES = ['Docs/', 'Patterns/'];

// ─────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

const LIMIT = Number(getArgValue('--limit')) || 0;
const FILTER = getArgValue('--filter') ?? '';
const THEME_ARG = getArgValue('--theme') ?? 'both';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

interface StoryIndex {
  v: number;
  entries: Record<string, StoryEntry>;
}

// ─────────────────────────────────────────────────────────
// Story Fetcher
// ─────────────────────────────────────────────────────────

async function fetchStoryIndex(): Promise<StoryEntry[]> {
  const res = await fetch(`${STORYBOOK_URL}/index.json`);
  if (!res.ok) {
    throw new Error(
      `Storybook index not available (${res.status}). Is Storybook running on ${STORYBOOK_URL}?`,
    );
  }

  const data = (await res.json()) as StoryIndex;
  const entries = Object.values(data.entries);

  return entries.filter((e) => {
    // story タイプのみ（docs を除外）
    if (e.type !== 'story') return false;
    // スキップ対象プレフィックス
    if (SKIP_PREFIXES.some((p) => e.title.startsWith(p))) return false;
    // フィルタ
    if (FILTER && !e.title.toLowerCase().includes(FILTER.toLowerCase())) {
      return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────
// Filename Builder
// ─────────────────────────────────────────────────────────

/**
 * ストーリーのタイトルと名前からファイル名を生成
 * 例: "Components/UI/Button" + "Primary" → "Components_UI_Button--Primary_light_mobile.png"
 */
function buildFilename(
  story: StoryEntry,
  theme: 'light' | 'dark',
  viewport: 'mobile' | 'desktop',
): string {
  const titlePart = story.title.replace(/\//g, '_').replace(/\s+/g, '');
  const namePart = story.name.replace(/\s+/g, '');
  return `${titlePart}--${namePart}_${theme}_${viewport}.png`;
}

// ─────────────────────────────────────────────────────────
// Viewport Strategy
// ─────────────────────────────────────────────────────────

/**
 * ビューポート戦略（Storybook カテゴリ準拠）
 *
 * mobile + desktop:
 *   - Features/Calendar/Views/ — Day/Week/Grid のページレイアウト
 *   - Features/Settings/       — 設定画面各種
 *   - Features/Stats/          — 統計タブ各種
 *   - Features/Auth/           — 認証画面
 *   - Features/Onboarding/     — オンボーディング
 *   - Components/Shell/Sidebar/ — デスクトップでレイアウトが変わる
 *
 * mobile のみ:
 *   - Components/UI/           — プリミティブ（レスポンシブ差分小）
 *   - Components/Common/       — ユーティリティ
 *   - Components/Shell/ (Sidebar以外) — BottomTabBar, AppHeader
 *   - Foundations/              — デザイントークン
 *   - その他 Feature の個別コンポーネント
 */
function getViewportsForStory(title: string): Array<'mobile' | 'desktop'> {
  // ページレベルの Feature 画面
  if (/Features\/Calendar\/Views\//i.test(title)) return ['mobile', 'desktop'];
  if (/Features\/Settings\//i.test(title)) return ['mobile', 'desktop'];
  if (/Features\/Stats\//i.test(title)) return ['mobile', 'desktop'];
  if (/Features\/Auth\//i.test(title)) return ['mobile', 'desktop'];
  if (/Features\/Onboarding\//i.test(title)) return ['mobile', 'desktop'];

  // Shell: Sidebar はデスクトップで大きく変わる
  if (/Components\/Shell\/Sidebar/i.test(title)) return ['mobile', 'desktop'];

  // それ以外: mobile のみ
  return ['mobile'];
}

// ─────────────────────────────────────────────────────────
// Capture
// ─────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[eagle-capture] ${msg}`);
}

async function captureAll() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  eagle-capture: Storybook Screenshot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (FILTER) console.log(`  🔍 Filter: "${FILTER}"`);
  if (LIMIT) console.log(`  📊 Limit: ${LIMIT}`);
  console.log(`  🎨 Theme: ${THEME_ARG}`);
  console.log();

  // 1. ストーリー一覧を取得
  log('Fetching story index...');
  let stories = await fetchStoryIndex();
  log(`Found ${stories.length} capturable stories.`);

  if (LIMIT > 0) {
    stories = stories.slice(0, LIMIT);
    log(`Limited to ${stories.length} stories.`);
  }

  // 2. 出力ディレクトリ準備
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 3. テーマ決定
  const themes: Array<'light' | 'dark'> =
    THEME_ARG === 'light' ? ['light'] : THEME_ARG === 'dark' ? ['dark'] : ['light', 'dark'];

  // 4. Playwright ブラウザ起動
  log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });

  let captured = 0;
  let skipped = 0;
  let errors = 0;
  const startTime = Date.now();

  try {
    for (const story of stories) {
      const viewports = getViewportsForStory(story.title);

      for (const theme of themes) {
        for (const viewport of viewports) {
          const filename = buildFilename(story, theme, viewport);
          const outPath = path.join(OUT_DIR, filename);

          try {
            const page = await context.newPage();

            // ビューポート設定
            await page.setViewportSize(VIEWPORTS[viewport]);

            // Storybook の iframe URL でストーリーをレンダリング
            // globals で dark モードを切り替え
            const storyUrl = `${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`;
            await page.goto(storyUrl, { waitUntil: 'networkidle' });

            // コンポーネントのレンダリング完了を少し待つ
            await page.waitForTimeout(300);

            // スクリーンショット撮影
            await page.screenshot({
              path: outPath,
              fullPage: false,
            });

            await page.close();
            captured++;

            if (captured % 50 === 0) {
              log(`Progress: ${captured} captured...`);
            }
          } catch (e) {
            errors++;
            log(`⚠️  Error: ${filename}: ${(e as Error).message.slice(0, 100)}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // 5. レポート
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📸 Capture Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Captured: ${captured}`);
  console.log(`  ❌ Errors:   ${errors}`);
  console.log(`  ⏱️  Duration: ${duration}s`);
  console.log(`  📁 Output:   ${OUT_DIR}`);
  console.log();

  if (errors > 0) {
    process.exit(1);
  }
}

captureAll().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
