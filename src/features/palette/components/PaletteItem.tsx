'use client';

/**
 * PaletteItem — パレット内の個別ブロック
 *
 * BlockItem の re-export。
 * 後方互換のため palette feature 内から引き続き import 可能。
 */

export { BlockItem as PaletteItem } from '@/shell/components/sidebar';
export type { BlockDragData as PaletteDragData } from '@/shell/components/sidebar';
