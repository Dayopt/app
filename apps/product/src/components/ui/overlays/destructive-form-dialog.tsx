'use client';

import { type ReactNode, useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { useIsMobile } from '@/lib/hooks/useIsMobile';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@dayopt/components';

interface DestructiveFormDialogProps {
  /** ダイアログが開いているかどうか */
  open: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 確認時のコールバック（非同期可） */
  onConfirm: () => void | Promise<void>;
  /** タイトル */
  title: string;
  /** 説明文 */
  description?: string;
  /** フォーム領域 */
  children: ReactNode;
  /** 確認ボタンのラベル（省略時は common.actions.delete） */
  confirmLabel?: string;
  /** キャンセルボタンのラベル（省略時は common.actions.cancel） */
  cancelLabel?: string;
  /** ローディング中のラベル（省略時は common.actions.deleting） */
  loadingLabel?: string;
  /** 確認ボタンを無効化 */
  confirmDisabled?: boolean;
  /**
   * true のときモバイルは Drawer、PC は AlertDialog。
   * 既定 false（常に AlertDialog）
   */
  responsive?: boolean;
  /** AlertDialogContent / DrawerContent に渡す追加クラス（max-w 制御等） */
  contentClassName?: string;
}

/**
 * 破壊的操作を伴うフォーム型ダイアログ
 *
 * 階層構造:
 * - Dialog → 箱。中身は呼び出し側が自由に決める
 * - AlertDialog → 箱 + 「閉じにくい」振る舞い
 * - ConfirmDialog → AlertDialog + 定型の確認UI（アイコン + title + 2ボタン）
 * - DestructiveFormDialog → AlertDialog + 任意フォーム + destructive フッター（本コンポーネント）
 *
 * RadioGroup、検索、選択リスト等、確認と同時に選択肢を提示する必要があるときに使う。
 * 単純な Yes/No 確認は ConfirmDialog を使う。
 *
 * 挙動:
 * - PC: AlertDialog（overlay click では閉じない、ESC で閉じる）
 * - モバイル（responsive=true のとき）: Drawer（スワイプ・overlay click で閉じる）
 * - 確認ボタンは variant="destructive"。onConfirm は async 対応、Loading 中は両ボタン disable
 */
export function DestructiveFormDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  loadingLabel,
  confirmDisabled = false,
  responsive = false,
  contentClassName,
}: DestructiveFormDialogProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  }, [onConfirm]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !isLoading) onClose();
    },
    [isLoading, onClose],
  );

  const handleCancel = useCallback(() => {
    if (!isLoading) onClose();
  }, [isLoading, onClose]);

  const resolvedConfirmLabel = confirmLabel ?? t('common.actions.delete');
  const resolvedCancelLabel = cancelLabel ?? t('common.actions.cancel');
  const resolvedLoadingLabel = loadingLabel ?? t('common.actions.deleting');

  const footerButtons = (
    <>
      <Button
        variant="outline"
        onClick={handleCancel}
        disabled={isLoading}
        className="hover:bg-state-hover"
      >
        {resolvedCancelLabel}
      </Button>
      <Button variant="destructive" onClick={handleConfirm} disabled={isLoading || confirmDisabled}>
        {isLoading ? resolvedLoadingLabel : resolvedConfirmLabel}
      </Button>
    </>
  );

  if (responsive && isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- ドロワー高は viewport 単位 80vh が必要でトークン化不可 */}
        <DrawerContent className={cn('max-h-[80vh]', contentClassName)}>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {children}
          <div className="border-border mt-auto flex flex-row justify-end gap-2 border-t p-4">
            {footerButtons}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className={cn('sm:max-w-md', contentClassName)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div>{children}</div>
        <AlertDialogFooter>{footerButtons}</AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
