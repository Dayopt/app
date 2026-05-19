import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * バッジバリアント定義（dayopt-appと同期）
 *
 * ## バリアント設計（Carbon Design System 参考）
 *
 * | variant     | 用途                                         | 例                           |
 * |-------------|----------------------------------------------|------------------------------|
 * | primary     | 強調、主要なラベル                           | NEW、注目                    |
 * | secondary   | 控えめ、カウント表示                         | +3件、5個                    |
 * | outline     | 軽量、タグ・ステータス                       | ステータス、カテゴリ         |
 * | success     | 成功、プラス、完了（アウトライン）           | 完了、+10%、有効             |
 * | warning     | 警告、注意（アウトライン）                   | 要確認、期限切れ間近         |
 * | info        | 情報、ニュートラル（アウトライン）           | ベータ、更新あり             |
 * | destructive | エラー、マイナス、削除                       | エラー、-5%、無効            |
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-lg border px-2 py-1 text-xs font-normal w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        // 強調 - 主要なラベル
        primary:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary-hover',
        // 控えめ - カウント表示など
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-state-hover',
        // 軽量 - ボーダー付き
        outline: 'border-border bg-background text-foreground [a&]:hover:bg-state-hover',
        // 成功 - 完了、プラス（アウトライン）
        success: 'border-success text-success [a&]:hover:bg-state-hover',
        // 警告 - 注意（アウトライン）
        warning: 'border-warning text-warning [a&]:hover:bg-state-hover',
        // 情報 - ニュートラル（アウトライン）
        info: 'border-info text-info [a&]:hover:bg-state-hover',
        // エラー - マイナス、削除
        destructive:
          'border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive-hover focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
