'use client';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Toaster as Sonner } from 'sonner';

import { buttonVariants } from './button';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const LoadingIcon = () => <Loader2 className="size-5 animate-spin" />;

/**
 * Toast通知コンポーネント
 *
 * デザイン仕様:
 * - 背景: card（共通）
 * - 枠線: タイプ別カラー（success/error/warning/info）
 * - 角丸: 8px（radius-md）
 * - 影: shadow-card
 * - パディング: 16px
 * - ギャップ: 8px
 * - タイトル: 14px、bold、foreground
 * - 説明: 14px、normal、muted-foreground
 * - 閉じるボタン: 常時表示
 * - Undoボタン: 右配置
 *
 * @example
 * ```tsx
 * import { toast } from 'sonner';
 *
 * toast.error('エラーが発生しました');
 * toast.success('削除しました', {
 *   action: { label: '元に戻す', onClick: () => restoreItem() },
 * });
 * ```
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const t = useTranslations('notification');

  return (
    <Sonner
      position={isMobile ? 'bottom-center' : 'bottom-right'}
      expand
      duration={6000}
      closeButton
      containerAriaLabel={t('title')}
      icons={{ loading: <LoadingIcon /> }}
      // Sonner内部の--width CSS変数を上書き（デフォルト356px → 420px）
      className="[--width:420px]"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'grid grid-cols-[auto_1fr_auto] gap-4 items-start w-full p-4 rounded-lg border shadow-card bg-card text-foreground border-border-subtle',
          icon: 'row-start-1 col-start-1 [&_svg]:size-5',
          loader: '!static !inset-auto !transform-none',
          content:
            'row-start-1 col-start-2 min-w-0 flex flex-col gap-1 [[data-sonner-toast]:not(:has([data-icon]))_&]:col-start-1',
          title: 'text-sm font-bold',
          description: 'text-sm text-muted-foreground',
          actionButton: cn(
            'row-start-2 col-start-2 col-span-2 justify-self-end',
            buttonVariants({ variant: 'outline', size: 'sm' }),
          ),
          cancelButton: buttonVariants({ variant: 'outline', size: 'sm' }),
          closeButton:
            'row-start-1 col-start-3 justify-self-end -mt-1 -mr-1 p-1 rounded-lg text-muted-foreground bg-transparent border-0 hover:bg-state-hover transition-colors [&_svg]:size-5',
          success:
            '!border-success [&_[data-icon]]:text-success [&_[data-action]]:!bg-success [&_[data-action]]:!text-success-foreground [&_[data-action]]:!border-0',
          error:
            '!border-destructive [&_[data-icon]]:text-destructive [&_[data-action]]:!bg-destructive [&_[data-action]]:!text-destructive-foreground [&_[data-action]]:!border-0',
          warning:
            '!border-warning [&_[data-icon]]:text-warning [&_[data-action]]:!bg-warning [&_[data-action]]:!text-warning-foreground [&_[data-action]]:!border-0',
          info: '!border-info [&_[data-icon]]:text-info [&_[data-action]]:!bg-info [&_[data-action]]:!text-info-foreground [&_[data-action]]:!border-0',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
