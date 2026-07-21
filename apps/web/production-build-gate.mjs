export const REQUIRED_WEB_OPERATIONAL_BUILD_ENV = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

function isVerifiedDayoptSender(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'onboarding@resend.dev' || !normalized.endsWith('@dayopt.app')) return false;
  return /^[^\s@]+@[^\s@]+$/u.test(normalized);
}

/** Fail a Vercel Production build before contact delivery can become partial. */
export function assertWebOperationalProductionBuildEnv(env) {
  if (env.VERCEL_ENV !== 'production') return false;

  const missingNames = REQUIRED_WEB_OPERATIONAL_BUILD_ENV.filter(
    (name) => typeof env[name] !== 'string' || env[name].trim() === '',
  );
  if (missingNames.length > 0) {
    throw new Error(`Web production build requires: ${missingNames.join(', ')}`);
  }

  if (!isVerifiedDayoptSender(env.RESEND_FROM_EMAIL)) {
    throw new Error('Web production build requires a verified Dayopt RESEND_FROM_EMAIL');
  }

  try {
    const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== 'https:' || !redisUrl.hostname) throw new Error();
  } catch {
    throw new Error('Web production build requires a valid UPSTASH_REDIS_REST_URL');
  }

  return true;
}
