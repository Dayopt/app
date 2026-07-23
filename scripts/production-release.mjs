import { appendFileSync } from 'node:fs';

import { runProductionConfigAudit } from './production-config-audit.mjs';

const API_ORIGIN = 'https://api.vercel.com';

/**
 * promote 順序 = 配列順。web を先に promote するため、2 つ目(product)が失敗した時に
 * rollback 対象になるのは web 側だけになる。
 *
 * smoke は status だけでは足りない。product は未知 path でも 200 を返し
 * （`/[locale]/[nday]` が任意の 1 segment に一致する）、Next.js は streaming 中の
 * 失敗も 200 のまま返す。そこで Next.js が返す `x-matched-path` で
 * 「どの route が応答したか」を確定させ、内容が意味を持つ endpoint だけ本文も見る。
 */
export const RELEASE_PROJECTS = [
  {
    name: 'web',
    bypassEnv: 'VERCEL_BYPASS_WEB',
    smokeChecks: [
      { path: '/', matchedPath: '/en' },
      { path: '/ja', matchedPath: '/ja' },
    ],
  },
  {
    name: 'product',
    bypassEnv: 'VERCEL_BYPASS_PRODUCT',
    smokeChecks: [
      // health は degraded でも 200 を返すので、本文で healthy を確認する。
      { path: '/api/health', matchedPath: '/api/health', contains: '"status":"healthy"' },
      { path: '/auth/login', matchedPath: '/[locale]/auth/login' },
      // ja message bundle のロードまで通す。namespace 欠落は既知の事故モード。
      { path: '/ja/auth/login', matchedPath: '/[locale]/auth/login' },
    ],
  },
];

/** 200 のまま streaming 中に失敗した Next.js response の目印。 */
const STREAMED_FAILURE_MARKERS = ['NEXT_HTTP_ERROR_FALLBACK', 'NEXT_REDIRECT'];

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

async function callVercel(url, { token, fetchImpl, method = 'GET', label, parseJson = true }) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (method === 'POST') {
    // 公式 client は promote / rollback に空の JSON body を送る。
    headers['Content-Type'] = 'application/json';
    init.body = '{}';
  }

  const response = await fetchImpl(url, init);
  if (!response.ok) {
    // Response body may echo request context; report the status only.
    throw new ReleaseError(`Vercel API ${label} failed with status ${response.status}`);
  }
  // promote / rollback answer 201 / 202 and may carry an empty body.
  return parseJson ? response.json() : null;
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
    target: raw.target ?? null,
    // GitHub 連携以外（CLI / API）の deployment はこの値を持たない。
    // 正規経路の build だけを release 対象にするため、これを必須にする。
    sha: raw.meta?.githubCommitSha ?? null,
  };
}

/** target SHA の production deployment を 1 件返す。無ければ null。 */
export async function findDeploymentForSha({ projectName, sha, token, teamId, fetchImpl }) {
  const url = apiUrl('/v7/deployments', teamId, {
    projectId: projectName,
    target: 'production',
    sha,
    limit: '20',
  });
  const body = await callVercel(url, {
    token,
    fetchImpl,
    label: `deployments(${projectName})`,
  });

  const deployments = Array.isArray(body?.deployments) ? body.deployments : [];
  // server 側の filter を信用しきらず、SHA と target を手元で再確認する。
  const matches = deployments
    .map(normalizeDeployment)
    .filter(
      (deployment) =>
        deployment !== null && deployment.sha === sha && deployment.target === 'production',
    )
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return matches[0] ?? null;
}

/**
 * project の現在状態を 1 回の呼び出しで取る。
 *
 * `/v9/projects/{idOrName}` は名前で引けるが、promote / rollback の path は
 * `prj_` ID を要求する。ここで得た ID を以降の書き込みに使い、名前解決の
 * 曖昧さを release 経路から外す。
 */
export async function getProjectState({ projectName, token, teamId, fetchImpl }) {
  const url = apiUrl(`/v9/projects/${encodeURIComponent(projectName)}`, teamId);
  const body = await callVercel(url, {
    token,
    fetchImpl,
    label: `project(${projectName})`,
  });
  if (typeof body?.id !== 'string') {
    throw new ReleaseError(`${projectName}: could not resolve the Vercel project id`);
  }
  return {
    projectId: body.id,
    production: normalizeDeployment(body?.targets?.production),
  };
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
  const location = response.headers?.get?.('location');
  if (!location) return false;
  try {
    const url = new URL(location);
    return url.host === 'vercel.com' && url.pathname === '/sso-api';
  } catch {
    return false;
  }
}

/**
 * candidate deployment の unique URL を read-only で検証する。
 * Deployment Protection が有効なため bypass secret が必須。
 */
export async function smokeDeployment({
  projectName,
  deploymentUrl,
  checks,
  bypassSecret,
  fetchImpl,
  sleepImpl,
  logger,
  attempts = SMOKE_ATTEMPTS,
  timeoutMs = SMOKE_TIMEOUT_MS,
}) {
  const headers = {
    // 明示しないと locale 検出でトップページが別 locale へ redirect されうる。
    'accept-language': 'en',
    ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
  };

  for (const { path, matchedPath, contains } of checks) {
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
          // 以下の不一致は routing / render の問題なので retry しても変わらない。
          const matched = response.headers?.get?.('x-matched-path');
          if (matchedPath && matched !== matchedPath) {
            throw new ReleaseError(
              `${projectName}: smoke ${path} was served by ${matched ?? 'an unknown route'} ` +
                `(expected ${matchedPath})`,
            );
          }

          const body = await response.text();
          const streamedFailure = STREAMED_FAILURE_MARKERS.find((marker) => body.includes(marker));
          if (streamedFailure) {
            throw new ReleaseError(
              `${projectName}: smoke ${path} returned 200 but streamed ${streamedFailure}`,
            );
          }
          if (contains && !body.includes(contains)) {
            throw new ReleaseError(
              `${projectName}: smoke ${path} returned 200 without the expected content`,
            );
          }

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
    const { production } = await getProjectState({ projectName, token, teamId, fetchImpl });
    if (production?.id === deploymentId) return production;

    if (nowImpl() >= deadline) {
      throw new ReleaseError(
        `${projectName}: ${action} did not take effect for deployment ${deploymentId}`,
      );
    }
    await sleepImpl(pollMs);
  }
}

/**
 * production domain を指定 deployment へ向けるよう要求する。反映確認はしない。
 *
 * promote と rollback で同じ endpoint を使う。REST API には rollback 専用の
 * `/v1/projects/{id}/rollback/{deploymentId}` もあるが、対象が
 * `isRollbackCandidate` に限られる。promote は「任意の deployment へ production
 * traffic を向ける」ことが明記されており、復旧経路では同じ run の中で先に
 * 成功実績を作る呼び出しを再利用する方が失敗確率が低い。
 *
 * 要求と確認を分けているのは、POST が受理された時点で production が動きうるため。
 * 呼び出し側は確認を待つ前に rollback 対象として記録する。
 */
async function requestProductionPointer({
  projectName,
  projectId,
  deploymentId,
  token,
  teamId,
  fetchImpl,
  action,
}) {
  const url = apiUrl(
    `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`,
    teamId,
  );
  await callVercel(url, {
    token,
    fetchImpl,
    method: 'POST',
    label: `${action}(${projectName})`,
    parseJson: false,
  });
}

/** production domain を既知の正常 deployment へ戻し、反映まで確認する。 */
async function rollbackDeployment({
  projectName,
  projectId,
  deploymentId,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
}) {
  await requestProductionPointer({
    projectName,
    projectId,
    deploymentId,
    token,
    teamId,
    fetchImpl,
    action: 'rollback',
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

  const projectIds = new Map();
  const before = new Map();
  for (const project of projects) {
    const state = await getProjectState({ projectName: project.name, token, teamId, fetchImpl });
    projectIds.set(project.name, state.projectId);
    before.set(project.name, state.production);
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
        checks: project.smokeChecks,
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
      await requestProductionPointer({
        projectName: project.name,
        projectId: projectIds.get(project.name),
        deploymentId: deployment.id,
        token,
        teamId,
        fetchImpl,
        action: 'promote',
      });

      // POST が受理された時点で production は動きうる。反映確認が timeout しても
      // rollback 対象から漏らさないよう、確認を待つ前に記録する。
      promoted.push({
        project,
        projectId: projectIds.get(project.name),
        deployment,
        previous: before.get(project.name),
      });

      await waitForProductionAssignment({
        projectName: project.name,
        deploymentId: deployment.id,
        token,
        teamId,
        fetchImpl,
        sleepImpl,
        nowImpl,
        action: 'promote',
      });
      logger.log(`${project.name}: promoted ${deployment.id}`);
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
        projectId: entry.projectId,
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

/** workflow が status publish と run の合否を別々に決められるようにする。 */
export const RELEASE_STATUSES = new Set(['already-released', 'promoted', 'superseded', 'failed']);

export function writeReleaseStatus(status, { env = process.env } = {}) {
  const path = env.GITHUB_OUTPUT;
  // 固定集合以外は書かない。任意文字列を GITHUB_OUTPUT へ流さない。
  if (!path || !RELEASE_STATUSES.has(status)) return;
  appendFileSync(path, `release_status=${status}\n`);
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
  if (result.status === 'superseded') {
    lines.push(
      '',
      'A newer Production deployment already serves Production. Nothing was promoted,',
      'and this commit is **not** live. Do not tag it.',
    );
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
      writeReleaseStatus(result.status);
      console.log(`Production Release finished: ${result.status}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Production Release failed';
      writeStepSummary(['## Production Release', '', `- Failed: ${message}`]);
      writeReleaseStatus('failed');
      console.error(message);
      process.exitCode = 1;
    });
}
