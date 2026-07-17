export const REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV = [
  'GITHUB_TOKEN',
  'GITHUB_CONTACT_REPO',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

/** Prevent a Production deploy with pass-through rate limits or public contact PII storage. */
export function assertProductOperationalProductionBuildEnv(env) {
  if (env.VERCEL_ENV !== 'production') return false;

  const missingNames = REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.filter(
    (name) => typeof env[name] !== 'string' || env[name].trim() === '',
  );
  if (missingNames.length > 0) {
    throw new Error(`Product production build requires: ${missingNames.join(', ')}`);
  }

  const githubContactRepo = env.GITHUB_CONTACT_REPO.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(githubContactRepo)) {
    throw new Error('Product production build requires a valid GITHUB_CONTACT_REPO');
  }
  if (githubContactRepo.toLowerCase() === 'dayopt/dayopt') {
    throw new Error('Product production build refuses the public Dayopt/dayopt contact repository');
  }

  try {
    const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== 'https:' || !redisUrl.hostname) throw new Error();
  } catch {
    throw new Error('Product production build requires a valid UPSTASH_REDIS_REST_URL');
  }

  return true;
}
