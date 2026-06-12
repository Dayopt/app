/**
 * キュレート済みLucideアイコンリスト
 *
 * タグ用に厳選した48個のアイコン（8列×6行）。
 * lucide-react の `icons` オブジェクトのキーは PascalCase なので、
 * kebab-case → PascalCase 変換ユーティリティも提供。
 */

/** kebab-case → PascalCase 変換（例: "book-open" → "BookOpen"） */
export function kebabToPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** デフォルトアイコン（タグ新規作成時の初期値） */
export const DEFAULT_TAG_ICON = 'tag';

/** タグ用キュレート済みアイコン（kebab-case） */
export const CURATED_ICONS: readonly string[] = [
  // デフォルト
  'tag',
  // 仕事
  'briefcase',
  'laptop',
  'code',
  'file-text',
  'presentation',
  // 会議・通話
  'users',
  'video',
  'phone',
  'mic',
  // メール・事務
  'mail',
  'clipboard-list',
  'calculator',
  // 学習
  'book-open',
  'graduation-cap',
  'brain',
  'notebook-pen',
  // 運動
  'dumbbell',
  'bike',
  'footprints',
  // 食事
  'utensils',
  'coffee',
  // 移動
  'car',
  'train',
  'plane',
  'map-pin',
  // 生活
  'home',
  'shopping-cart',
  'wallet',
  // 休息
  'moon',
  'bed',
  'sun',
  'bath',
  // 趣味
  'music',
  'camera',
  'palette',
  'gamepad-2',
  'headphones',
  'mountain',
  // 社交
  'smile',
  'gift',
  'party-popper',
  'wine',
  // 健康
  'heart',
  'apple',
  // クリエイティブ
  'lightbulb',
  'pencil',
  'sparkles',
] as const;
