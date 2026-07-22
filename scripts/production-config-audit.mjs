import { REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV } from '../apps/product/production-build-gate.mjs';
import { REQUIRED_WEB_OPERATIONAL_BUILD_ENV } from '../apps/web/production-build-gate.mjs';

const PROJECT_CONTRACTS = {
  product: {
    requiredProduction: REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV,
    requiredSensitive: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'UPSTASH_REDIS_REST_TOKEN'],
    forbiddenNonProduction: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'],
  },
  web: {
    requiredProduction: REQUIRED_WEB_OPERATIONAL_BUILD_ENV,
    requiredSensitive: [
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'TURNSTILE_SECRET_KEY',
      'UPSTASH_REDIS_REST_TOKEN',
    ],
    forbiddenNonProduction: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'],
  },
};

const LEGACY_CONTACT_ENV = ['GITHUB_TOKEN', 'GITHUB_CONTACT_REPO'];
const NON_PRODUCTION_TARGETS = new Set(['preview', 'development']);

function targetsOf(entry) {
  return Array.isArray(entry.target)
    ? entry.target.filter((target) => typeof target === 'string')
    : [];
}

function metadataOnlyEntries(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.envs)) {
    throw new Error('Vercel environment metadata response is invalid');
  }

  return response.envs.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    if (typeof entry.key !== 'string' || typeof entry.type !== 'string') return [];
    return [{ key: entry.key, target: targetsOf(entry), type: entry.type }];
  });
}

export function auditProjectMetadata(projectName, response) {
  const contract = PROJECT_CONTRACTS[projectName];
  if (!contract) throw new Error(`Unknown Vercel project contract: ${projectName}`);

  const entries = metadataOnlyEntries(response);
  const errors = [];

  for (const key of contract.requiredProduction) {
    if (!entries.some((entry) => entry.key === key && entry.target.includes('production'))) {
      errors.push(`${projectName}: ${key} is missing from Production`);
    }
  }

  for (const key of contract.requiredSensitive) {
    const productionEntries = entries.filter(
      (entry) => entry.key === key && entry.target.includes('production'),
    );
    if (productionEntries.some((entry) => entry.type !== 'sensitive')) {
      errors.push(`${projectName}: ${key} must use Vercel sensitive type in Production`);
    }
  }

  for (const key of contract.forbiddenNonProduction) {
    const forbiddenTargets = new Set(
      entries
        .filter((entry) => entry.key === key)
        .flatMap((entry) => entry.target)
        .filter((target) => NON_PRODUCTION_TARGETS.has(target)),
    );
    if (forbiddenTargets.size > 0) {
      errors.push(
        `${projectName}: ${key} must not target ${Array.from(forbiddenTargets).sort().join('/')}`,
      );
    }
  }

  for (const key of LEGACY_CONTACT_ENV) {
    if (entries.some((entry) => entry.key === key)) {
      errors.push(`${projectName}: legacy ${key} must not be configured`);
    }
  }

  return errors;
}

async function fetchProjectMetadata(projectName, token, teamId, fetchImpl) {
  const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env`);
  url.searchParams.set('teamId', teamId);

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Vercel environment metadata request failed for project: ${projectName}`);
  }
  return response.json();
}

export async function runProductionConfigAudit({ token, teamId, fetchImpl = fetch }) {
  if (!token) throw new Error('VERCEL_TOKEN is required for Production Config Audit');
  if (!teamId) throw new Error('VERCEL_TEAM_ID is required for Production Config Audit');

  const allErrors = [];
  for (const projectName of Object.keys(PROJECT_CONTRACTS)) {
    const response = await fetchProjectMetadata(projectName, token, teamId, fetchImpl);
    allErrors.push(...auditProjectMetadata(projectName, response));
  }

  if (allErrors.length > 0) {
    throw new Error(
      `Production Config Audit failed:\n${allErrors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProductionConfigAudit({
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
  })
    .then(() => {
      console.log('Production Config Audit passed for product and web (metadata only).');
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Production Config Audit failed');
      process.exitCode = 1;
    });
}
