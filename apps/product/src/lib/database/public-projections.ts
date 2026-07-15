import type { Row } from './types';

export const publicRecordSelect =
  'id, user_id, tag_id, plan_id, external_calendar_event_id, title, note, start_at, end_at, source, deleted_at, created_at, updated_at' as const;

export type PublicRecordRow = Pick<
  Row<'records'>,
  | 'id'
  | 'user_id'
  | 'tag_id'
  | 'plan_id'
  | 'external_calendar_event_id'
  | 'title'
  | 'note'
  | 'start_at'
  | 'end_at'
  | 'source'
  | 'deleted_at'
  | 'created_at'
  | 'updated_at'
>;

export const publicUserSettingsSelect =
  'id, user_id, timezone, time_format, week_starts_on, show_weekends, show_week_numbers, default_duration, snap_interval, default_view, hour_height_density, theme, personalization, preferred_locale, ical_feed_token, created_at, updated_at' as const;

export type PublicUserSettingsRow = Pick<
  Row<'user_settings'>,
  | 'id'
  | 'user_id'
  | 'timezone'
  | 'time_format'
  | 'week_starts_on'
  | 'show_weekends'
  | 'show_week_numbers'
  | 'default_duration'
  | 'snap_interval'
  | 'default_view'
  | 'hour_height_density'
  | 'theme'
  | 'personalization'
  | 'preferred_locale'
  | 'ical_feed_token'
  | 'created_at'
  | 'updated_at'
>;
