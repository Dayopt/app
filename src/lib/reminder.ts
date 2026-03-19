/**
 * Reminder utility functions
 *
 * REMINDER_OPTIONS: i18n key-based option definitions for ReminderSelect
 * getReminderI18nKey: minutes → i18n key lookup
 */

/**
 * Reminder option definitions
 * Each option maps a minutes value to its i18n key
 */
export const REMINDER_OPTIONS = [
  { minutes: null, i18nKey: 'common.reminder.none' },
  { minutes: 0, i18nKey: 'common.reminder.atStart' },
  { minutes: 5, i18nKey: 'common.reminder.min5' },
  { minutes: 10, i18nKey: 'common.reminder.min10' },
  { minutes: 15, i18nKey: 'common.reminder.min15' },
  { minutes: 30, i18nKey: 'common.reminder.min30' },
  { minutes: 60, i18nKey: 'common.reminder.hour1' },
  { minutes: 1440, i18nKey: 'common.reminder.day1' },
  { minutes: 10080, i18nKey: 'common.reminder.week1' },
] as const;

/** リマインダーの分数値の型（REMINDER_OPTIONSに定義された値のみ） */
export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number]['minutes'];

/**
 * Get the i18n key for a given reminder minutes value
 *
 * @param minutes - reminder_minutes value (null = no reminder)
 * @returns i18n key string
 *
 * @example
 * getReminderI18nKey(null)  // => 'common.reminder.none'
 * getReminderI18nKey(0)     // => 'common.reminder.atStart'
 * getReminderI18nKey(10)    // => 'common.reminder.min10'
 * getReminderI18nKey(15)    // => 'common.reminder.custom'
 */
export function getReminderI18nKey(minutes: number | null): string {
  const option = REMINDER_OPTIONS.find((opt) => opt.minutes === minutes);
  return option?.i18nKey ?? 'common.reminder.custom';
}
