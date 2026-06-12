/**
 * レスポンシブブレークポイント定義
 *
 * Material Design 3 Window Size Classes準拠
 * @see https://m3.material.io/foundations/layout/applying-layout/window-size-classes
 * @see https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
 *
 * ## M3 Window Size Classes (幅基準)
 * | クラス     | 幅          | 用途                    |
 * |------------|-------------|------------------------|
 * | Compact    | < 600dp     | モバイル（縦向き）       |
 * | Medium     | 600-839dp   | タブレット（縦）、折り畳み |
 * | Expanded   | 840-1199dp  | タブレット（横）、小型PC  |
 * | Large      | 1200-1599dp | デスクトップ            |
 * | Extra-large| ≥ 1600dp    | 大型ディスプレイ         |
 *
 * ## Tailwind CSSとの対応
 * | M3          | Tailwind | ピクセル値 |
 * |-------------|----------|-----------|
 * | Compact     | (default)| < 768px   |
 * | Medium      | sm:      | ≥ 640px   |
 * | Expanded    | md:      | ≥ 768px   |
 * | Large       | lg:      | ≥ 1024px  |
 * | Extra-large | xl:      | ≥ 1280px  |
 *
 * Note: Tailwind v4のデフォルトブレークポイントを使用
 * モバイル判定は md: (768px) を境界とし、Tailwindの md:hidden 等と統一
 */

/**
 * ブレークポイント値（ピクセル）
 * Tailwind v4 デフォルト値
 */
export const BREAKPOINT_VALUES = {
  /** モバイル上限 */
  sm: 640,
  /** タブレット */
  md: 768,
  /** 小型デスクトップ */
  lg: 1024,
  /** デスクトップ */
  xl: 1280,
  /** 大型ディスプレイ */
  '2xl': 1536,
} as const;

/**
 * useMediaQuery用のクエリ文字列
 *
 * @example
 * ```tsx
 * import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
 * import { MEDIA_QUERIES } from '@/lib/breakpoints'
 *
 * const isMobile = useMediaQuery(MEDIA_QUERIES.mobile)
 * const isTablet = useMediaQuery(MEDIA_QUERIES.tablet)
 * const isDesktop = useMediaQuery(MEDIA_QUERIES.desktop)
 * ```
 */
export const MEDIA_QUERIES = {
  /** モバイル: < 768px (Tailwind md: 未満) */
  mobile: `(max-width: ${BREAKPOINT_VALUES.md - 1}px)`,
  /** タブレット: 768px - 1023px (M3 Medium/Expanded相当) */
  tablet: `(min-width: ${BREAKPOINT_VALUES.md}px) and (max-width: ${BREAKPOINT_VALUES.lg - 1}px)`,
  /** デスクトップ: ≥ 1024px (M3 Large相当) */
  desktop: `(min-width: ${BREAKPOINT_VALUES.lg}px)`,
  /** タッチデバイス判定 */
  touch: '(hover: none) and (pointer: coarse)',
  /** マウスデバイス判定 */
  mouse: '(hover: hover) and (pointer: fine)',
  /** ダークモード判定 */
  prefersDark: '(prefers-color-scheme: dark)',
  /** モーション軽減判定 */
  prefersReducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

/**
 * タッチターゲットサイズ（ピクセル）
 *
 * Material Design 3 アクセシビリティガイドライン準拠
 * @see https://m3.material.io/foundations/designing/structure
 *
 * ## サイズ基準
 * | サイズ    | 値    | 用途                      |
 * |----------|-------|--------------------------|
 * | minimum  | 44px  | WCAG 2.5.5 最小サイズ     |
 * | standard | 48px  | M3推奨（約9mm）          |
 * | large    | 56px  | FAB、重要なアクション      |
 *
 * ## アイコンサイズとの関係
 * アイコン24pxでもタッチターゲットは48pxを確保
 */
export const TOUCH_TARGET = {
  /** WCAG最小サイズ（44px = 11 * 4） */
  minimum: 44,
  /** M3推奨サイズ（48px = 12 * 4） */
  standard: 48,
  /** 大型ボタン用（56px = 14 * 4） */
  large: 56,
  /** タッチ要素間の最小マージン */
  spacing: 8,
} as const;

/**
 * デバイスタイプ判定用のヘルパー型
 */
type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * ブレークポイントに基づくデバイスタイプを取得
 *
 * @param width - ウィンドウ幅（ピクセル）
 * @returns デバイスタイプ
 */
export function getDeviceType(width: number): DeviceType {
  if (width < BREAKPOINT_VALUES.md) return 'mobile';
  if (width < BREAKPOINT_VALUES.lg) return 'tablet';
  return 'desktop';
}
