/**
 * Supabase Storage ヘルパー関数
 * アバター画像のアップロード・削除を管理
 */

import { logger } from '@/lib/logger';

import { createClient } from './client';

const AVATARS_BUCKET = 'avatars';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const DEFAULT_EXTENSION = 'png';

/**
 * ストレージ操作エラーコード
 */
const STORAGE_ERROR_CODES = {
  INVALID_FILE_TYPE: 'STORAGE_INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'STORAGE_FILE_TOO_LARGE',
  INVALID_FILE_NAME: 'STORAGE_INVALID_FILE_NAME',
  UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  DELETE_FAILED: 'STORAGE_DELETE_FAILED',
  LIST_FAILED: 'STORAGE_LIST_FAILED',
} as const;

/**
 * ストレージエラークラス
 */
class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * ファイル拡張子を安全に取得
 * @param fileName - ファイル名
 * @returns 拡張子（デフォルト: png）
 */
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) {
    return DEFAULT_EXTENSION;
  }
  const ext = parts.pop()?.toLowerCase();
  // 有効な画像拡張子かチェック
  const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  return ext && validExtensions.includes(ext) ? ext : DEFAULT_EXTENSION;
}

/**
 * アバター画像をアップロード
 * @param file - アップロードする画像ファイル
 * @param userId - ユーザーID
 * @returns アップロードされた画像の公開URL
 * @throws {StorageError} アップロードに失敗した場合
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const supabase = createClient();

  // ファイルタイプバリデーション（許可リストで厳密に検証）
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new StorageError(
      '画像ファイルのみアップロード可能',
      STORAGE_ERROR_CODES.INVALID_FILE_TYPE,
      {
        actualType: file.type,
        allowedTypes: ALLOWED_IMAGE_TYPES,
      },
    );
  }

  // ファイルサイズバリデーション
  if (file.size > MAX_FILE_SIZE) {
    throw new StorageError('ファイルサイズは5MB以下', STORAGE_ERROR_CODES.FILE_TOO_LARGE, {
      actualSize: file.size,
      maxSize: MAX_FILE_SIZE,
    });
  }

  // ファイル拡張子を安全に取得
  const fileExt = getFileExtension(file.name);
  const fileName = `${userId}/avatar.${fileExt}`;

  // 新しいアバターを先にアップロードする（#2449）。
  //
  // 旧実装は remove() を upload() の**前**に呼んでいたため、削除が成功して upload だけが
  // 失敗する（例: bucket 制約による拒否、ネットワーク断）と旧画像が既に無く、参照済みの
  // URL が 404 を返す状態になっていた（新規アップロードが失敗しても既存のアバターは
  // 無傷のまま残すべき、という不変条件を壊す非原子的な置換）。
  //
  // `upsert: true` は同一 key への上書きを単一操作として扱うため、同じ拡張子で
  // 再アップロードする最頻ケース（key が変わらない）では remove() は元々不要だった。
  // 拡張子が変わって key も変わるケース（png → webp 等）だけ旧 object が孤児として
  // 残り得るため、upload 成功を確認した**後**にベストエフォートで回収する。
  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    logger.error('[Storage] Upload failed:', {
      message: uploadError.message,
      bucket: AVATARS_BUCKET,
      fileName,
      userId,
    });
    throw new StorageError(
      `アップロードに失敗しました: ${uploadError.message}`,
      STORAGE_ERROR_CODES.UPLOAD_FAILED,
      {
        originalError: uploadError.message,
        bucket: AVATARS_BUCKET,
        fileName,
      },
    );
  }

  // upload 成功後、同じユーザーフォルダに残る他拡張子の旧ファイルを回収する（ベストエフォート）。
  // 失敗しても新しいアバター自体は既に確定しているため、ここでは throw しない。
  try {
    const { data: existingFiles, error: listError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .list(userId);

    if (listError) {
      throw listError;
    }

    const orphanPaths = (existingFiles ?? [])
      .map((existingFile) => `${userId}/${existingFile.name}`)
      .filter((path) => path !== fileName);

    if (orphanPaths.length > 0) {
      await supabase.storage.from(AVATARS_BUCKET).remove(orphanPaths);
    }
  } catch (error) {
    logger.debug('[Storage] Failed to clean up orphaned avatar files (non-fatal):', {
      userId,
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 公開URLを取得（キャッシュバスター付き）
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(fileName);

  return `${publicUrl}?t=${Date.now()}`;
}

/**
 * アバター画像を削除
 * @param userId - ユーザーID
 * @throws {StorageError} 削除に失敗した場合
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const supabase = createClient();

  // ユーザーのフォルダ内のすべてのファイルを取得
  const { data: files, error: listError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .list(userId);

  if (listError) {
    logger.error('[Storage] List files failed:', {
      message: listError.message,
      bucket: AVATARS_BUCKET,
      userId,
    });
    throw new StorageError(
      `ファイル一覧の取得に失敗しました: ${listError.message}`,
      STORAGE_ERROR_CODES.LIST_FAILED,
      {
        originalError: listError.message,
        bucket: AVATARS_BUCKET,
        userId,
      },
    );
  }

  if (!files || files.length === 0) {
    logger.debug('[Storage] No files to delete for user:', { userId });
    return; // 削除するファイルがない
  }

  // すべてのファイルを削除
  const filePaths = files.map((file) => `${userId}/${file.name}`);
  const { error: deleteError } = await supabase.storage.from(AVATARS_BUCKET).remove(filePaths);

  if (deleteError) {
    logger.error('[Storage] Delete files failed:', {
      message: deleteError.message,
      bucket: AVATARS_BUCKET,
      userId,
      filePaths,
    });
    throw new StorageError(
      `削除に失敗しました: ${deleteError.message}`,
      STORAGE_ERROR_CODES.DELETE_FAILED,
      {
        originalError: deleteError.message,
        bucket: AVATARS_BUCKET,
        userId,
        filePaths,
      },
    );
  }

  logger.debug('[Storage] Successfully deleted avatar files:', {
    userId,
    count: filePaths.length,
  });
}
