/**
 * Toast ラッパー — 新仕様（ミニマル1行デザイン）準拠
 *
 * Duration ルール:
 * - action なし: 3秒で自動消去
 * - action あり: 5秒で自動消去（undo 猶予）
 *
 * description は仕様上廃止。安全策として wrapper でストリップ。
 *
 * @example
 * ```ts
 * import { toast } from '@/lib/toast';
 *
 * toast.success('保存しました');
 * toast.error('保存に失敗しました');
 * toast.success('削除しました', { action: { label: '元に戻す', onClick: restore } });
 * ```
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

type TitleT = Parameters<typeof sonnerToast>[0];

const TOAST_DURATION = {
  default: 3_000,
  withAction: 5_000,
} as const;

/** action の有無に応じた duration を返す */
const getDuration = (data?: ExternalToast): number =>
  data?.action ? TOAST_DURATION.withAction : TOAST_DURATION.default;

/** description をストリップする（仕様上廃止） */
const stripDescription = (data?: ExternalToast): ExternalToast | undefined => {
  if (!data) return data;
  const { description: _, ...rest } = data;
  return rest;
};

export const toast: typeof sonnerToast = Object.assign(
  (...args: Parameters<typeof sonnerToast>) =>
    sonnerToast(args[0], { duration: getDuration(args[1]), ...stripDescription(args[1]) }),
  {
    success: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.success(message, { duration: getDuration(data), ...stripDescription(data) }),
    error: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.error(message, { duration: getDuration(data), ...stripDescription(data) }),
    /** @deprecated Inline Banner に移行予定。見た目は通常トーストと同一。 */
    info: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.info(message, { duration: getDuration(data), ...stripDescription(data) }),
    /** @deprecated Inline Banner に移行予定。見た目は通常トーストと同一。 */
    warning: (message: TitleT, data?: ExternalToast) =>
      sonnerToast.warning(message, { duration: getDuration(data), ...stripDescription(data) }),
    loading: sonnerToast.loading,
    message: sonnerToast.message,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
    getHistory: sonnerToast.getHistory,
    getToasts: sonnerToast.getToasts,
  },
);
