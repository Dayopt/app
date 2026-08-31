import { describe, expect, it } from 'vitest';

import { toCalendarSettings } from './useCalendarSettings';

describe('toCalendarSettings', () => {
  it('user_settings query responseからCalendar設定を抽出する', () => {
    expect(
      toCalendarSettings({
        timezone: 'Asia/Tokyo',
        timeFormat: '24h',
        weekStartsOn: 1,
        showWeekends: false,
        showWeekNumbers: false,
        defaultDuration: 60,
        defaultView: '3day',
        hourHeightDensity: 'compact',
        theme: 'system',
        personalization: {
          dismissedTrialEndedDialog: false,
          paymentErrorDialogLastShownAt: null,
        },
        preferredLocale: 'ja',
      }),
    ).toEqual({
      defaultView: '3day',
      showWeekends: false,
      hourHeightDensity: 'compact',
    });
  });

  it('row未作成時はCalendar defaultを返す', () => {
    expect(toCalendarSettings(null)).toEqual({
      defaultView: 'week',
      showWeekends: true,
      hourHeightDensity: 'default',
    });
  });
});
