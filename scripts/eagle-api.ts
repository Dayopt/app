#!/usr/bin/env node
/**
 * Eagle MCP API クライアント
 *
 * Eagle MCP Server（localhost:41596）への型付きラッパー。
 * フォルダ作成・アイテム追加・更新・検索・削除を全カバー。
 *
 * Usage:
 *   import { checkConnection, getFolderList, addItemFromPath } from './eagle-api.js';
 *
 * テスト実行:
 *   npx tsx scripts/eagle-api.ts
 */

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface EagleFolder {
  id: string;
  name: string;
  description: string;
  children: EagleFolder[];
}

export interface EagleItem {
  id: string;
  name: string;
  ext: string;
  tags: string[];
  folders: string[];
  annotation: string;
  star: number;
  modificationTime: number;
  width: number;
  height: number;
  filePath: string;
  thumbnailPath: string;
}

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const MCP_URL = 'http://127.0.0.1:41596/api/tools/call';
const TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────

export class EagleApiError extends Error {
  constructor(
    public readonly tool: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(`Eagle MCP error [${tool}] (${statusCode}): ${message}`);
    this.name = 'EagleApiError';
  }
}

// ─────────────────────────────────────────────────────────
// Core Request
// ─────────────────────────────────────────────────────────

async function callMcp<T>(tool: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new EagleApiError(tool, res.status, text);
  }

  try {
    const json = JSON.parse(text) as T;
    return json;
  } catch {
    return text as unknown as T;
  }
}

// ─────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────

export async function checkConnection(): Promise<boolean> {
  try {
    await callMcp('get_app_info');
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────
// Folder Operations
// ─────────────────────────────────────────────────────────

export async function getFolderList(): Promise<EagleFolder[]> {
  const result = await callMcp<{ data: EagleFolder[] }>('folder_get', {
    getAllHierarchy: true,
  });
  return result.data;
}

export async function createFolder(params: {
  name: string;
  parentId?: string;
  iconColor?: string;
}): Promise<EagleFolder> {
  const result = await callMcp<{ data: EagleFolder[] }>('folder_create', {
    ...(params.parentId && { parentId: params.parentId }),
    folders: [
      {
        name: params.name,
        ...(params.iconColor && { iconColor: params.iconColor }),
      },
    ],
  });
  return result.data[0];
}

export function findFolderByPath(
  folderPath: string,
  roots: EagleFolder[],
): EagleFolder | undefined {
  const segments = folderPath.split('/');
  let current: EagleFolder[] = roots;
  let found: EagleFolder | undefined;

  for (const segment of segments) {
    found = current.find((f) => f.name === segment);
    if (!found) return undefined;
    current = found.children ?? [];
  }

  return found;
}

// ─────────────────────────────────────────────────────────
// Item Operations
// ─────────────────────────────────────────────────────────

export async function searchByTags(
  tags: string[],
  options?: {
    folders?: string[];
    rating?: number;
    limit?: number;
    offset?: number;
    fullDetails?: boolean;
  },
): Promise<EagleItem[]> {
  const result = await callMcp<{ data: EagleItem[] }>('item_get', {
    tags,
    ...(options?.folders && { folders: options.folders }),
    ...(options?.rating !== undefined && { rating: options.rating }),
    limit: options?.limit ?? 200,
    offset: options?.offset ?? 0,
    fullDetails: options?.fullDetails ?? false,
  });
  return result.data ?? [];
}

/** フルテキスト検索（AND/OR/NOT、フレーズ検索対応） */
export async function queryItems(
  query: string,
  options?: { fullDetails?: boolean },
): Promise<EagleItem[]> {
  const result = await callMcp<{ data: EagleItem[] }>('item_query', {
    query,
    fullDetails: options?.fullDetails ?? false,
  });
  return result.data ?? [];
}

/** アイテム数をカウント */
export async function countItems(filters?: {
  tags?: string[];
  rating?: number;
  folders?: string[];
}): Promise<number> {
  const result = await callMcp<{ data: { count: number } }>('item_count', {
    ...(filters?.tags && { tags: filters.tags }),
    ...(filters?.rating !== undefined && { rating: filters.rating }),
    ...(filters?.folders && { folders: filters.folders }),
  });
  return result.data.count;
}

export async function addItemFromPath(params: {
  path: string;
  name?: string;
  tags?: string[];
  folders?: string[];
  annotation?: string;
  star?: number;
}): Promise<string> {
  const result = await callMcp<{ data: Array<{ itemId: string }> }>('item_add', {
    ...(params.tags && { tags: params.tags }),
    ...(params.folders && { folders: params.folders }),
    ...(params.annotation && { annotation: params.annotation }),
    items: [
      {
        source: { type: 'path', path: params.path },
        ...(params.name && { name: params.name }),
      },
    ],
  });

  const itemId = result.data[0].itemId;

  // star は item_add では設定できないので、追加後に update
  if (params.star !== undefined) {
    await callMcp('item_update', {
      items: [{ id: itemId }],
      star: params.star,
    });
  }

  return itemId;
}

export async function updateItem(params: {
  id: string;
  tags?: string[];
  annotation?: string;
  star?: number;
}): Promise<void> {
  await callMcp('item_update', {
    items: [{ id: params.id }],
    ...(params.tags && { tags: params.tags }),
    ...(params.annotation !== undefined && { annotation: params.annotation }),
    ...(params.star !== undefined && { star: params.star }),
  });
}

export async function addTags(ids: string[], tags: string[]): Promise<void> {
  await callMcp('item_add_tags', { ids, tags });
}

export async function removeTags(ids: string[], tags: string[]): Promise<void> {
  await callMcp('item_remove_tags', { ids, tags });
}

export async function addToFolders(ids: string[], folders: string[]): Promise<void> {
  await callMcp('item_add_to_folders', { ids, folders });
}

export async function removeFromFolders(ids: string[], folders: string[]): Promise<void> {
  await callMcp('item_remove_from_folders', { ids, folders });
}

export async function moveToTrash(ids: string[]): Promise<void> {
  await callMcp('item_move_to_trash', { ids });
}

// ─────────────────────────────────────────────────────────
// Smart Folder Operations
// ─────────────────────────────────────────────────────────

export interface SmartFolderConditionRule {
  property: string;
  method: string;
  value: string | number | boolean | string[];
}

export interface SmartFolderCondition {
  match: 'AND' | 'OR';
  rules: SmartFolderConditionRule[];
}

export async function createSmartFolder(params: {
  name: string;
  conditions: SmartFolderCondition[];
  iconColor?: string;
  description?: string;
}): Promise<void> {
  await callMcp('smart_folder_create', {
    smartFolders: [
      {
        name: params.name,
        conditions: params.conditions,
        ...(params.iconColor && { iconColor: params.iconColor }),
        ...(params.description && { description: params.description }),
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────
// Tag Group Operations
// ─────────────────────────────────────────────────────────

export async function createTagGroup(params: {
  name: string;
  tags: string[];
  iconColor?: string;
}): Promise<void> {
  await callMcp('tag_group_create', {
    name: params.name,
    tags: params.tags,
    ...(params.iconColor && { iconColor: params.iconColor }),
  });
}

export async function getTagGroups(): Promise<
  Array<{ id: string; name: string; tags: string[]; color: string }>
> {
  const result = await callMcp<{
    data: Array<{ id: string; name: string; tags: string[]; color: string }>;
  }>('tag_group_get', {});
  return result.data ?? [];
}

// ─────────────────────────────────────────────────────────
// AI Search Operations
// ─────────────────────────────────────────────────────────

/** AI セマンティック検索（自然言語クエリ） */
export async function aiSearchByText(
  query: string,
  options?: { limit?: number; fullDetails?: boolean },
): Promise<EagleItem[]> {
  const result = await callMcp<{ data: EagleItem[] }>('ai_search_by_text', {
    query,
    ...(options?.limit && { limit: options.limit }),
    fullDetails: options?.fullDetails ?? false,
  });
  return result.data ?? [];
}

/** AI 類似画像検索 */
export async function aiSearchByItem(
  itemId: string,
  options?: { limit?: number; fullDetails?: boolean },
): Promise<EagleItem[]> {
  const result = await callMcp<{ data: EagleItem[] }>('ai_search_by_item', {
    itemId,
    ...(options?.limit && { limit: options.limit }),
    fullDetails: options?.fullDetails ?? false,
  });
  return result.data ?? [];
}

/** AI Search プラグインの状態確認 */
export async function aiSearchStatus(): Promise<{ ready: boolean; status: string }> {
  const result = await callMcp<{ data: { ready: boolean; status: string } }>(
    'ai_search_status',
    {},
  );
  return result.data;
}

// ─────────────────────────────────────────────────────────
// Self-test（直接実行時）
// ─────────────────────────────────────────────────────────

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('eagle-api.ts');

if (isDirectRun) {
  (async () => {
    console.log('[eagle-api] Connection test (MCP)...');
    const ok = await checkConnection();
    if (!ok) {
      console.error(
        '❌ Eagle MCP に接続できません。Eagle アプリと MCP プラグインが起動しているか確認してください。',
      );
      process.exit(1);
    }
    console.log('✅ Eagle MCP connected.');

    console.log('[eagle-api] Fetching folder list...');
    const folders = await getFolderList();
    console.log(`✅ ${folders.length} root folders found.`);
    for (const f of folders) {
      console.log(`  📁 ${f.name} (${f.children?.length ?? 0} children)`);
    }
  })();
}
