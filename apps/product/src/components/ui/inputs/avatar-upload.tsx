'use client';

import { Camera, Loader2, Trash2, Upload, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';

import { cn } from '@/lib/utils';
import { avatarVariants, Button } from '@dayopt/components';

interface AvatarUploadProps {
  /** 現在のアバターURL */
  currentAvatarUrl?: string | null;
  /** アップロード時のコールバック */
  onUpload: (file: File) => Promise<void>;
  /** 削除時のコールバック */
  onRemove?: () => Promise<void>;
  /** ローディング状態 */
  loading?: boolean;
  /** 最大ファイルサイズ（バイト） */
  maxFileSize?: number;
  /** サイズ */
  size?: '2xl' | '3xl';
  /** 無効化 */
  disabled?: boolean;
  /** クラス名 */
  className?: string;
}

/**
 * アバター画像アップロード専用コンポーネント
 *
 * プロフィール画像のアップロードに特化したDropzone
 * - 単一画像のみ
 * - 円形プレビュー
 * - ドラッグ&ドロップ対応
 *
 * 基底 Avatar（表示用）は @dayopt/components に昇格済み。本コンポーネントは
 * Supabase Storage アップロード前提の app 固有合成物のため product 側に残す。
 *
 * @example
 * ```tsx
 * <AvatarUpload
 *   currentAvatarUrl={user?.avatar_url}
 *   onUpload={handleUpload}
 *   onRemove={handleRemove}
 *   loading={loading}
 * />
 * ```
 */
function AvatarUpload({
  currentAvatarUrl,
  onUpload,
  onRemove,
  loading = false,
  maxFileSize = 5 * 1024 * 1024, // 5MB
  size = '2xl',
  disabled = false,
  className,
}: AvatarUploadProps) {
  const t = useTranslations('common.avatarDropzone');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 表示するアバターURL（プレビュー優先）
  const displayUrl = previewUrl || currentAvatarUrl;

  // サイズに応じたピクセル値
  const sizeInPx = size === '3xl' ? 120 : 96;

  // ファイルドロップ時のハンドラ
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setError(null);

      // プレビュー表示
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      try {
        await onUpload(file);
      } catch (err) {
        // エラー時はプレビューをクリア
        setPreviewUrl(null);
        setError(err instanceof Error ? err.message : t('uploadFailed'));
      } finally {
        // プレビューURLをクリーンアップ
        URL.revokeObjectURL(preview);
        setPreviewUrl(null);
      }
    },
    [onUpload, t],
  );

  // Dropzone設定
  const dropzoneOptions = useMemo(
    () => ({
      onDrop,
      accept: {
        'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      },
      maxSize: maxFileSize,
      maxFiles: 1,
      multiple: false,
      disabled: disabled || loading,
      onDropRejected: (rejections: FileRejection[]) => {
        const rejection = rejections[0];
        if (rejection?.errors[0]?.code === 'file-too-large') {
          setError(t('fileTooLarge', { maxSize: formatBytes(maxFileSize) }));
        } else if (rejection?.errors[0]?.code === 'file-invalid-type') {
          setError(t('invalidFileType'));
        } else {
          setError(t('uploadFailed'));
        }
      },
    }),
    [onDrop, maxFileSize, disabled, loading, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone(dropzoneOptions);

  // 削除ハンドラ
  const handleRemove = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onRemove) return;

      const confirmed = window.confirm(t('deleteConfirm'));
      if (!confirmed) return;

      setError(null);
      try {
        await onRemove();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('deleteFailed'));
      }
    },
    [onRemove, t],
  );

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* アバター表示エリア */}
      <div
        {...getRootProps({
          className: cn(
            'group relative cursor-pointer rounded-full transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDragActive && 'ring-2 ring-primary ring-offset-2',
            (disabled || loading) && 'cursor-not-allowed opacity-50',
          ),
        })}
      >
        <input {...getInputProps({ 'aria-label': t('avatarAlt') })} />

        {/* アバター画像またはプレースホルダー */}
        {displayUrl ? (
          <div className={cn('relative overflow-hidden rounded-full', avatarVariants({ size }))}>
            <Image
              src={displayUrl}
              alt={t('avatarAlt')}
              fill
              className="object-cover"
              sizes={`${sizeInPx}px`}
              unoptimized={displayUrl.startsWith('blob:')}
            />
            {/* ホバーオーバーレイ */}
            {!loading && (
              <div className="bg-card absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'flex items-center justify-center rounded-full',
              'border-2 border-dashed transition-colors',
              avatarVariants({ size }),
              isDragActive
                ? 'border-primary bg-state-active'
                : 'border-border bg-muted hover:border-primary hover:bg-state-hover',
            )}
          >
            {isDragActive ? (
              <Upload className="text-primary h-8 w-8" />
            ) : (
              <User className="text-muted-foreground h-8 w-8" />
            )}
          </div>
        )}

        {/* ローディングオーバーレイ */}
        {loading && (
          <div className="bg-card absolute inset-0 flex items-center justify-center rounded-full">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>('input[type="file"]');
            input?.click();
          }}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              {t('uploading')}
            </>
          ) : (
            <>
              <Camera className="mr-2 h-3.5 w-3.5" />
              {displayUrl ? t('change') : t('upload')}
            </>
          )}
        </Button>

        {displayUrl && onRemove && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || loading}
            onClick={handleRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t('remove')}
          </Button>
        )}
      </div>

      {/* ファイル制限の説明 */}
      <p className="text-muted-foreground text-xs">
        {t('fileRequirements', { maxSize: formatBytes(maxFileSize) })}
      </p>

      {/* エラー表示 */}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/**
 * バイト数をフォーマット
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 bytes';
  const k = 1000;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(0))} ${sizes[i]}`;
}

export { AvatarUpload };
