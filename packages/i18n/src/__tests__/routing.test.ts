import { DEFAULT_LOCALE, LOCALE_PREFIX, SUPPORTED_LOCALES } from '@dayopt/config';
import { describe, expect, it } from 'vitest';

import { routing } from '../routing';

describe('routing', () => {
  it('config の locale 定義と URL 戦略をそのまま公開する', () => {
    expect(routing.locales).toEqual(SUPPORTED_LOCALES);
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
    expect(routing.localePrefix).toBe(LOCALE_PREFIX);
  });
});
