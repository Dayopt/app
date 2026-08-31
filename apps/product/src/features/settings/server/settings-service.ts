import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  publicUserSettingsSelect,
  type Database,
  type Insert,
  type PublicUserSettingsRow,
} from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';
import { ServiceError } from '@/lib/trpc/errors';

type UserSettingsInsert = Pick<Insert<'user_settings'>, keyof PublicUserSettingsRow>;

interface UserSettingsUpdateInput {
  timezone?: string | undefined;
  timeFormat?: '24h' | '12h' | undefined;
  weekStartsOn?: 0 | 1 | 6 | undefined;
  showWeekends?: boolean | undefined;
  showWeekNumbers?: boolean | undefined;
  defaultDuration?: number | undefined;
  defaultView?: 'day' | '3day' | '5day' | 'week' | undefined;
  hourHeightDensity?: 'compact' | 'default' | 'spacious' | undefined;
  theme?: 'light' | 'dark' | 'system' | undefined;
  dismissedTrialEndedDialog?: true | undefined;
  paymentErrorDialogLastShownAt?: string | undefined;
  preferredLocale?: 'en' | 'ja' | undefined;
}

interface ProfileUpdateInput {
  fullName?: string | undefined;
  avatarUrl?: string | null | undefined;
}

export class SettingsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async get(userId: string) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select(publicUserSettingsSelect)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('User settings fetch failed');
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'settings',
        operation: 'get_user_settings',
      });
      throw new SettingsServiceError('FETCH_FAILED', 'Failed to fetch user settings', {
        cause: original,
      });
    }

    if (!data) return null;

    return {
      timezone: data.timezone,
      timeFormat: data.time_format as '24h' | '12h',
      weekStartsOn: data.week_starts_on as 0 | 1 | 6,
      showWeekends: data.show_weekends,
      showWeekNumbers: data.show_week_numbers,
      defaultDuration: data.default_duration,
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
    if (input.defaultView !== undefined) updateData.default_view = input.defaultView;
    if (input.hourHeightDensity !== undefined)
      updateData.hour_height_density = input.hourHeightDensity;
    if (input.theme !== undefined) updateData.theme = input.theme;
    if (input.preferredLocale !== undefined) updateData.preferred_locale = input.preferredLocale;

    const { data, error } = await this.supabase
      .from('user_settings')
      .upsert(updateData, { onConflict: 'user_id' })
      .select(publicUserSettingsSelect)
      .single();

    if (error) {
      logger.error('User settings update failed');
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'settings',
        operation: 'update_user_settings',
      });
      throw new SettingsServiceError('UPDATE_FAILED', 'Failed to update user settings', {
        cause: original,
      });
    }

    if (input.timezone !== undefined) invalidateUserTimezoneCache(userId);

    if (input.dismissedTrialEndedDialog !== undefined) {
      const { error: personalizationError } = await this.supabase.rpc('update_personalization', {
        p_user_id: userId,
        p_path: 'dismissedTrialEndedDialog',
        p_value: true,
      });
      if (personalizationError) {
        const original = captureUnexpectedDatabaseError(personalizationError, {
          feature: 'settings',
          operation: 'dismiss_trial_ended_dialog',
        });
        throw new SettingsServiceError('UPDATE_FAILED', 'Failed to update personalization', {
          cause: original,
        });
      }
    }
    if (input.paymentErrorDialogLastShownAt !== undefined) {
      const { error: personalizationError } = await this.supabase.rpc('update_personalization', {
        p_user_id: userId,
        p_path: 'paymentErrorDialogLastShownAt',
        p_value: input.paymentErrorDialogLastShownAt,
      });
      if (personalizationError) {
        const original = captureUnexpectedDatabaseError(personalizationError, {
          feature: 'settings',
          operation: 'update_payment_dialog_timestamp',
        });
        throw new SettingsServiceError('UPDATE_FAILED', 'Failed to update personalization', {
          cause: original,
        });
      }
    }

    return { success: true, settings: data };
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const updateData: Database['public']['Tables']['profiles']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (input.fullName !== undefined) updateData.full_name = input.fullName;
    if (input.avatarUrl !== undefined) updateData.avatar_url = input.avatarUrl;

    const { error } = await this.supabase.from('profiles').update(updateData).eq('id', userId);
    if (error) {
      logger.error('Profile update failed');
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'settings',
        operation: 'update_profile',
      });
      throw new SettingsServiceError('UPDATE_FAILED', 'Failed to update profile', {
        cause: original,
      });
    }

    return { success: true };
  }

  async getICalToken(userId: string) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('ical_feed_token')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('iCal token fetch failed');
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'settings',
        operation: 'get_ical_token',
      });
      throw new SettingsServiceError('FETCH_FAILED', 'Failed to fetch iCal token', {
        cause: original,
      });
    }

    return { token: data?.ical_feed_token ?? null };
  }

  async regenerateICalToken(userId: string) {
    const newToken = crypto.randomUUID();
    const { error } = await this.supabase
      .from('user_settings')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });

    if (error) {
      logger.error('iCal token initialization failed');
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'settings',
        operation: 'initialize_ical_token',
      });
      throw new SettingsServiceError('UPDATE_FAILED', 'Failed to initialize iCal token', {
        cause: original,
      });
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('user_settings')
      .update({ ical_feed_token: newToken })
      .eq('user_id', userId)
      .select('ical_feed_token')
      .single();

    if (updateError) {
      logger.error('iCal token update failed');
      const original = captureUnexpectedDatabaseError(updateError, {
        feature: 'settings',
        operation: 'regenerate_ical_token',
      });
      throw new SettingsServiceError('UPDATE_FAILED', 'Failed to regenerate iCal token', {
        cause: original,
      });
    }

    const token = (updated as Record<string, unknown>).ical_feed_token;
    return { token: token as string };
  }
}

export class SettingsServiceError extends ServiceError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'SettingsServiceError';
  }
}

export function createSettingsService(supabase: SupabaseClient<Database>): SettingsService {
  return new SettingsService(supabase);
}
