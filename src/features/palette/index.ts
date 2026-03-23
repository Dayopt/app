/**
 * Palette Feature - Public API
 *
 * よく使うブロックのクイック配置機能。
 * サイドバーに表示し、ワンタップで現在時刻にエントリを作成する。
 */

export { Palette } from './components/Palette';

// Types (re-exported from shared component)
export type { BlockDragData as PaletteDragData } from '@/shell/components/sidebar';

// Hooks
export { usePaletteMutations } from './hooks/usePaletteMutations';
