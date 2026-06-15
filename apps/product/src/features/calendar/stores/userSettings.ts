/**
 * UserSettings — app-wide preference + Calendar settings の統合型
 */

import type { UserPreference } from '@/lib/hooks/useUserPreferences';
import type { CalendarSettings } from '../hooks/useCalendarSettings';

/** user_settings query responseをUI向けに統合した設定オブジェクトの型 */
export type UserSettings = UserPreference & CalendarSettings;
