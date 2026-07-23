import { appendFileSync } from 'node:fs';

import { runProductionConfigAudit } from './production-config-audit.mjs';

const API_ORIGIN = 'https://api.vercel.com';

/**
 * promote 順序 = 配列順。web を先に promote するため、2 つ目(product)が失敗した時に
 * rollback 対象になるのは web 側だけになる。
 */
export const RELEASE_PROJECTS = [
  {
    name: 'web',
    bypassEnv: 'VERCEL_BYPASS_WEB',
    productionOrigin: 'https://dayopt.app',
    smokePaths: ['/', '/ja'],
  },
  {
    name: 'product',
    bypassEnv: 'VERCEL_BYPASS_PRODUCT',
    productionOrigin: 'https://app.dayopt.app',
    smokePaths: ['/api/health', '/login'],
  },
];

const READY_TIMEOUT_MS = 25 * 60 * 1000;
const READY_POLL_MS = 15 * 1000;
const ASSIGN_TIMEOUT_MS = 5 * 60 * 1000;
const ASSIGN_POLL_MS = 5 * 1000;
const SMOKE_ATTEMPTS = 3;
const SMOKE_TIMEOUT_MS = 15 * 1000;
const TERMINAL_FAILURE_STATES = new Set(['ERROR', 'CANCELED', 'DELETED']);

export class ReleaseError extends Error {
  constructor(message, { manualRollback } = {}) {
    super(message);
    this.name = 'ReleaseError';
    this.manualRollback = manualRollback ?? null;
  }
}

function apiUrl(path, teamId, params = {}) {
  const url = new URL(`${API_ORIGIN}${path}`);
  url.searchParams.set('teamId', teamId);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function callVercel(url, { token, fetchImpl, method = 'GET', label }) {
  const response = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    // Response body may echo request context; report the status only.
    throw new ReleaseError(`Vercel API ${label} failed with status ${response.status}`);
  }
  return response.json();
}

function normalizeDeployment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.uid ?? raw.id;
  if (typeof id !== 'string') return null;
  return {
    id,
    url: typeof raw.url === 'string' ? raw.url : null,
    state: raw.readyState ?? raw.state ?? null,
    createdAt: raw.createdAt ?? raw.created ?? null,
    sha: raw.meta?.githubCommitSha ?? null,
  };
}

/** target SHA の production deployment を 1 件返す。無ければ null。 */
export async function findDeploymentForSha({ projectName, sha, token, teamId, fetchImpl }) {
  const url = apiUrl('/v6/deployments', teamId, {
    projectId: projectName,
    target: 'production',
    limit: '20',
  });
  const body = await callVercel(url, {
    token,
    fetchImpl,
    label: `deployments(${projectName})`,
  });

  const deployments = Array.isArray(body?.deployments) ? body.deployments : [];
  const matches = deployments
    .map(normalizeDeployment)
    .filter((deployment) => deployment !== null && deployment.sha === sha)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return matches[0] ?? null;
}

/** 現在 production domain に割り当てられている deployment。未割当なら null。 */
export async function getCurrentProduction({ projectName, token, teamId, fetchImpl }) {
  const url = apiUrl(`/v9/projects/${encodeURIComponent(projectName)}`, teamId);
  const body = await callVercel(url, {
    token,
    fetchImpl,
    label: `project(${projectName})`,
  });
  return normalizeDeployment(body?.targets?.production);
}

/**
 * 全 project の candidate が READY になるまで待つ。
 * ERROR / CANCELED は復帰しないので即座に失敗させる。
 */
export async function waitForReadyCandidates({
  projects,
  sha,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
  logger,
  timeoutMs = READY_TIMEOUT_MS,
  pollMs = READY_POLL_MS,
}) {
  const deadline = nowImpl() + timeoutMs;
  const ready = new Map();

  for (;;) {
    for (const project of projects) {
      if (ready.has(project.name)) continue;

      const deployment = await findDeploymentForSha({
        projectName: project.name,
        sha,
        token,
        teamId,
        fetchImpl,
      });
      if (!deployment) continue;

      if (TERMINAL_FAILURE_STATES.has(deployment.state)) {
        throw new ReleaseError(
          `${project.name}: production build for ${sha} ended in ${deployment.state}`,
        );
      }
      if (deployment.state === 'READY') {
        logger.log(`${project.name}: candidate ${deployment.id} is READY`);
        ready.set(project.name, deployment);
      }
    }

    if (ready.size === projects.length) {
      return projects.map((project) => ({ project, deployment: ready.get(project.name) }));
    }

    if (nowImpl() >= deadline) {
      const pending = projects
        .filter((project) => !ready.has(project.name))
        .map((project) => project.name)
        .join(', ');
      throw new ReleaseError(
        `Timed out waiting for READY production builds of ${sha} (pending: ${pending})`,
      );
    }

    await sleepImpl(pollMs);
  }
}

function isProtectionRedirect(response) {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers?.get?.('location') ?? '';
  return location.includes('vercel.com/sso-api');
}

/**
 * candidate deployment の unique URL を read-only で検証する。
 * Deployment Protection が有効なため bypass secret が必須。
 */
export async function smokeDeployment({
  projectName,
  deploymentUrl,
  paths,
  bypassSecret,
  fetchImpl,
  sleepImpl,
  logger,
  attempts = SMOKE_ATTEMPTS,
  timeoutMs = SMOKE_TIMEOUT_MS,
}) {
  const headers = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};

  for (const path of paths) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(`https://${deploymentUrl}${path}`, {
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (isProtectionRedirect(response)) {
          // Retrying cannot fix a missing bypass secret.
          throw new ReleaseError(
            `${projectName}: Deployment Protection blocked ${path}. ` +
              `Enable Protection Bypass for Automation and set the matching repository secret.`,
          );
        }
        if (response.status === 200) {
          lastError = null;
          break;
        }
        lastError = new ReleaseError(
          `${projectName}: smoke ${path} returned ${response.status} (expected 200)`,
        );
      } catch (error) {
        if (error instanceof ReleaseError) throw error;
        // Network/timeout failures carry no response body; keep only the reason name.
        lastError = new ReleaseError(
          `${projectName}: smoke ${path} failed (${error?.name ?? 'RequestFailed'})`,
        );
      }

      if (attempt < attempts) await sleepImpl(2000);
    }

    if (lastError) throw lastError;
    logger.log(`${projectName}: smoke ${path} ok`);
  }
}

async function waitForProductionAssignment({
  projectName,
  deploymentId,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
  action,
  timeoutMs = ASSIGN_TIMEOUT_MS,
  pollMs = ASSIGN_POLL_MS,
}) {
  const deadline = nowImpl() + timeoutMs;

  for (;;) {
    const current = await getCurrentProduction({ projectName, token, teamId, fetchImpl });
    if (current?.id === deploymentId) return current;

    if (nowImpl() >= deadline) {
      throw new ReleaseError(
        `${projectName}: ${action} did not take effect for deployment ${deploymentId}`,
      );
    }
    await sleepImpl(pollMs);
  }
}

/** deployment を production domain へ昇格し、反映を確認する。 */
export async function promoteDeployment({
  projectName,
  deploymentId,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
}) {
  const url = apiUrl(
    `/v10/projects/${encodeURIComponent(projectName)}/promote/${encodeURIComponent(deploymentId)}`,
    teamId,
  );
  await callVercel(url, {
    token,
    fetchImpl,
    method: 'POST',
    label: `promote(${projectName})`,
  });
  return waitForProductionAssignment({
    projectName,
    deploymentId,
    token,
    teamId,
    fetchImpl,
    sleepImpl,
    nowImpl,
    action: 'promote',
  });
}

/** production domain を既知の正常 deployment へ戻し、反映を確認する。 */
export async function rollbackDeployment({
  projectName,
  deploymentId,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
}) {
  const url = apiUrl(
    `/v1/projects/${encodeURIComponent(projectName)}/rollback/${encodeURIComponent(deploymentId)}`,
    teamId,
  );
  await callVercel(url, {
    token,
    fetchImpl,
    method: 'POST',
    label: `rollback(${projectName})`,
  });
  return waitForProductionAssignment({
    projectName,
    deploymentId,
    token,
    teamId,
    fetchImpl,
    sleepImpl,
    nowImpl,
    action: 'rollback',
  });
}

function assertSimulationPoint(simulateFailure, point) {
  if (simulateFailure === point) {
    throw new ReleaseError(`Simulated failure at ${point} (release drill)`);
  }
}

/**
 * merge 済み SHA を両 project の production domain へ公開する。
 * 片方だけ promote された状態は残さない。
 */
export async function runProductionRelease({
  sha,
  token,
  teamId,
  force = false,
  bypassSecrets = {},
  projects = RELEASE_PROJECTS,
  simulateFailure = '',
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowImpl = () => Date.now(),
  logger = console,
}) {
  if (!token) throw new ReleaseError('VERCEL_TOKEN is required for Production Release');
  if (!teamId) throw new ReleaseError('VERCEL_TEAM_ID is required for Production Release');
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new ReleaseError('RELEASE_SHA must be a 40 character commit SHA');
  }

  const before = new Map();
  for (const project of projects) {
    before.set(
      project.name,
      await getCurrentProduction({ projectName: project.name, token, teamId, fetchImpl }),
    );
  }

  if (projects.every((project) => before.get(project.name)?.sha === sha)) {
    logger.log(`All projects already serve ${sha}; nothing to promote.`);
    return { status: 'already-released', sha, promoted: [], rolledBack: [] };
  }

  const candidates = await waitForReadyCandidates({
    projects,
    sha,
    token,
    teamId,
    fetchImpl,
    sleepImpl,
    nowImpl,
    logger,
  });

  const superseded = candidates.filter(({ project, deployment }) => {
    const current = before.get(project.name);
    return (
      current !== null &&
      current.createdAt !== null &&
      deployment.createdAt !== null &&
      current.createdAt > deployment.createdAt
    );
  });
  if (superseded.length > 0) {
    const names = superseded.map(({ project }) => project.name).join(', ');
    logger.log(`Skipping promote: a newer production deployment already serves ${names}.`);
    return { status: 'superseded', sha, promoted: [], rolledBack: [] };
  }

  // 既に production へ出ている build は公開済みなので、gate の対象から外す。
  const pending = candidates.filter(
    ({ project, deployment }) => before.get(project.name)?.id !== deployment.id,
  );

  if (force) {
    logger.log('Force Promote: skipping smoke and Production Config Audit.');
  } else {
    for (const { project, deployment } of pending) {
      assertSimulationPoint(simulateFailure, `smoke:${project.name}`);
      await smokeDeployment({
        projectName: project.name,
        deploymentUrl: deployment.url,
        paths: project.smokePaths,
        bypassSecret: bypassSecrets[project.name],
        fetchImpl,
        sleepImpl,
        logger,
      });
    }

    await runProductionConfigAudit({ token, teamId, fetchImpl });
    logger.log('Production Config Audit passed against live Vercel metadata.');
  }

  const promoted = [];
  try {
    for (const { project, deployment } of pending) {
      assertSimulationPoint(simulateFailure, `promote:${project.name}`);
      await promoteDeployment({
        projectName: project.name,
        deploymentId: deployment.id,
        token,
        teamId,
        fetchImpl,
        sleepImpl,
        nowImpl,
      });
      logger.log(`${project.name}: promoted ${deployment.id}`);
      promoted.push({ project, deployment, previous: before.get(project.name) });
    }
  } catch (error) {
    const rolledBack = await rollbackPromoted({
      promoted,
      token,
      teamId,
      fetchImpl,
      sleepImpl,
      nowImpl,
      logger,
      cause: error,
    });
    throw Object.assign(error, { rolledBack });
  }

  return { status: 'promoted', sha, promoted, rolledBack: [] };
}

async function rollbackPromoted({
  promoted,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
  logger,
  cause,
}) {
  const rolledBack = [];
  const stranded = [];

  for (const entry of [...promoted].reverse()) {
    if (!entry.previous?.id) {
      stranded.push(`${entry.project.name} (no previous production deployment recorded)`);
      continue;
    }
    try {
      await rollbackDeployment({
        projectName: entry.project.name,
        deploymentId: entry.previous.id,
        token,
        teamId,
        fetchImpl,
        sleepImpl,
        nowImpl,
      });
      logger.log(`${entry.project.name}: rolled back to ${entry.previous.id}`);
      rolledBack.push(entry);
    } catch {
      stranded.push(`${entry.project.name} -> ${entry.previous.id}`);
    }
  }

  if (stranded.length > 0) {
    throw new ReleaseError(
      `MANUAL ROLLBACK REQUIRED after "${cause.message}". ` +
        `Point production back to: ${stranded.join('; ')}`,
      { manualRollback: stranded },
    );
  }

  return rolledBack;
}

function writeStepSummary(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${lines.join('\n')}\n`);
}

function summarize(result) {
  const lines = [
    '## Production Release',
    '',
    `- Commit: \`${result.sha}\``,
    `- Status: ${result.status}`,
  ];
  for (const entry of result.promoted) {
    lines.push(
      `- ${entry.project.name}: promoted \`${entry.deployment.id}\`` +
        ` (previous \`${entry.previous?.id ?? 'none'}\`)`,
    );
  }
  if (result.promoted.length > 0) {
    lines.push('', 'Manual rollback targets are the `previous` deployment ids above.');
  }
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bypassSecrets = Object.fromEntries(
    RELEASE_PROJECTS.map((project) => [project.name, process.env[project.bypassEnv]]),
  );

  runProductionRelease({
    sha: process.env.RELEASE_SHA,
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    force: process.env.RELEASE_FORCE === 'true',
    simulateFailure: process.env.RELEASE_SIMULATE_FAILURE ?? '',
    bypassSecrets,
  })
    .then((result) => {
      writeStepSummary(summarize(result));
      console.log(`Production Release finished: ${result.status}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Production Release failed';
      writeStepSummary(['## Production Release', '', `- Failed: ${message}`]);
      console.error(message);
      process.exitCode = 1;
    });
}
