'use client';

/**
 * PaletteItem — パレット内の個別ブロック
 *
 * SidebarBlockItem の re-export。
 * 後方互換のため palette feature 内から引き続き import 可能。
 */

export { SidebarBlockItem as PaletteItem } from '@/shell/components/SidebarBlockItem';
export type { SidebarBlockDragData as PaletteDragData } from '@/shell/components/SidebarBlockItem';
