import { dayoptBrand, SUPPORTED_LOCALES } from '@dayopt/config';
import { getSiteUrl } from '@web/platform/config/env';

export interface SiteConfig {
  name: string;
  title: string;
  description: string;
  url: string;
  ogImage: string;
  creator: string;
  twitterHandle: string;
  keywords: string[];
  locale: string;
  alternateLocales: string[];
}

export const siteConfig: SiteConfig = {
  name: dayoptBrand.name,
  title: '守れる計画を、立てられるように。 | Dayopt',
  description:
    '計画と実績を、ひとつのタイムラインに。ズレが見えるから、明日の計画がうまくなる。知的労働者のための、いちばん軽いタイムボクシングツール。',
  url: getSiteUrl(),
  ogImage: '/og-image.png',
  creator: dayoptBrand.teamName,
  twitterHandle: dayoptBrand.twitterHandle,
  keywords: ['タイムボクシング', '時間管理', '計画', '実績', '振り返り', 'カレンダー'],
  locale: 'ja',
  alternateLocales: [...SUPPORTED_LOCALES],
};
