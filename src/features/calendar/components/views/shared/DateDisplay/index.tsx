// DateDisplay コンポーネント群
export { DateDisplay } from './DateDisplay';

// 型定義
export type * from './DateDisplay.types';

// ヘッダー関連の共有コンポーネント（ビュー専用）
// ページ全体のヘッダー機能は layout/Header/ を使用
export { CompactDateNavigator, DateNavigator } from '@/lib/components/common/DateNavigator';
export type { NavigationDirection } from '@/lib/components/common/DateNavigator';
export { CompactDateDisplay, DateRangeDisplay } from '../../../layout/Header/DateRangeDisplay';
export { ViewSwitcher } from '../../../layout/Header/ViewSwitcher';
