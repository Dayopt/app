/** DateDisplay コンポーネントのプロパティ */
export interface DateDisplayProps {
  date: Date;
  className?: string | undefined;
  isToday?: boolean | undefined;
  isSelected?: boolean | undefined;
  showDayName?: boolean | undefined;
  showMonthYear?: boolean | undefined;
  dayNameFormat?: 'short' | 'long' | 'narrow' | undefined;
  dateFormat?: string | undefined;
  onClick?: ((date: Date) => void) | undefined;
  onDoubleClick?: ((date: Date) => void) | undefined;
}
