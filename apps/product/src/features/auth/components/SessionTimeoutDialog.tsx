'use client';

import { Clock, LogOut } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@dayopt/components';
import { useTranslations } from 'next-intl';

interface SessionTimeoutDialogProps {
  /** ダイアログ表示状態 */
  open: boolean;
  /** 残り時間（秒） */
  remainingTime: number;
  /** セッション延長処理 */
  onExtend: () => Promise<void>;
  /** ログアウト処理 */
  onLogout: () => Promise<void>;
}

/**
 * セッションタイムアウト警告ダイアログ
 *
 * セッション期限切れ5分前に表示され、ユーザーに延長またはログアウトの選択を促す
 */
export function SessionTimeoutDialog({
  open,
  remainingTime,
  onExtend,
  onLogout,
}: SessionTimeoutDialogProps) {
  const t = useTranslations();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Clock className="text-warning h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-center">
            {t('auth.session.timeoutWarningTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {t('auth.session.timeoutWarningDescription')}
            <span className="text-foreground mt-2 block text-2xl font-medium">
              {formatTime(remainingTime)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel onClick={onLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            {t('auth.session.logout')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onExtend}>
            {t('auth.session.extendSession')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
