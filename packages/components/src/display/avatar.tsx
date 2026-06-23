'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../cn';

/**
 * アバターサイズ定義
 *
 * ## サイズ設計（8pxグリッド準拠）
 *
 * | size    | サイズ | 用途                                         |
 * |---------|--------|----------------------------------------------|
 * | xs      | 20px   | インライン、コンパクトリスト                 |
 * | sm      | 32px   | コメント、通知                               |
 * | default | 40px   | 標準的なUI                                   |
 * | lg      | 48px   | プロフィールカード                           |
 * | xl      | 64px   | プロフィールページ、ヒーロー                 |
 * | 2xl     | 96px   | プロフィール編集                             |
 * | 3xl     | 120px  | アバター変更ダイアログ                       |
 */
const avatarVariants = cva('relative flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      xs: 'size-5',
      sm: 'size-8',
      default: 'size-10',
      lg: 'size-12',
      xl: 'size-16',
      '2xl': 'size-24',
      '3xl': 'size-30',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

interface AvatarProps
  extends React.ComponentProps<typeof AvatarPrimitive.Root>, VariantProps<typeof avatarVariants> {}

function Avatar({ className, size, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size }), className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn('bg-muted flex size-full items-center justify-center rounded-full', className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage, avatarVariants, type AvatarProps };
