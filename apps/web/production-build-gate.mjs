export const REQUIRED_WEB_OPERATIONAL_BUILD_ENV = [
  'GITHUB_TOKEN',
  'GITHUB_CONTACT_REPO',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

/** Fail a Vercel Production build before rate limiting can become pass-through. */
export function assertWebOperationalProductionBuildEnv(env) {
  if (env.VERCEL_ENV !== 'production') return false;

  const missingNames = REQUIRED_WEB_OPERATIONAL_BUILD_ENV.filter(
    (name) => typeof env[name] !== 'string' || env[name].trim() === '',
  );
  if (missingNames.length > 0) {
    throw new Error(`Web production build requires: ${missingNames.join(', ')}`);
  }

  const githubContactRepo = env.GITHUB_CONTACT_REPO.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(githubContactRepo)) {
    throw new Error('Web production build requires a valid GITHUB_CONTACT_REPO');
  }
  if (githubContactRepo.toLowerCase() === 'dayopt/dayopt') {
    throw new Error('Web production build refuses the public Dayopt/dayopt contact repository');
  }

  try {
    const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== 'https:' || !redisUrl.hostname) throw new Error();
  } catch {
    throw new Error('Web production build requires a valid UPSTASH_REDIS_REST_URL');
  }

  return true;
}
