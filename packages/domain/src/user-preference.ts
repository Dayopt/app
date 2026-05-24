export const timeFormats = ['12h', '24h'] as const;
export const dateFormats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'dd/MM/yyyy'] as const;
export const weekStartsOnValues = [0, 1, 6] as const;

export type TimeFormat = (typeof timeFormats)[number];
export type DateFormat = (typeof dateFormats)[number];
export type WeekStartsOn = (typeof weekStartsOnValues)[number];

export type UserPreference = Readonly<{
  timezone: string;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  weekStartsOn: WeekStartsOn;
}>;

export function isTimeFormat(value: string): value is TimeFormat {
  return timeFormats.includes(value as TimeFormat);
}

export function isDateFormat(value: string): value is DateFormat {
  return dateFormats.includes(value as DateFormat);
}

export function isWeekStartsOn(value: number): value is WeekStartsOn {
  return weekStartsOnValues.includes(value as WeekStartsOn);
}
