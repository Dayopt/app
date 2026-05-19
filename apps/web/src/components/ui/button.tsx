import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * ボタンバリアント定義（dayopt-appと同期）
 *
 * ## バリアント設計（Material Design 3 / Carbon Design System 参考）
 *
 * | variant     | 用途                                         | 例                           |
 * |-------------|----------------------------------------------|------------------------------|
 * | primary     | 主要CTA、画面で最も重要なアクション          | 保存、送信、作成、購入       |
 * | outline     | 副次アクション、primaryとペアで使用          | キャンセル、戻る、詳細       |
 * | ghost       | アイコンボタン、ツールバー、軽量な操作       | 閉じる、メニュー、設定       |
 * | destructive | 破壊的アクション、確認ダイアログ内           | 削除、解除、退会             |
 *
 * ## サイズ設計（GAFA準拠）
 *
 * | size    | 高さ  | 根拠                              | 用途                           |
 * |---------|-------|-----------------------------------|--------------------------------|
 * | sm      | 32px  | M3 XS、shadcn/ui icon-sm          | コンパクトUI、ツールバー       |
 * | default | 36px  | M3 Small（デフォルト）            | 標準的なアクション             |
 * | lg      | 44px  | Apple HIG最小タップターゲット     | CTA、モバイル主要アクション    |
 *
 * ## アイコンボタン（icon prop）
 *
 * `icon` prop を指定すると正方形のアイコンボタンになる。
 * サイズは `size` prop との組み合わせで決定。
 *
 * | size    | サイズ | 用途                                         |
 * |---------|--------|----------------------------------------------|
 * | sm      | 32px   | コンパクトなアイコン操作                     |
 * | default | 36px   | 標準的なアイコンボタン                       |
 * | lg      | 44px   | ナビゲーション、モバイル主要                 |
 *
 * ## スペック詳細
 *
 * | size    | 高さ  | パディング | アイコン | フォント  | Tailwind |
 * |---------|-------|------------|----------|-----------|----------|
 * | sm      | 32px  | 12px       | 16px     | text-sm   | h-8      |
 * | default | 36px  | 16px       | 16px     | text-sm   | h-9      |
 * | lg      | 44px  | 20px       | 20px     | text-base | h-11     |
 */
const buttonVariants = cva(
  [
    // 基本レイアウト
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-normal',
    // トランジション
    'transition-colors',
    // フォーカス状態（アクセシビリティ）
    'outline-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    // 無効状態（aria-disabled推奨、disabled属性も対応）
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    // バリデーションエラー状態
    'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
  ].join(' '),
  {
    variants: {
      variant: {
        // 主要CTA - 最も強調されるボタン
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
        // 副次アクション - ボーダー付きの控えめなボタン
        outline: [
          'border border-border bg-container text-foreground',
          'hover:bg-state-hover active:bg-state-hover',
        ].join(' '),
        // アイコンボタン・ツールバー - 背景なし、ホバーで背景出現
        ghost: 'text-foreground hover:bg-state-hover active:bg-state-hover',
        // 破壊的アクション - 削除、解除など
        destructive: [
          'bg-destructive text-destructive-foreground',
          'hover:bg-destructive-hover active:bg-destructive-hover',
          'focus-visible:outline-destructive',
          'dark:bg-destructive/60',
        ].join(' '),
      },
      size: {
        // sm: 32px高さ、16pxパディング、16pxアイコン
        sm: [
          'h-8 px-4 text-sm',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        ].join(' '),
        // default: 36px高さ（M3 Small準拠）、16pxパディング、16pxアイコン
        default: [
          'h-9 px-4 text-sm',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        ].join(' '),
        // lg: 44px高さ（Apple HIG準拠）、20pxパディング、20pxアイコン
        lg: [
          'h-11 px-4 text-base',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
        ].join(' '),
        // _square-sm: 32x32px、タップターゲット44px確保
        '_square-sm': [
          'size-8',
          'relative after:absolute after:inset-0 after:m-auto after:size-11 after:content-[""]',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        ].join(' '),
        // _square-default: 36x36px（M3準拠）、タップターゲット44px確保
        '_square-default': [
          'size-9',
          'relative after:absolute after:inset-0 after:m-auto after:size-11 after:content-[""]',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        ].join(' '),
        // _square-lg: 44x44px（Apple HIG準拠）
        '_square-lg': [
          'size-11',
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
        ].join(' '),
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'sm',
    },
  },
);

/** 外部に公開するサイズ型（_square-* は内部用） */
type ButtonSize = 'sm' | 'default' | 'lg';

export interface ButtonProps
  extends React.ComponentProps<'button'>, Omit<VariantProps<typeof buttonVariants>, 'size'> {
  /** 子要素にスタイルを委譲する（Linkなどで使用） */
  asChild?: boolean;
  /** ローディング状態 */
  isLoading?: boolean;
  /** ローディング中に表示するテキスト（省略時は children を表示） */
  loadingText?: string;
  /** ボタンサイズ */
  size?: ButtonSize | null;
  /** true にすると正方形のアイコンボタンになる */
  icon?: boolean;
}

/**
 * ボタンコンポーネント
 *
 * @example
 * // 基本的な使用（primary）
 * <Button>保存</Button>
 * <Button variant="primary">送信</Button>
 *
 * @example
 * // 副次アクション（outline）
 * <Button variant="outline">キャンセル</Button>
 *
 * @example
 * // アイコンボタン（ghost + icon）
 * <Button variant="ghost" icon aria-label="設定を開く">
 *   <Settings className="size-4" />
 * </Button>
 *
 * @example
 * // 破壊的アクション（destructive）
 * <Button variant="destructive">削除</Button>
 *
 * @example
 * // ローディング状態
 * <Button isLoading>保存中...</Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      icon,
      asChild = false,
      isLoading = false,
      loadingText,
      onClick,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    // icon prop で _square-{size} に解決
    const resolvedSize = icon ? (`_square-${size ?? 'sm'}` as const) : (size ?? undefined);

    // aria-disabled または isLoading 時はクリックを無効化
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (props['aria-disabled'] || isLoading) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    // ローディング中のコンテンツ
    const content = isLoading ? (
      <>
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {loadingText ?? children}
      </>
    ) : (
      children
    );

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
        onClick={asChild ? onClick : handleClick}
        disabled={isLoading || disabled}
        aria-busy={isLoading || undefined}
        ref={ref}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
