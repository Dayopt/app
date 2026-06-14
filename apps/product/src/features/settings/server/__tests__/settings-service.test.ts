import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { SettingsService, SettingsServiceError } from '../settings-service';

const invalidateUserTimezoneCache = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/user-timezone-cache', () => ({
  invalidateUserTimezoneCache,
}));

const USER_ID = 'user-1';

const settingsRow = {
  id: 'settings-1',
  user_id: USER_ID,
  timezone: 'Asia/Tokyo',
  time_format: '24h',
  week_starts_on: 1,
  show_weekends: true,
  show_week_numbers: false,
  default_duration: 30,
  snap_interval: 15,
  chronotype_settings: null,
  default_view: 'week',
  hour_height_density: 'default',
  theme: 'system',
  personalization: {
    dismissedTrialEndedDialog: true,
    paymentErrorDialogLastShownAt: '2026-06-15T00:00:00.000Z',
  },
  preferred_locale: 'ja',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-15T00:00:00.000Z',
};

function createService(
  queries: Array<ReturnType<typeof createChainableMock>>,
  rpc = vi.fn().mockResolvedValue({ data: null, error: null }),
) {
  const from = vi.fn(() => {
    const query = queries.shift();
    if (!query) throw new Error('Unexpected Supabase query');
    return query;
  });

  return {
    service: new SettingsService({ from, rpc } as never),
    from,
    rpc,
  };
}

describe('SettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('snake_case の設定を既存のレスポンス形へ変換する', async () => {
      const query = createChainableMock(settingsRow);
      const { service } = createService([query]);

      const result = await service.get(USER_ID);

      expect(result).toMatchObject({
        timezone: 'Asia/Tokyo',
        timeFormat: '24h',
        weekStartsOn: 1,
        defaultDuration: 30,
        snapInterval: 15,
        defaultView: 'week',
        hourHeightDensity: 'default',
        theme: 'system',
        preferredLocale: 'ja',
        personalization: {
          dismissedTrialEndedDialog: true,
          paymentErrorDialogLastShownAt: '2026-06-15T00:00:00.000Z',
        },
      });
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('設定未作成の PGRST116 は null を返す', async () => {
      const query = createChainableMock(null, { message: 'No rows', code: 'PGRST116' });
      const { service } = createService([query]);

      await expect(service.get(USER_ID)).resolves.toBeNull();
    });

    it('取得エラーは SettingsServiceError にする', async () => {
      const query = createChainableMock(null, { message: 'Fetch failed', code: 'PGRST000' });
      const { service } = createService([query]);

      await expect(service.get(USER_ID)).rejects.toMatchObject({
        name: 'SettingsServiceError',
        code: 'FETCH_FAILED',
        message: 'Fetch failed',
      });
    });
  });

  describe('update', () => {
    it('camelCase input を upsert payload に変換し timezone cache を無効化する', async () => {
      const query = createChainableMock(settingsRow);
      const { service } = createService([query]);

      const result = await service.update(USER_ID, {
        timezone: 'America/New_York',
        timeFormat: '12h',
        weekStartsOn: 0,
        showWeekends: false,
        showWeekNumbers: true,
        defaultDuration: 45,
        snapInterval: 5,
        defaultView: '3day',
        hourHeightDensity: 'compact',
        theme: 'dark',
        preferredLocale: 'en',
      });

      expect(query.upsert).toHaveBeenCalledWith(
        {
          user_id: USER_ID,
          timezone: 'America/New_York',
          time_format: '12h',
          week_starts_on: 0,
          show_weekends: false,
          show_week_numbers: true,
          default_duration: 45,
          snap_interval: 5,
          default_view: '3day',
          hour_height_density: 'compact',
          theme: 'dark',
          preferred_locale: 'en',
        },
        { onConflict: 'user_id' },
      );
      expect(invalidateUserTimezoneCache).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({ success: true, settings: settingsRow });
    });

    it('personalization を2つの atomic RPC で部分更新する', async () => {
      const query = createChainableMock(settingsRow);
      const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      const { service } = createService([query], rpc);

      await service.update(USER_ID, {
        dismissedTrialEndedDialog: true,
        paymentErrorDialogLastShownAt: '2026-06-15T00:00:00.000Z',
      });

      expect(rpc).toHaveBeenNthCalledWith(1, 'update_personalization', {
        p_user_id: USER_ID,
        p_path: 'dismissedTrialEndedDialog',
        p_value: true,
      });
      expect(rpc).toHaveBeenNthCalledWith(2, 'update_personalization', {
        p_user_id: USER_ID,
        p_path: 'paymentErrorDialogLastShownAt',
        p_value: '2026-06-15T00:00:00.000Z',
      });
    });

    it('upsert エラーでは cache を無効化せず UPDATE_FAILED を投げる', async () => {
      const query = createChainableMock(null, { message: 'Update failed', code: 'PGRST000' });
      const { service } = createService([query]);

      await expect(service.update(USER_ID, { timezone: 'UTC' })).rejects.toBeInstanceOf(
        SettingsServiceError,
      );
      expect(invalidateUserTimezoneCache).not.toHaveBeenCalled();
    });
  });

  describe('iCal token', () => {
    it('保存済みtokenを返す', async () => {
      const query = createChainableMock({ ...settingsRow, ical_feed_token: 'token-1' });
      const { service } = createService([query]);

      await expect(service.getICalToken(USER_ID)).resolves.toEqual({ token: 'token-1' });
    });

    it('設定未作成なら null token を返す', async () => {
      const query = createChainableMock(null, { message: 'No rows', code: 'PGRST116' });
      const { service } = createService([query]);

      await expect(service.getICalToken(USER_ID)).resolves.toEqual({ token: null });
    });

    it('rowを確保してから新しいtokenへ更新する', async () => {
      const upsertQuery = createChainableMock(settingsRow);
      const updateQuery = createChainableMock({ ...settingsRow, ical_feed_token: 'token-new' });
      const { service } = createService([upsertQuery, updateQuery]);
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');

      const result = await service.regenerateICalToken(USER_ID);

      expect(upsertQuery.upsert).toHaveBeenCalledWith(
        { user_id: USER_ID },
        { onConflict: 'user_id' },
      );
      expect(updateQuery.update).toHaveBeenCalledWith({
        ical_feed_token: '00000000-0000-4000-8000-000000000001',
      });
      expect(result).toEqual({ token: 'token-new' });
    });

    it('token更新エラーは UPDATE_FAILED を投げる', async () => {
      const upsertQuery = createChainableMock(settingsRow);
      const updateQuery = createChainableMock(null, {
        message: 'Token update failed',
        code: 'PGRST000',
      });
      const { service } = createService([upsertQuery, updateQuery]);

      await expect(service.regenerateICalToken(USER_ID)).rejects.toMatchObject({
        code: 'UPDATE_FAILED',
        message: 'Token update failed',
      });
    });
  });
});
