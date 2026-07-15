#!/usr/bin/env node
/**
 * eagle-sync: Storybook スナップショット → Eagle 自動同期
 *
 * 処理フロー:
 *   1. screenshots/ 内の .png ファイルを走査
 *   2. ファイル名をパースしてメタデータ抽出
 *   3. Eagle内の既存アイテムを検索
 *   4. 既存あり → deprecated化 + Archive移動
 *   5. 新規追加 → タグ・メモ自動設定
 *   6. レポート出力
 *
 * Usage:
 *   npx tsx scripts/eagle-sync.ts                    # screenshots/ から同期
 *   npx tsx scripts/eagle-sync.ts --dry-run          # 実際には変更しない
 *   npx tsx scripts/eagle-sync.ts --dir ./my-shots   # カスタムディレクトリ
 *   npx tsx scripts/eagle-sync.ts --setup            # フォルダ構造+スマートフォルダ初期作成
 *   npx tsx scripts/eagle-sync.ts --version v0.25    # バージョンタグ指定
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addItemFromPath,
  addTags,
  addToFolders,
  checkConnection,
  createFolder,
  createSmartFolder,
  findFolderByPath,
  getFolderList,
  removeFromFolders,
  removeTags,
  searchByTags,
  type EagleFolder,
} from './eagle-api.js';

import {
  buildAnnotation,
  EAGLE_FEATURE_TAGS,
  isSkippable,
  parseScreenshotFilename,
  type ParsedScreenshot,
} from './parse-filename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  screenshotDir: path.join(ROOT, 'screenshots'),
  storybookPort: 6006,
  sourceBasePath: 'src/components',
  archiveFolderPath: 'Archive',
  defaultStar: 3,
};

// ─────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SETUP_ONLY = args.includes('--setup');

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

const screenshotDir = getArgValue('--dir') ?? DEFAULT_CONFIG.screenshotDir;
const versionTag = getArgValue('--version');

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────

function fileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
}

function log(msg: string) {
  console.log(`[eagle-sync] ${msg}`);
}

function logDry(msg: string) {
  if (DRY_RUN) console.log(`  [DRY RUN] ${msg}`);
}

// ─────────────────────────────────────────────────────────
// Folder Structure
// ─────────────────────────────────────────────────────────

/** --setup 時に作る基盤フォルダ（コンポーネント系はスクショから動的作成） */
const BASE_FOLDERS = [
  'Inspiration',
  'Inspiration/Timeboxing',
  'Inspiration/Dashboard',
  'Inspiration/Mobile UX',
  'Marketing',
  'Marketing/Product Hunt',
  'Marketing/LP',
  'Marketing/Social',
  'Archive',
];

/**
 * フォルダパスが存在しなければ再帰的に作成し、path → id のマップを返す。
 * Storybook の階層をそのまま Eagle フォルダに反映する。
 */
async function ensureFolderPath(
  folderPath: string,
  roots: EagleFolder[],
  pathToId: Map<string, string>,
): Promise<string> {
  // キャッシュにあればそのまま返す
  const cached = pathToId.get(folderPath);
  if (cached) return cached;

  // 既存フォルダを探す
  const existing = findFolderByPath(folderPath, roots);
  if (existing) {
    pathToId.set(folderPath, existing.id);
    return existing.id;
  }

  // 親フォルダを先に確保
  const parts = folderPath.split('/');
  const name = parts[parts.length - 1];
  let parentId: string | undefined;

  if (parts.length > 1) {
    const parentPath = parts.slice(0, -1).join('/');
    parentId = await ensureFolderPath(parentPath, roots, pathToId);
  }

  if (DRY_RUN) {
    logDry(`Would create folder: ${folderPath}`);
    const dryId = `dry-run-${folderPath}`;
    pathToId.set(folderPath, dryId);
    return dryId;
  }

  log(`📁 Creating folder: ${folderPath}`);
  const created = await createFolder({ name, parentId });
  pathToId.set(folderPath, created.id);
  return created.id;
}

/** 基盤フォルダ（Inspiration, Marketing, Archive）を作成 */
async function ensureBaseFolders(
  roots: EagleFolder[],
  pathToId: Map<string, string>,
): Promise<void> {
  for (const folderPath of BASE_FOLDERS) {
    await ensureFolderPath(folderPath, roots, pathToId);
  }
}

// ─────────────────────────────────────────────────────────
// Smart Folder Setup
// ─────────────────────────────────────────────────────────

/** 設計書 §1.3 のスマートフォルダを作成 */
async function setupSmartFolders(): Promise<void> {
  const smartFolders = [
    {
      name: '🔍 要レビュー',
      conditions: [
        {
          match: 'AND' as const,
          rules: [
            { property: 'tags', method: 'contain', value: ['current'] },
            { property: 'rating', method: '<=', value: 3 },
          ],
        },
      ],
    },
    {
      name: '🌙 Darkモード全件',
      conditions: [
        {
          match: 'AND' as const,
          rules: [{ property: 'tags', method: 'contain', value: ['dark'] }],
        },
      ],
    },
    {
      name: '⚠️ ブランドカラー逸脱候補',
      conditions: [
        {
          match: 'AND' as const,
          rules: [{ property: 'tags', method: 'contain', value: ['color-check'] }],
        },
      ],
    },
  ];

  for (const sf of smartFolders) {
    if (DRY_RUN) {
      logDry(`Would create smart folder: ${sf.name}`);
    } else {
      log(`🔍 Creating smart folder: ${sf.name}`);
      await createSmartFolder(sf);
    }
  }
}

// ─────────────────────────────────────────────────────────
// Tag Group Setup
// ─────────────────────────────────────────────────────────

/** タググループを作成してサイドバーに構造を与える */
async function setupTagGroups(): Promise<void> {
  const groups = [
    {
      name: 'Status',
      tags: ['current', 'deprecated', 'draft'],
      iconColor: 'green' as const,
    },
    {
      name: 'Theme',
      tags: ['light', 'dark'],
      iconColor: 'blue' as const,
    },
    {
      name: 'Viewport',
      tags: ['mobile', 'desktop'],
      iconColor: 'purple' as const,
    },
    {
      name: 'Feature',
      tags: [...EAGLE_FEATURE_TAGS],
      iconColor: 'orange' as const,
    },
    {
      name: 'Type',
      tags: ['component', 'marketing', 'brand', 'inspiration'],
      iconColor: 'aqua' as const,
    },
  ];

  for (const group of groups) {
    if (DRY_RUN) {
      logDry(`Would create tag group: ${group.name} (${group.tags.length} tags)`);
    } else {
      log(`🏷️ Creating tag group: ${group.name}`);
      try {
        await createTagGroup(group);
      } catch (e) {
        log(`⚠️  Tag group "${group.name}" の作成に失敗: ${(e as Error).message}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────
// Screenshot Discovery
// ─────────────────────────────────────────────────────────

interface ScreenshotFile {
  absolutePath: string;
  filename: string;
  parsed: ParsedScreenshot;
  hash: string;
}

function discoverScreenshots(dir: string): ScreenshotFile[] {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    throw new Error(`Screenshot directory not found: ${absDir}`);
  }

  const files = fs.readdirSync(absDir).filter((f) => /\.png$/i.test(f));
  const results: ScreenshotFile[] = [];

  for (const filename of files) {
    // スキップ対象をフィルタ
    if (isSkippable(filename)) {
      log(`⏭️  Skip (not design asset): ${filename}`);
      continue;
    }

    try {
      const absolutePath = path.join(absDir, filename);
      const parsed = parseScreenshotFilename(filename);
      const hash = fileHash(absolutePath);

      // バージョンタグを追加
      if (versionTag && !parsed.tags.includes(versionTag)) {
        parsed.tags.push(versionTag);
      }

      results.push({ absolutePath, filename, parsed, hash });
    } catch (e) {
      log(`⚠️  Skipping ${filename}: ${(e as Error).message}`);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// Sync Logic
// ─────────────────────────────────────────────────────────

interface SyncResult {
  filename: string;
  action: 'added' | 'skipped' | 'error';
  deprecatedCount: number;
  error?: string;
}

interface SyncReport {
  results: SyncResult[];
  totalAdded: number;
  totalDeprecated: number;
  totalSkipped: number;
  totalErrors: number;
  duration: number;
}

async function syncScreenshots(
  screenshots: ScreenshotFile[],
  folderMap: Map<string, string>,
  folderRoots: EagleFolder[],
): Promise<SyncReport> {
  const startTime = Date.now();
  const results: SyncResult[] = [];
  let totalDeprecated = 0;

  const archiveFolderId = folderMap.get(DEFAULT_CONFIG.archiveFolderPath);

  for (const shot of screenshots) {
    try {
      // フォルダを動的に確保（なければ作成）
      const targetFolderId = await ensureFolderPath(shot.parsed.folderPath, folderRoots, folderMap);

      // 既存アイテム検索（current + 同コンポーネント）
      const searchTags = ['current', shot.parsed.componentName];
      if (shot.parsed.theme) searchTags.push(shot.parsed.theme);
      if (shot.parsed.viewport) searchTags.push(shot.parsed.viewport);

      const rawItems = await searchByTags(searchTags, {
        folders: [targetFolderId],
      });
      // Eagle REST API はタグを OR で返すため、クライアント側で AND フィルタ
      const existingItems = rawItems.filter((item) =>
        searchTags.every((t) => item.tags.includes(t)),
      );

      // ハッシュ比較で変更なしならスキップ
      const unchanged = existingItems.find((item) =>
        item.annotation?.includes(`storycap-hash: ${shot.hash}`),
      );

      if (unchanged) {
        results.push({
          filename: shot.filename,
          action: 'skipped',
          deprecatedCount: 0,
        });
        continue;
      }

      // 既存アイテムを deprecated 化
      let deprecatedCount = 0;
      for (const existing of existingItems) {
        if (DRY_RUN) {
          logDry(`Would deprecate: ${existing.name}`);
        } else {
          await removeTags([existing.id], ['current']);
          await addTags([existing.id], ['deprecated']);

          if (archiveFolderId) {
            await removeFromFolders([existing.id], [targetFolderId]);
            await addToFolders([existing.id], [archiveFolderId]);
          }

          log(`📦 Deprecated: ${existing.name}`);
        }
        deprecatedCount++;
      }
      totalDeprecated += deprecatedCount;

      // 新規追加
      const annotation = buildAnnotation({
        parsed: shot.parsed,
        storybookPort: DEFAULT_CONFIG.storybookPort,
        sourceBasePath: DEFAULT_CONFIG.sourceBasePath,
        capturedAt: new Date(),
        hash: shot.hash,
      });

      if (DRY_RUN) {
        logDry(`Would add: ${shot.filename} → ${shot.parsed.folderPath}`);
        logDry(`  Tags: [${shot.parsed.tags.join(', ')}]`);
        logDry(`  Annotation:\n${annotation}`);
      } else {
        await addItemFromPath({
          path: shot.absolutePath,
          name: shot.parsed.baseName,
          tags: shot.parsed.tags,
          folders: [targetFolderId],
          annotation,
          star: DEFAULT_CONFIG.defaultStar,
        });

        log(`✅ Added: ${shot.filename} → ${shot.parsed.folderPath}`);
      }

      results.push({
        filename: shot.filename,
        action: 'added',
        deprecatedCount,
      });
    } catch (e) {
      const errorMsg = (e as Error).message;
      log(`❌ Error: ${shot.filename}: ${errorMsg}`);
      results.push({
        filename: shot.filename,
        action: 'error',
        deprecatedCount: 0,
        error: errorMsg,
      });
    }
  }

  const duration = Date.now() - startTime;

  return {
    results,
    totalAdded: results.filter((r) => r.action === 'added').length,
    totalDeprecated,
    totalSkipped: results.filter((r) => r.action === 'skipped').length,
    totalErrors: results.filter((r) => r.action === 'error').length,
    duration,
  };
}

// ─────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────

function printReport(report: SyncReport) {
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 Sync Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Added:      ${report.totalAdded}`);
  console.log(`  📦 Deprecated: ${report.totalDeprecated}`);
  console.log(`  ⏭️  Skipped:    ${report.totalSkipped}`);
  console.log(`  ❌ Errors:     ${report.totalErrors}`);
  console.log(`  ⏱️  Duration:   ${(report.duration / 1000).toFixed(1)}s`);
  console.log();

  if (report.totalErrors > 0) {
    console.log('  Errors:');
    for (const r of report.results) {
      if (r.action === 'error') {
        console.log(`    - ${r.filename}: ${r.error}`);
      }
    }
    console.log();
  }

  if (report.totalAdded > 0) {
    console.log('  Added:');
    const added = report.results.filter((r) => r.action === 'added');
    for (const r of added.slice(0, 15)) {
      console.log(`    + ${r.filename}`);
    }
    if (added.length > 15) {
      console.log(`    ... and ${added.length - 15} more`);
    }
    console.log();
  }
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  eagle-sync: Storybook → Eagle 同期');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (DRY_RUN) console.log('  ⚠️  DRY RUN モード（変更なし）');
  if (SETUP_ONLY) console.log('  🔧 SETUP モード（フォルダ構造のみ）');
  console.log();

  // 1. Eagle接続確認
  log('Connecting to Eagle...');
  const connected = await checkConnection();
  if (!connected) {
    console.error('❌ Eagle に接続できません。Eagle アプリが起動しているか確認してください。');
    process.exit(1);
  }
  log('✅ Eagle connected.');

  // 2. フォルダ構造の確認
  log('Checking folder structure...');
  const folders = await getFolderList();
  const folderMap = new Map<string, string>();

  // 3. --setup モード: 基盤フォルダ + スマートフォルダ + タググループ作成して終了
  if (SETUP_ONLY) {
    log('Setting up base folders...');
    await ensureBaseFolders(folders, folderMap);
    log(`✅ ${folderMap.size} base folders ready.`);

    log('Setting up smart folders...');
    await setupSmartFolders();

    log('Setting up tag groups...');
    await setupTagGroups();

    log('✅ Setup complete.');
    return;
  }

  // 4. Archive フォルダを確保
  await ensureFolderPath('Archive', folders, folderMap);

  // 5. スクリーンショット検出
  log(`Scanning ${screenshotDir}...`);
  const screenshots = discoverScreenshots(screenshotDir);
  log(`Found ${screenshots.length} screenshots.`);

  if (screenshots.length === 0) {
    log('Nothing to sync.');
    return;
  }

  // 6. 同期実行（フォルダは同期中に動的作成）
  log('Syncing to Eagle...');
  const report = await syncScreenshots(screenshots, folderMap, folders);

  // 6. レポート
  printReport(report);

  if (report.totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
