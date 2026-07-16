export const REQUIRED_SENTRY_BUILD_ENV = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'VERCEL_GIT_COMMIT_SHA',
];

/**
 * Validate release/source-map credentials only for a Vercel Production build.
 * Preview, Development, and generic CI builds must not need Sentry credentials.
 */
export function assertProductionSentryBuildEnv(env, applicationName) {
  if (env.VERCEL_ENV !== 'production') return false;

  const missingNames = REQUIRED_SENTRY_BUILD_ENV.filter(
    (name) => typeof env[name] !== 'string' || env[name].trim() === '',
  );
  if (missingNames.length > 0) {
    throw new Error(
      `${applicationName} Sentry production build requires: ${missingNames.join(', ')}`,
    );
  }

  for (const name of ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN']) {
    try {
      const dsn = new URL(env[name]);
      if (dsn.protocol !== 'https:' || !dsn.username || dsn.pathname === '/') throw new Error();
    } catch {
      throw new Error(`${applicationName} Sentry production build requires a valid ${name}`);
    }
  }

  return true;
}

/** Explicit Sentry build-plugin failure policy: release/upload failures stop deployment. */
export function failSentryBuild(error) {
  throw error;
}
