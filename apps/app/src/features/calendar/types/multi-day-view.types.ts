import type { GridViewProps } from './base.types';

/** MultiDayView の固有Props（GridViewPropsを継承） */
export interface MultiDayViewProps extends GridViewProps {
  /** 表示する日数（2-9） */
  dayCount: number;
  centerDate?: Date;
}
