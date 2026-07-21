import { dayoptUrls } from '@dayopt/config';

import { loadEnv } from './load-env';

export const env = loadEnv();

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isCI = env.CI === true;

export function getAppUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL;
  }

  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }

  if (isDevelopment) {
    return 'http://localhost:3000';
  }

  return dayoptUrls.marketing;
}

export function getSiteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL || getAppUrl();
}
