/**
 * 時間重複エラー表示
 */

import { AlertCircle } from 'lucide-react';

interface TimeConflictAlertProps {
  message: string;
}

/** 時間重複エラーをインラインで表示するアラートコンポーネント */
export function TimeConflictAlert({ message }: TimeConflictAlertProps) {
  return (
    <div
      className="text-destructive flex items-center gap-1 text-sm"
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="size-3.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
