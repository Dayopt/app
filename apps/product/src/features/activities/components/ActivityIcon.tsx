/**
 * ActivityIcon
 *
 * アクティビティのアイコンまたは色ドットを表示する統一コンポーネント。
 * icon が設定されていれば Lucide アイコンをカテゴリー色で着色、
 * 未設定（null）なら色ドットにフォールバック。
 * `neutral` が true の場合は icon/color を無視して中立マーカーを出す。
 *
 * 色を持つのはカテゴリーだけで、アクティビティはそれを継承する（#2162 §4-6）。
 * したがって「継承元が無い」状態が 2 通りあり、どちらも同じ中立表示になる — 詳細は
 * `neutral` prop の説明を読む。
 */

import { createElement } from 'react';

import type { LucideIcon as LucideIconType } from 'lucide-react';
import { icons, Minus } from 'lucide-react';

import { cn } from '@dayopt/components';
import { getCategoryColorClasses } from '../lib/category-colors';

import { CURATED_ICONS, DEFAULT_CATEGORY_ICON, kebabToPascal } from '../lib/curated-icons';

const SIZE_MAP = {
  sm: { icon: 'size-4', dot: 'size-3.5' },
  md: { icon: 'size-5', dot: 'size-3.5' },
  lg: { icon: 'size-8', dot: 'size-8' },
} as const;

/**
 * 中立マーカー（circle + Minus）の内側アイコンサイズ。
 * 外側の circle は SIZE_MAP[size].icon に揃え、通常のLucideアイコン表示と
 * 同じ footprint を保つ（レイアウトの再フローを避ける）。
 */
const NEUTRAL_ICON_SIZE_MAP = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-6',
} as const;

type ActivityIconSize = keyof typeof SIZE_MAP;

interface ActivityIconProps {
  /** Lucideアイコン名（kebab-case: "briefcase", "book-open"）。null/undefinedなら色ドット */
  icon: string | null | undefined;
  /** カテゴリーカラー名または旧HEX値 */
  color: string | null | undefined;
  /** サイズ: sm=16px, md=20px, lg=32px */
  size?: ActivityIconSize;
  /** 追加className */
  className?: string;
  /**
   * true なら icon/color を無視して中立マーカー（`bg-muted` + `Minus`）を出す。
   *
   * 色の継承元が無い状態を表す。該当するのは #2162 の語彙契約で**別概念**の 2 つで、
   * 見た目だけが共通している:
   *
   * - **未分類** — カテゴリーに所属していないアクティビティ（継承する色が無い）
   * - **アクティビティなし** — アクティビティが設定されていないブロック（実体が無い）
   *
   * 逆に「アクティビティもカテゴリーもあるが、そのカテゴリーの color が未設定」は
   * これに当たらない。false のままにして DEFAULT_CATEGORY_ICON /
   * DEFAULT_CATEGORY_COLOR への通常のフォールバックを使う。color/icon の null 判定
   * だけではこの 3 者を区別できないため、呼び出し元が categoryId / activityId 等の
   * 実在シグナルから明示的に渡すこと。
   */
  neutral?: boolean;
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

export function ActivityIcon({
  icon,
  color,
  size = 'md',
  className,
  neutral = false,
}: ActivityIconProps) {
  const sizeConfig = SIZE_MAP[size];

  // 中立マーカー。icon/color を無視するので、呼び出し元が古い / 無関係な値を
  // 渡していても影響しない。
  if (neutral) {
    return (
      <span
        data-slot="activity-icon-neutral"
        className={cn(
          'bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full',
          sizeConfig.icon,
          className,
        )}
        aria-hidden
      >
        <Minus className={NEUTRAL_ICON_SIZE_MAP[size]} />
      </span>
    );
  }

  const colorClasses = getCategoryColorClasses(color);

  const resolved = getIcon(icon || DEFAULT_CATEGORY_ICON);
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
