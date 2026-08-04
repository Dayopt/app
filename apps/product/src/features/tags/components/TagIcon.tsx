/**
 * TagIcon
 *
 * タグのアイコンまたは色ドットを表示する統一コンポーネント。
 * icon が設定されていれば Lucide アイコンをタグ色で着色、
 * 未設定（null）なら従来の色ドットにフォールバック。
 * `isUncategorized` が true の場合は icon/color を無視し、
 * タグ自体が存在しない（未分類）ことを示す中立表示にする。
 */

import { createElement } from 'react';

import type { LucideIcon as LucideIconType } from 'lucide-react';
import { icons, Minus } from 'lucide-react';

import { cn } from '@dayopt/components';
import { getTagColorClasses } from '../lib/tag-colors';

import { CURATED_ICONS, DEFAULT_TAG_ICON, kebabToPascal } from '../lib/curated-icons';

const SIZE_MAP = {
  sm: { icon: 'size-4', dot: 'size-3.5' },
  md: { icon: 'size-5', dot: 'size-3.5' },
  lg: { icon: 'size-8', dot: 'size-8' },
} as const;

/**
 * 未分類マーカー（中立circle + Minus）の内側アイコンサイズ。
 * 外側の circle は SIZE_MAP[size].icon に揃え、通常のLucideアイコン表示と
 * 同じ footprint を保つ（レイアウトの再フローを避ける）。
 */
const UNCATEGORIZED_ICON_SIZE_MAP = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-6',
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
  /**
   * true ならタグ自体が存在しない（未分類）ことを示す中立表示にする。
   * icon/color の値に関わらず優先される。
   *
   * タグが実在するが color/icon が未設定（例: 既存タグの color=null）の
   * ケースはこれと区別し false のままにする — その場合は DEFAULT_TAG_ICON /
   * DEFAULT_TAG_COLOR への通常のフォールバックを使う。color/icon の null 判定
   * だけでは「タグなし」と「タグはあるが未設定」を区別できないため、
   * 呼び出し元が tagId / tagName 等の実在シグナルから明示的に渡すこと。
   */
  isUncategorized?: boolean;
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

export function TagIcon({
  icon,
  color,
  size = 'md',
  className,
  isUncategorized = false,
}: TagIconProps) {
  const sizeConfig = SIZE_MAP[size];

  // 未分類（タグ自体が存在しない）: Review の TimePLTagMarker と同じ中立表現に揃える。
  // icon/color を無視するので、呼び出し元が古い/無関係な値を渡していても影響しない。
  if (isUncategorized) {
    return (
      <span
        data-slot="tag-icon-uncategorized"
        className={cn(
          'bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full',
          sizeConfig.icon,
          className,
        )}
        aria-hidden
      >
        <Minus className={UNCATEGORIZED_ICON_SIZE_MAP[size]} />
      </span>
    );
  }

  const colorClasses = getTagColorClasses(color);

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
