'use client';

import { type ReactNode, useCallback, useState } from 'react';

import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/lib/components/ui/alert-dialog';
import { Button } from '@/lib/components/ui/button';

type ConfirmDialogVariant = 'destructive' | 'warning' | 'default';

interface ConfirmDialogProps {
  /** ダイアログが開いているかどうか */
  open: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 確認時のコールバック（非同期可） */
  onConfirm: () => void | Promise<void>;
  /** タイトル */
  title: string;
  /** 説明文（省略可、childrenがある場合） */
  description?: string;
  /** カスタムコンテンツ（description の代わりに使用） */
  children?: ReactNode;
  /** 確認ボタンのラベル（省略時は翻訳キーから取得） */
  confirmLabel?: string;
  /** キャンセルボタンのラベル（省略時は翻訳キーから取得） */
  cancelLabel?: string;
  /** バリアント: destructive（削除等）, warning（警告）, default */
  variant?: ConfirmDialogVariant;
  /** カスタムアイコン（省略時はバリアントに応じたデフォルト） */
  icon?: LucideIcon;
  /** ローディング中のラベル */
  loadingLabel?: string;
  /** 確認ボタンを無効化（外部の条件が満たされていない場合） */
  confirmDisabled?: boolean;
}

/**
 * 汎用確認ダイアログ
 *
 * AlertDialog をベースに、定型の確認UI（アイコン + title + description + 2ボタン）を提供。
 * ESC / overlay クリックでは閉じない（AlertDialog のセマンティクス）。
 *
 * 階層構造:
 * - Dialog → 箱。中身は呼び出し側が自由に決める
 * - AlertDialog → 箱 + 「閉じにくい」という振る舞い
 * - ConfirmDialog → AlertDialog + 定型の中身（本コンポーネント）
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  icon: Icon = AlertTriangle,
  loadingLabel,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    if (!isLoading) onClose();
  }, [isLoading, onClose]);

  // バリアントに応じたスタイル
  const iconContainerClass =
    variant === 'destructive'
      ? 'border border-destructive'
      : variant === 'warning'
        ? 'border border-warning'
        : 'bg-muted';

  const iconClass =
    variant === 'destructive'
      ? 'text-destructive'
      : variant === 'warning'
        ? 'text-warning'
        : 'text-foreground';

  const confirmButtonVariant = variant === 'destructive' ? 'destructive' : 'primary';
  const confirmButtonClass =
    variant === 'warning' ? 'bg-warning text-warning-foreground hover:bg-warning-hover' : undefined;

  // ラベルの決定
  const resolvedConfirmLabel =
    confirmLabel ??
    (variant === 'destructive' ? t('common.actions.delete') : t('common.actions.confirm'));
  const resolvedCancelLabel = cancelLabel ?? t('common.actions.cancel');
  const resolvedLoadingLabel =
    loadingLabel ??
    (variant === 'destructive' ? t('common.actions.deleting') : t('common.loading'));

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        {/* Header: アイコン + タイトル + 説明 */}
        <div className={children ? 'mb-6' : ''}>
          <div className="flex items-start gap-4">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconContainerClass}`}
            >
              <Icon className={`size-5 ${iconClass}`} />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="leading-tight">{title}</AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="mt-2">{description}</AlertDialogDescription>
              )}
            </div>
          </div>
        </div>

        {/* Custom content */}
        {children && <div className="mt-6">{children}</div>}

        {/* Footer */}
        <AlertDialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="hover:bg-state-hover"
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={confirmButtonVariant}
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
            className={confirmButtonClass}
          >
            {isLoading ? resolvedLoadingLabel : resolvedConfirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
