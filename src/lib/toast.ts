/**
 * Toast ラッパー — design-system.md Interaction Patterns 準拠
 *
 * success: 3秒で自動消去
 * error: 手動消去（closeButton で閉じる）
 * その他: Sonner デフォルト（Toaster の duration=6000）
 *
 * @example
 * ```ts
 * import { toast } from '@/lib/toast';
 *
 * toast.success('保存しました');
 * toast.error('エラーが発生しました');
 * toast.success('削除しました', { action: { label: '元に戻す', onClick: restore } });
 * ```
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

type TitleT = Parameters<typeof sonnerToast>[0];

const TOAST_DURATION = {
  success: 3_000,
  error: Infinity,
} as const;

export const toast: typeof sonnerToast = Object.assign(
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  {
    success: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.success(message, { duration: TOAST_DURATION.success, ...data }),
    error: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.error(message, { duration: TOAST_DURATION.error, ...data }),
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    loading: sonnerToast.loading,
    message: sonnerToast.message,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
    getHistory: sonnerToast.getHistory,
    getToasts: sonnerToast.getToasts,
  },
);
