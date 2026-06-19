/**
 * タグカラー定義
 *
 * DBにはカラー名（"blue" 等）を保存。
 * レンダリングはCSS変数 + Tailwindクラス経由。HEXは使わない。
 *
 * @see @dayopt/foundations/src/tokens/colors.css — OKLCH値の定義
 * @see @dayopt/foundations/src/tailwind-theme.css — Tailwindマッピング
 */

// ========================================
// 文字数制限
// ========================================

/** タグ名の最大文字数（バックエンドと一致: z.string().max(50)） */
export const TAG_NAME_MAX_LENGTH = 50;

// ========================================
// カラー名一覧
// ========================================

/** 使用可能なタグカラー名の一覧 */
export const TAG_COLOR_NAMES = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
  'gray',
] as const;

/** タグカラー名の型 */
export type TagColorName = (typeof TAG_COLOR_NAMES)[number];

// ========================================
// カラー名 → クラス/CSS変数 マッピング
// ========================================

/** タグカラーのTailwindクラスとCSS変数のマッピング */
export interface TagColorEntry {
  /** border用 Tailwindクラス (e.g. 'border-tag-blue') */
  border: string;
  /** dot/icon背景用 Tailwindクラス (e.g. 'bg-tag-blue') */
  dot: string;
  /** card背景tint用 Tailwindクラス (e.g. 'bg-tag-blue-tint') */
  tint: string;
  /** inline style用 CSS変数 (e.g. 'var(--tag-blue)') */
  cssVar: string;
  /** inline style用 tint CSS変数 (e.g. 'var(--tag-blue-tint)') */
  cssVarTint: string;
}

/**
 * Tailwind v4 safelist — テンプレートリテラルはJITスキャナーに検出されないため、
 * 全タグカラーのクラス名をフル文字列で列挙してCSS生成を保証する。
 *
 * bg-tag-red bg-tag-orange bg-tag-amber bg-tag-green bg-tag-teal
 * bg-tag-blue bg-tag-indigo bg-tag-violet bg-tag-pink bg-tag-gray
 * bg-tag-red-tint bg-tag-orange-tint bg-tag-amber-tint bg-tag-green-tint bg-tag-teal-tint
 * bg-tag-blue-tint bg-tag-indigo-tint bg-tag-violet-tint bg-tag-pink-tint bg-tag-gray-tint
 * border-tag-red border-tag-orange border-tag-amber border-tag-green border-tag-teal
 * border-tag-blue border-tag-indigo border-tag-violet border-tag-pink border-tag-gray
 */
function entry(name: TagColorName): TagColorEntry {
  return {
    border: `border-tag-${name}`,
    dot: `bg-tag-${name}`,
    tint: `bg-tag-${name}-tint`,
    cssVar: `var(--tag-${name})`,
    cssVarTint: `var(--tag-${name}-tint)`,
  };
}

/** タグカラー名からTailwindクラス/CSS変数へのマッピングテーブル */
export const TAG_COLOR_MAP: Record<TagColorName, TagColorEntry> = {
  red: entry('red'),
  orange: entry('orange'),
  amber: entry('amber'),
  green: entry('green'),
  teal: entry('teal'),
  blue: entry('blue'),
  indigo: entry('indigo'),
  violet: entry('violet'),
  pink: entry('pink'),
  gray: entry('gray'),
} as const;

// ========================================
// デフォルト値
// ========================================

/** タグのデフォルトカラー */
export const DEFAULT_TAG_COLOR: TagColorName = 'blue';

// ========================================
// ブリッジ関数（HEX / 名前 / null → TagColorName）
// ========================================

/** 旧HEX→名前マッピング（DB移行期間用） */
const LEGACY_HEX_MAP: Record<string, TagColorName> = {
  '#3b82f6': 'blue',
  '#10b981': 'green',
  '#ef4444': 'red',
  '#f59e0b': 'amber',
  '#8b5cf6': 'violet',
  '#ec4899': 'pink',
  '#06b6d4': 'teal', // 旧 cyan
  '#f97316': 'orange',
  '#6b7280': 'gray',
  '#6366f1': 'indigo',
};

const TAG_COLOR_SET = new Set<string>(TAG_COLOR_NAMES);

/**
 * カラー値を安全にTagColorNameへ解決
 *
 * - 有効な名前 → そのまま返す
 * - 旧HEX値 → 対応する名前に変換
 * - null / undefined / 不明 → デフォルト（blue）
 */
export function resolveTagColor(color: string | null | undefined): TagColorName {
  if (!color) return DEFAULT_TAG_COLOR;
  if (TAG_COLOR_SET.has(color)) return color as TagColorName;
  return LEGACY_HEX_MAP[color.toLowerCase()] ?? DEFAULT_TAG_COLOR;
}

/**
 * カラー値からクラス群を取得
 *
 * HEX / 名前 / null を受け付ける。
 * コンポーネントはこの関数経由でクラスを決定する。
 */
export function getTagColorClasses(color: string | null | undefined): TagColorEntry {
  return TAG_COLOR_MAP[resolveTagColor(color)];
}
