/**
 * Reminder utility functions
 *
 * リマインダーはON/OFFのトグルのみ:
 * - ON (reminder_minutes = 0): ブロック開始時に通知
 * - OFF (reminder_minutes = null): 通知なし
 */

/** リマインダーの分数値の型（0 = ON, null = OFF） */
export type ReminderMinutes = 0 | null;

/** リマインダーがONかどうかを判定 */
export function isReminderEnabled(minutes: number | null): boolean {
  return minutes === 0;
}

/** boolean → reminder_minutes 変換 */
export function reminderEnabledToMinutes(enabled: boolean): ReminderMinutes {
  return enabled ? 0 : null;
}
