/**
 * TagIcon
 *
 * タグのアイコンまたは色ドットを表示する統一コンポーネント。
 * icon が設定されていれば Lucide アイコンをタグ色で着色、
 * 未設定（null）なら従来の色ドットにフォールバック。
 */

import { createElement } from 'react';

import type { LucideIcon as LucideIconType } from 'lucide-react';
import { icons } from 'lucide-react';

import { cn } from '@dayopt/components';
import { getTagColorClasses } from '../lib/tag-colors';

import { CURATED_ICONS, DEFAULT_TAG_ICON, kebabToPascal } from '../lib/curated-icons';

const SIZE_MAP = {
  sm: { icon: 'size-4', dot: 'size-3.5' },
  md: { icon: 'size-5', dot: 'size-3.5' },
  lg: { icon: 'size-8', dot: 'size-8' },
} as const;

type TagIconSize = keyof typeof SIZE_MAP;

interface TagIconProps {
  /** Lucideアイコン名（kebab-case: "briefcase", "book-open"）。null/undefinedなら色ドット */
  icon: string | null | undefined;
  /** タグカラー名または旧HEX値 */
  color: string | null | undefined;
  /** サイズ: sm=16px, md=20px, lg=32px */
  size?: TagIconSize;
  /** 追加className */
  className?: string;
}

/**
 * モジュールレベルでアイコンマップを構築。
 * render中のコンポーネント生成を回避するため、事前にキャッシュ。
 */
const ICON_MAP: Map<string, LucideIconType> = new Map();

// キュレートアイコンを事前登録
for (const name of CURATED_ICONS) {
  const pascal = kebabToPascal(name);
  const component = icons[pascal as keyof typeof icons];
  if (component) {
    ICON_MAP.set(name, component);
  }
}

/** アイコン名からLucideコンポーネントを取得（キャッシュ済み） */
function getIcon(name: string): LucideIconType | undefined {
  const cached = ICON_MAP.get(name);
  if (cached) return cached;

  const pascal = kebabToPascal(name);
  const component = icons[pascal as keyof typeof icons] ?? icons[name as keyof typeof icons];
  if (component) {
    ICON_MAP.set(name, component);
    return component;
  }
  return undefined;
}

export function TagIcon({ icon, color, size = 'md', className }: TagIconProps) {
  const colorClasses = getTagColorClasses(color);
  const sizeConfig = SIZE_MAP[size];

  const resolved = getIcon(icon || DEFAULT_TAG_ICON);
  if (resolved) {
    return createElement(resolved, {
      className: cn(sizeConfig.icon, className),
      style: { color: colorClasses.cssVar },
      'aria-hidden': true,
    });
  }

  // フォールバック: 色ドット（アイコン解決に失敗した場合のみ）
  return (
    <span className={cn('rounded-full', colorClasses.dot, sizeConfig.dot, className)} aria-hidden />
  );
}
