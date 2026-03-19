import { ReactNode } from 'react';

/** カレンダービュータイプ */
export type CalendarView =
  | 'day'
  | 'split-day'
  | '3day'
  | '5day'
  | 'week'
  | 'week-no-weekend'
  | 'schedule';

/** スライドアニメーションの方向 */
export type SlideDirection = 'left' | 'right' | 'up' | 'down';

/** GPU加速用のスタイル定数 */
export const GPU_OPTIMIZED_STYLES = {
  willChange: 'transform, opacity' as const,
  backfaceVisibility: 'hidden' as const,
  perspective: 1000,
  transformStyle: 'preserve-3d' as const,
};

/** アニメーション設定（ビュー切り替え・スライド・イベント展開等） */
export const ANIMATION_CONFIG = {
  // ビュー切り替え
  viewTransition: {
    duration: 0.4,
    ease: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
    staggerChildren: 0.05,
  },

  // スライド遷移
  slideTransition: {
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  },

  // イベント展開
  eventExpansion: {
    duration: 0.25,
    ease: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
  },

  // 高速アニメーション（reducedMotion時）
  reduced: {
    duration: 0.1,
    ease: 'linear' as const,
  },
} as const;

/** AdvancedViewTransition コンポーネントのプロパティ */
export interface AdvancedViewTransitionProps {
  currentView: CalendarView;
  children: ReactNode;
  className?: string;
  onTransitionComplete?: () => void;
}

/** AdvancedSlideTransition コンポーネントのプロパティ */
export interface AdvancedSlideTransitionProps {
  direction: SlideDirection;
  children: ReactNode;
  className?: string;
  duration?: number;
  onComplete?: () => void;
}

/** EventCollapse コンポーネントのプロパティ */
export interface EventCollapseProps {
  isExpanded: boolean;
  children: ReactNode;
  maxHeight?: number;
  className?: string;
}

/** ViewTransition コンポーネントのプロパティ */
export interface ViewTransitionProps {
  children: ReactNode;
  viewType: string;
  className?: string;
}

/** TaskDragAnimation コンポーネントのプロパティ */
export interface TaskDragAnimationProps {
  isDragging: boolean;
  children: ReactNode;
}

/** HoverEffect コンポーネントのプロパティ */
export interface HoverEffectProps {
  children: ReactNode;
  isHovered: boolean;
  disabled?: boolean;
}

/** FadeTransition コンポーネントのプロパティ */
export interface FadeTransitionProps {
  show: boolean;
  children: ReactNode;
  duration?: number;
  className?: string;
}

/** SlideTransition コンポーネントのプロパティ */
export interface SlideTransitionProps {
  show: boolean;
  direction?: 'up' | 'down' | 'left' | 'right';
  children: ReactNode;
  duration?: number;
  className?: string;
}

/** TaskCreateAnimation コンポーネントのプロパティ */
export interface TaskCreateAnimationProps {
  children: ReactNode;
  isNew?: boolean;
}

/** CalendarViewAnimation コンポーネントのプロパティ */
export interface CalendarViewAnimationProps {
  children: ReactNode;
  viewType: string;
  previousViewType?: string;
}

/** SkeletonAnimation コンポーネントのプロパティ */
export interface SkeletonAnimationProps {
  show: boolean;
  count?: number;
  height?: string;
  className?: string;
}

/** TaskHoverTooltip コンポーネントのプロパティ */
export interface TaskHoverTooltipProps {
  show: boolean;
  children: ReactNode;
  position?: { x: number; y: number };
}

/** AnimationWrapper コンポーネントのプロパティ */
export interface AnimationWrapperProps {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** アニメーションコンテキストの状態 */
export interface AnimationContextType {
  enabled: boolean;
  reducedMotion: boolean;
  duration: 'fast' | 'normal' | 'slow';
}

/** AnimationProvider コンポーネントのプロパティ */
export interface AnimationProviderProps {
  children: ReactNode;
  config?: Partial<AnimationContextType>;
}

/** StaggeredAnimation コンポーネントのプロパティ */
export interface StaggeredAnimationProps {
  children: React.ReactNode[];
  staggerDelay?: number;
  className?: string;
}

/** SpringAnimation コンポーネントのプロパティ */
export interface SpringAnimationProps {
  children: React.ReactNode;
  isActive: boolean;
  springConfig?: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  className?: string;
}

/** Parallax コンポーネントのプロパティ */
export interface ParallaxProps {
  children: React.ReactNode;
  offset: number;
  className?: string;
}

/** PerformanceIndicator コンポーネントのプロパティ */
export interface PerformanceIndicatorProps {
  isLoading: boolean;
  progress?: number;
  className?: string;
}

/** TouchAnimation コンポーネントのプロパティ */
export interface TouchAnimationProps {
  children: React.ReactNode;
  onTap?: () => void;
  className?: string;
}

/** OptimizedListAnimation コンポーネントのプロパティ */
export interface OptimizedListAnimationProps {
  children: React.ReactNode[];
  itemHeight: number;
  visibleItems: number;
  className?: string;
}
