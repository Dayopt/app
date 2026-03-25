/**
 * キュレート済みLucideアイコンリスト
 *
 * タグ用に厳選した約60個のアイコン。
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
  // 仕事・生産性
  'briefcase',
  'laptop',
  'code',
  'file-text',
  'mail',
  'phone',
  'video',
  'monitor',
  'calculator',
  'presentation',
  // 学習
  'book-open',
  'graduation-cap',
  'pen-tool',
  'brain',
  'lightbulb',
  'library',
  'notebook-pen',
  'languages',
  // 健康・運動
  'heart',
  'dumbbell',
  'bike',
  'footprints',
  'apple',
  'moon',
  'sun',
  'bed',
  'activity',
  // 生活・移動
  'home',
  'shopping-cart',
  'car',
  'train',
  'plane',
  'map-pin',
  'clock',
  'wallet',
  // 趣味・娯楽
  'music',
  'gamepad-2',
  'camera',
  'palette',
  'film',
  'headphones',
  'mountain',
  // 食事
  'utensils',
  'coffee',
  'wine',
  'pizza',
  'cookie',
  'cup-soda',
  // コミュニケーション
  'users',
  'message-circle',
  'smile',
  'gift',
  'party-popper',
  'phone-call',
] as const;

/** キュレートアイコンかどうかチェック */
export function isCuratedIcon(name: string): boolean {
  return CURATED_ICONS.includes(name);
}
