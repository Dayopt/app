import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * インプットバリアント定義（dayopt-appと同期）
 *
 * ## サイズ設計（8pxグリッド準拠）
 *
 * | size    | 高さ  | 用途                                         | 例                           |
 * |---------|-------|----------------------------------------------|------------------------------|
 * | sm      | 32px  | コンパクトUI、テーブル内                     | フィルター入力、インライン   |
 * | default | 40px  | 標準的なフォーム                             | ログイン、設定画面           |
 * | lg      | 48px  | 主要な入力、ランディング                     | 検索バー、登録フォーム       |
 *
 * ※ ボタンより1段階大きいサイズ（テキスト入力の視認性確保）
 */
const inputVariants = cva(
  [
    // 基本スタイル
    'w-full min-w-0 rounded-lg border surface-sunken transition-[color,box-shadow] outline-none',
    'border-border bg-input',
    // テキスト
    'placeholder:text-muted-foreground',
    'selection:bg-primary selection:text-primary-foreground',
    // ファイル入力
    'file:text-foreground file:inline-flex file:border-0 file:bg-transparent file:font-normal',
    // フォーカス（MD3: ボーダーがリングに置き換わる）
    'focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring',
    // 無効状態（disabled + aria-disabled両対応）
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    // エラー状態
    'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
  ].join(' '),
  {
    variants: {
      size: {
        // sm: 32px高さ - コンパクトUI
        sm: 'h-8 px-4 text-sm file:h-6 file:text-xs',
        // default: 40px高さ - 標準
        default: 'h-10 px-4 text-base md:text-sm file:h-7 file:text-sm',
        // lg: 48px高さ - 主要な入力
        lg: 'h-12 px-4 text-lg file:h-8 file:text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(inputVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input, inputVariants };
