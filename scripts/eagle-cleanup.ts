#!/usr/bin/env node
/**
 * eagle-cleanup: Archive 内の期限切れ deprecated アイテムを自動削除
 *
 * 設計書 §4.2 準拠:
 *   - 30日経過した deprecated アイテムは自動削除（moveToTrash）
 *   - ★5 のアイテムは保護対象から除外
 *
 * Usage:
 *   npx tsx scripts/eagle-cleanup.ts              # 確認プロンプト付き
 *   npx tsx scripts/eagle-cleanup.ts --dry-run    # プレビューのみ
 *   npx tsx scripts/eagle-cleanup.ts --days 60    # 保持日数カスタム
 *   npx tsx scripts/eagle-cleanup.ts --force      # 確認スキップ
 */

import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline/promises';

import {
  checkConnection,
  findFolderByPath,
  getFolderList,
  moveToTrash,
  searchByTags,
  type EagleItem,
} from './eagle-api.js';

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 50;
const PROTECTED_STAR = 5;

// ─────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

const retentionDays = Number(getArgValue('--days')) || DEFAULT_RETENTION_DAYS;

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[eagle-cleanup] ${msg}`);
}

function daysAgo(days: number): number {
  return Date.now() - days * 86_400_000;
}

// ─────────────────────────────────────────────────────────
// Cleanup Logic
// ─────────────────────────────────────────────────────────

interface CleanupReport {
  expired: EagleItem[];
  protected: EagleItem[];
  retained: EagleItem[];
  deleted: number;
}

async function findDeprecatedItems(archiveFolderId: string): Promise<EagleItem[]> {
  const allItems: EagleItem[] = [];
  let offset = 0;
  const limit = 200;

  // ページネーションで全件取得
  while (true) {
    const items = await searchByTags(['deprecated'], {
      folders: [archiveFolderId],
      limit,
      offset,
      fullDetails: true,
    });

    allItems.push(...items);

    if (items.length < limit) break;
    offset += limit;
  }

  return allItems;
}

function categorizeItems(items: EagleItem[]): CleanupReport {
  const cutoff = daysAgo(retentionDays);
  const expired: EagleItem[] = [];
  const protectedItems: EagleItem[] = [];
  const retained: EagleItem[] = [];

  for (const item of items) {
    if (item.star === PROTECTED_STAR) {
      protectedItems.push(item);
    } else if (item.modificationTime < cutoff) {
      expired.push(item);
    } else {
      retained.push(item);
    }
  }

  return { expired, protected: protectedItems, retained, deleted: 0 };
}

async function deleteExpired(items: EagleItem[]): Promise<number> {
  let deleted = 0;

  // バッチ処理
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const ids = batch.map((item) => item.id);

    await moveToTrash(ids);
    deleted += ids.length;

    log(`🗑️  Deleted batch: ${deleted}/${items.length}`);
  }

  return deleted;
}

async function confirmDeletion(count: number): Promise<boolean> {
  if (FORCE) return true;

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\n  ${count} 件のアイテムを削除します。続行しますか？ (y/N): `,
    );
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

// ─────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────

function printReport(report: CleanupReport) {
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧹 Cleanup Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🗑️  Deleted:   ${report.deleted}`);
  console.log(`  🛡️  Protected: ${report.protected.length} (★5)`);
  console.log(`  📦 Retained:  ${report.retained.length} (< ${retentionDays} days)`);
  console.log();

  if (report.expired.length > 0 && report.deleted === 0) {
    console.log('  Expired (would delete):');
    for (const item of report.expired.slice(0, 10)) {
      const age = Math.floor((Date.now() - item.modificationTime) / 86_400_000);
      console.log(`    - ${item.name} (${age} days old, ★${item.star})`);
    }
    if (report.expired.length > 10) {
      console.log(`    ... and ${report.expired.length - 10} more`);
    }
    console.log();
  }

  if (report.protected.length > 0) {
    console.log('  Protected (★5):');
    for (const item of report.protected.slice(0, 5)) {
      console.log(`    🛡️ ${item.name}`);
    }
    if (report.protected.length > 5) {
      console.log(`    ... and ${report.protected.length - 5} more`);
    }
    console.log();
  }
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  eagle-cleanup: Archive 自動整理');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (DRY_RUN) console.log('  ⚠️  DRY RUN モード（変更なし）');
  console.log(`  📅 保持期間: ${retentionDays} 日`);
  console.log();

  // 1. Eagle接続確認
  log('Connecting to Eagle...');
  const connected = await checkConnection();
  if (!connected) {
    console.error('❌ Eagle に接続できません。Eagle アプリが起動しているか確認してください。');
    process.exit(1);
  }
  log('✅ Eagle connected.');

  // 2. Archive フォルダ検索
  log('Finding Archive folder...');
  const folders = await getFolderList();
  const archiveFolder = findFolderByPath('Archive', folders);

  if (!archiveFolder) {
    console.error(
      '❌ Archive フォルダが見つかりません。先に eagle-sync --setup を実行してください。',
    );
    process.exit(1);
  }
  log(`✅ Archive folder: ${archiveFolder.id}`);

  // 3. deprecated アイテム取得
  log('Scanning deprecated items...');
  const allDeprecated = await findDeprecatedItems(archiveFolder.id);
  log(`Found ${allDeprecated.length} deprecated items in Archive.`);

  if (allDeprecated.length === 0) {
    log('Nothing to clean up.');
    return;
  }

  // 4. カテゴリ分類
  const report = categorizeItems(allDeprecated);
  log(
    `Expired: ${report.expired.length}, Protected: ${report.protected.length}, Retained: ${report.retained.length}`,
  );

  // 5. DRY RUN or 削除実行
  if (DRY_RUN || report.expired.length === 0) {
    printReport(report);
    return;
  }

  // 6. 確認プロンプト
  const confirmed = await confirmDeletion(report.expired.length);
  if (!confirmed) {
    log('Cancelled.');
    return;
  }

  // 7. 削除
  log('Deleting expired items...');
  report.deleted = await deleteExpired(report.expired);

  printReport(report);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
