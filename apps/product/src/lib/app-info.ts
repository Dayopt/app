import { dayoptBrand } from '@dayopt/config';

export const APP_NAME = dayoptBrand.name;
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown';
export const APP_RELEASES_URL = 'https://github.com/Dayopt/dayopt/releases';
