import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import { invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';
import { ServiceError } from '@/lib/trpc/errors';
import type { Database, Insert } from '@dayopt/database';

type UserSettingsInsert = Insert<'user_settings'>;

interface UserSettingsUpdateInput {
  timezone?: string | undefined;
  timeFormat?: '24h' | '12h' | undefined;
  weekStartsOn?: 0 | 1 | 6 | undefined;
  showWeekends?: boolean | undefined;
  showWeekNumbers?: boolean | undefined;
  defaultDuration?: number | undefined;
  snapInterval?: 5 | 10 | 15 | 30 | undefined;
  defaultView?: 'day' | '3day' | '5day' | 'week' | undefined;
  hourHeightDensity?: 'compact' | 'default' | 'spacious' | undefined;
  theme?: 'light' | 'dark' | 'system' | undefined;
  dismissedTrialEndedDialog?: true | undefined;
  paymentErrorDialogLastShownAt?: string | undefined;
  preferredLocale?: 'en' | 'ja' | undefined;
}

export class SettingsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async get(userId: string) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('UserSettings fetch error', { error });
      throw new SettingsServiceError('FETCH_FAILED', error.message);
    }

    if (!data) return null;

    return {
      timezone: data.timezone,
      timeFormat: data.time_format as '24h' | '12h',
      weekStartsOn: data.week_starts_on as 0 | 1 | 6,
      showWeekends: data.show_weekends,
      showWeekNumbers: data.show_week_numbers,
      defaultDuration: data.default_duration,
      snapInterval: data.snap_interval as 5 | 10 | 15 | 30,
      defaultView: data.default_view as 'day' | '3day' | '5day' | 'week' | undefined,
      hourHeightDensity: data.hour_height_density as 'compact' | 'default' | 'spacious' | undefined,
      theme: data.theme as 'light' | 'dark' | 'system',
      personalization: (() => {
        const personalization = (data as Record<string, unknown>).personalization as Record<
          string,
          unknown
        > | null;
        return {
          dismissedTrialEndedDialog: (personalization?.dismissedTrialEndedDialog ??
            false) as boolean,
          paymentErrorDialogLastShownAt: (personalization?.paymentErrorDialogLastShownAt ??
            null) as string | null,
        };
      })(),
      preferredLocale: (data.preferred_locale as 'en' | 'ja' | undefined) ?? 'en',
    };
  }

  async update(userId: string, input: UserSettingsUpdateInput) {
    const updateData: UserSettingsInsert = { user_id: userId };

    if (input.timezone !== undefined) updateData.timezone = input.timezone;
    if (input.timeFormat !== undefined) updateData.time_format = input.timeFormat;
    if (input.weekStartsOn !== undefined) updateData.week_starts_on = input.weekStartsOn;
    if (input.showWeekends !== undefined) updateData.show_weekends = input.showWeekends;
    if (input.showWeekNumbers !== undefined) updateData.show_week_numbers = input.showWeekNumbers;
    if (input.defaultDuration !== undefined) updateData.default_duration = input.defaultDuration;
    if (input.snapInterval !== undefined) updateData.snap_interval = input.snapInterval;
    if (input.defaultView !== undefined) updateData.default_view = input.defaultView;
    if (input.hourHeightDensity !== undefined)
      updateData.hour_height_density = input.hourHeightDensity;
    if (input.theme !== undefined) updateData.theme = input.theme;
    if (input.preferredLocale !== undefined) updateData.preferred_locale = input.preferredLocale;

    const { data, error } = await this.supabase
      .from('user_settings')
      .upsert(updateData, { onConflict: 'user_id' })
      .select()
      .single();

    if (!error && input.timezone !== undefined) {
      invalidateUserTimezoneCache(userId);
    }

    if (input.dismissedTrialEndedDialog !== undefined) {
      await this.supabase.rpc('update_personalization', {
        p_user_id: userId,
        p_path: 'dismissedTrialEndedDialog',
        p_value: true,
      });
    }
    if (input.paymentErrorDialogLastShownAt !== undefined) {
      await this.supabase.rpc('update_personalization', {
        p_user_id: userId,
        p_path: 'paymentErrorDialogLastShownAt',
        p_value: input.paymentErrorDialogLastShownAt,
      });
    }

    if (error) {
      logger.error('UserSettings update error', { error });
      throw new SettingsServiceError('UPDATE_FAILED', error.message);
    }

    return { success: true, settings: data };
  }

  async getICalToken(userId: string) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('iCal token fetch error:', error);
      throw new SettingsServiceError('FETCH_FAILED', error.message);
    }

    const token = (data as Record<string, unknown> | null)?.ical_feed_token;
    return { token: (token as string) ?? null };
  }

  async regenerateICalToken(userId: string) {
    const newToken = crypto.randomUUID();
    const { error } = await this.supabase
      .from('user_settings')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });

    if (error) {
      logger.error('iCal token upsert error:', error);
      throw new SettingsServiceError('UPDATE_FAILED', error.message);
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('user_settings')
      .update({ ical_feed_token: newToken } as never)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      logger.error('iCal token update error:', updateError);
      throw new SettingsServiceError('UPDATE_FAILED', updateError.message);
    }

    const token = (updated as Record<string, unknown>).ical_feed_token;
    return { token: token as string };
  }
}

export class SettingsServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'SettingsServiceError';
  }
}

export function createSettingsService(supabase: SupabaseClient<Database>): SettingsService {
  return new SettingsService(supabase);
}
