'use client';

import { Turnstile as TurnstileWidget, type TurnstileInstance } from '@marsidev/react-turnstile';
import { forwardRef } from 'react';

import { TURNSTILE_CONFIG, isTurnstileEnabled } from './config';

type Locale = 'ja' | 'en' | 'auto';

interface TurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  locale?: Locale;
  theme?: 'light' | 'dark' | 'auto';
}

export const Turnstile = forwardRef<TurnstileInstance, TurnstileProps>(function Turnstile(
  { onSuccess, onError, onExpire, locale = 'auto', theme = 'auto' },
  ref,
) {
  if (!isTurnstileEnabled()) {
    return null;
  }

  return (
    <TurnstileWidget
      ref={ref}
      siteKey={TURNSTILE_CONFIG.SITE_KEY}
      onSuccess={onSuccess}
      onError={onError}
      onExpire={onExpire}
      options={{ language: locale, theme }}
    />
  );
});
