/**
 * Supabase Storage ヘルパー関数
 * アバター画像のアップロード・削除を管理
 */

import { logger } from '@/lib/logger';

import { createClient } from './client';

const AVATARS_BUCKET = 'avatars';
// client 側の早期 validation 値。bucket 側の実際の制約（supabase/config.toml の
// [storage.buckets.avatars]、scripts/production-storage-rls-audit.mjs の
// EXPECTED_AVATARS_BUCKET が正本）と 3 箇所目の写経になっている（#2464 cross-review
// 指摘）。ここだけ緩めても bucket 側が拒否するため安全側の drift だが、値の同期は
// __tests__/storage.test.ts の契約 test で機械固定する。
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
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

  // remove() を呼ばず、先に新しいアバターをアップロードする（#2449）。
  //
  // 旧実装は remove() を upload() の**前**に呼んでいたため、削除が成功して upload だけが
  // 失敗する（例: bucket 制約による拒否、ネットワーク断）と旧画像が既に無く、参照済みの
  // URL が 404 を返す状態になっていた。`upsert: true` は同一 key への上書きを単一操作
  // として扱うため、そもそも remove() は不要だった。
  //
  // 拡張子が変わる場合（png → webp 等）は key も変わるため、旧 object がユーザーの
  // フォルダに孤児として残る。この孤児の回収は本 PR の scope から意図的に外した
  // （cross-review 指摘、#2464）: upload 成功後すぐに回収すると、呼び出し元
  // （`AvatarChangeDialog`）が新しい publicUrl を DB / auth metadata へ永続化する前に
  // 失敗した場合、永続化済みの参照が既に削除された旧 key を指したまま 404 になる —
  // 旧実装には無かった新しい破損経路を作ってしまう。孤児ファイルの蓄積そのものは
  // storage の容量・object 数の quota の話で、[#2460](https://github.com/Dayopt/dayopt/issues/2460)
  // の scope。
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
