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
    productionDomain: 'dayopt.app',
    smokeChecks: [
      { path: '/', matchedPath: '/en' },
      { path: '/ja', matchedPath: '/ja' },
    ],
  },
  {
    name: 'product',
    bypassEnv: 'VERCEL_BYPASS_PRODUCT',
    productionDomain: 'app.dayopt.app',
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
const SMOKE_RETRY_DELAY_MS = 2 * 1000;
const TERMINAL_FAILURE_STATES = new Set(['ERROR', 'CANCELED', 'DELETED']);

/**
 * この script が費やしうる最悪時間。workflow の `timeout-minutes` がこれを
 * 下回ると、rollback の途中で job が kill され、片方だけ promote された
 * production が手動 rollback の手掛かりごと失われる。
 * 内訳: candidate 待機 + 全 smoke の retry + promote 反映待ち + rollback 反映待ち。
 */
export const WORST_CASE_RELEASE_MS =
  READY_TIMEOUT_MS +
  RELEASE_PROJECTS.reduce((total, project) => total + project.smokeChecks.length, 0) *
    (SMOKE_ATTEMPTS * SMOKE_TIMEOUT_MS + (SMOKE_ATTEMPTS - 1) * SMOKE_RETRY_DELAY_MS) +
  RELEASE_PROJECTS.length * ASSIGN_TIMEOUT_MS * 2;

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

async function callVercel(
  url,
  { token, fetchImpl, method = 'GET', label, body, parseJson = true },
) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (method !== 'GET') {
    // 公式 client は promote / rollback に空の JSON body を送る。
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
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
export async function getProjectMeta({ projectName, token, teamId, fetchImpl }) {
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
    // promote endpoint がこの設定を書き換えるため、事前値を控えて後で戻す。
    autoAssignCustomDomains: body.autoAssignCustomDomains ?? null,
  };
}

/**
 * production domain を「今」配信している deployment を返す。未割当なら null。
 *
 * `/v9/projects/{id}` の `targets.production` は使えない。あれは production target の
 * **最新** deployment を指し、まだ build 中でもその値になる。実際に merge 直後
 * 8 秒（build 完了の 60 秒前）で新 deployment を指すことを実測した。alias が唯一
 * 「今どれが配信しているか」を表す。
 */
export async function getLiveProduction({
  projectName,
  productionDomain,
  projectId,
  token,
  teamId,
  fetchImpl,
}) {
  const aliasUrl = apiUrl(`/v4/aliases/${encodeURIComponent(productionDomain)}`, teamId, {
    projectId,
  });
  const alias = await callVercel(aliasUrl, {
    token,
    fetchImpl,
    label: `alias(${projectName})`,
  });

  const deploymentId = alias?.deploymentId ?? alias?.deployment?.id;
  if (typeof deploymentId !== 'string') return null;

  const deployment = await callVercel(
    apiUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`, teamId),
    { token, fetchImpl, label: `deployment(${projectName})` },
  );
  return normalizeDeployment(deployment);
}

export async function getProjectState({ projectName, productionDomain, token, teamId, fetchImpl }) {
  const meta = await getProjectMeta({ projectName, token, teamId, fetchImpl });
  const production = await getLiveProduction({
    projectName,
    productionDomain,
    projectId: meta.projectId,
    token,
    teamId,
    fetchImpl,
  });
  return { ...meta, production };
}

/**
 * promote / rollback の副作用で書き換わった Auto-assign Custom Domains を戻す。
 *
 * `POST /v10/projects/{id}/promote/{deploymentId}` は project 設定の
 * `autoAssignCustomDomains` を `true` に戻す（vercel/vercel#15095、未修正）。
 * 放置すると次の main merge が gate を通らず直接公開されるため、
 * release の直前に観測した値へ必ず戻す。
 */
async function restoreAutoAssignCustomDomains({
  projectName,
  projectId,
  expected,
  token,
  teamId,
  fetchImpl,
  logger,
}) {
  if (typeof expected !== 'boolean') {
    // gate の前提は「Auto-assign が無効であること」なので、観測できなかった事実は残す。
    logger.log(`${projectName}: autoAssignCustomDomains was not observable; skipping restore`);
    return false;
  }

  const current = await getProjectMeta({ projectName, token, teamId, fetchImpl });
  if (current.autoAssignCustomDomains === expected) return false;

  await callVercel(apiUrl(`/v9/projects/${encodeURIComponent(projectId)}`, teamId), {
    token,
    fetchImpl,
    method: 'PATCH',
    label: `restore-auto-assign(${projectName})`,
    body: { autoAssignCustomDomains: expected },
    parseJson: false,
  });
  logger.log(`${projectName}: restored autoAssignCustomDomains to ${expected}`);
  return true;
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

      if (attempt < attempts) await sleepImpl(SMOKE_RETRY_DELAY_MS);
    }

    if (lastError) throw lastError;
    logger.log(`${projectName}: smoke ${path} ok`);
  }
}

async function waitForProductionAssignment({
  projectName,
  productionDomain,
  projectId,
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
    const production = await getLiveProduction({
      projectName,
      productionDomain,
      projectId,
      token,
      teamId,
      fetchImpl,
    });
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
  productionDomain,
  projectId,
  deploymentId,
  autoAssignCustomDomains,
  token,
  teamId,
  fetchImpl,
  sleepImpl,
  nowImpl,
  logger,
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
  const production = await waitForProductionAssignment({
    projectName,
    productionDomain,
    projectId,
    deploymentId,
    token,
    teamId,
    fetchImpl,
    sleepImpl,
    nowImpl,
    action: 'rollback',
  });
  // production pointer は戻っている。設定復元の失敗をここで throw すると
  // 「rollback 自体が失敗した」と誤報し、既に戻っている先への手動 rollback を
  // 指示することになる。両者を分けて返す。
  let autoAssignDrifted = false;
  try {
    await restoreAutoAssignCustomDomains({
      projectName,
      projectId,
      expected: autoAssignCustomDomains,
      token,
      teamId,
      fetchImpl,
      logger,
    });
  } catch {
    autoAssignDrifted = true;
  }
  return { production, autoAssignDrifted };
}

/** 復元をまとめて試し、失敗した project 名だけを返す。個別失敗は throw しない。 */
async function restoreAll({ entries, token, teamId, fetchImpl, logger }) {
  const drifted = [];
  for (const entry of entries) {
    try {
      await restoreAutoAssignCustomDomains({
        projectName: entry.project.name,
        projectId: entry.projectId,
        expected: entry.autoAssignCustomDomains,
        token,
        teamId,
        fetchImpl,
        logger,
      });
    } catch {
      drifted.push(entry.project.name);
    }
  }
  return drifted;
}

function driftError(sha, drifted) {
  return new ReleaseError(
    `Production serves ${sha}, but autoAssignCustomDomains could not be restored for ` +
      `${drifted.join(', ')}. Set it back before the next merge or the release gate is bypassed.`,
  );
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
  // gate が有効な運用（Auto-assign 無効化済み）では false を宣言する。
  // null の間は「run 開始時点の値へ戻す」だけになり、前回 run から持ち越した
  // ドリフトは検出できない。段階適用が終わったら宣言する。
  expectedAutoAssign = null,
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
  const autoAssign = new Map();
  const before = new Map();
  for (const project of projects) {
    const state = await getProjectState({
      projectName: project.name,
      productionDomain: project.productionDomain,
      token,
      teamId,
      fetchImpl,
    });
    projectIds.set(project.name, state.projectId);
    autoAssign.set(project.name, state.autoAssignCustomDomains);
    before.set(project.name, state.production);
  }

  // job が任意の時点で消えても手動 rollback 先が run に残るよう、先に書き出す。
  const openingLines = ['## Production Release', '', `- Commit: \`${sha}\``];
  for (const project of projects) {
    const current = before.get(project.name);
    const line =
      `- ${project.name}: current production \`${current?.id ?? 'none'}\`` +
      ` (sha \`${current?.sha ?? 'unknown'}\`, autoAssign ${autoAssign.get(project.name)})`;
    openingLines.push(line);
    logger.log(line.slice(2));
  }
  writeStepSummary(openingLines);

  const expectedFor = (name) =>
    typeof expectedAutoAssign === 'boolean' ? expectedAutoAssign : autoAssign.get(name);

  const alreadyServing = projects.filter((project) => before.get(project.name)?.sha === sha);

  // 前回 run が中断して片側だけ公開された状態。既に配信中の側は戻し先を持たないので
  // 自動 rollback の対象にはできない。せめて名指しして人が判断できるようにする。
  const preexistingSplit =
    alreadyServing.length > 0 && alreadyServing.length < projects.length
      ? alreadyServing.map((project) => project.name)
      : [];
  if (preexistingSplit.length > 0) {
    const message =
      `Pre-existing split: ${preexistingSplit.join(', ')} already serve ${sha} from an earlier run. ` +
      `They are outside this run's rollback scope; check them by hand if this run fails.`;
    logger.log(message);
    writeStepSummary(['', `> ${message}`]);
  }

  if (alreadyServing.length === projects.length) {
    logger.log(`All projects already serve ${sha}; nothing to promote.`);
    // 前回 run が復元に失敗して終わっている可能性があるため、設定だけは見に行く。
    const drifted = await restoreAll({
      entries: projects.map((project) => ({
        project,
        projectId: projectIds.get(project.name),
        autoAssignCustomDomains: expectedFor(project.name),
      })),
      token,
      teamId,
      fetchImpl,
      logger,
    });
    if (drifted.length > 0) throw driftError(sha, drifted);
    return { status: 'already-released', sha, promoted: [], rolledBack: [], preexistingSplit };
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

  // 待機は最大 25 分ブロックする。その間に人が Instant Rollback や手動 promote を
  // 行いうるため、判定は待機後の実状態で行う。
  const current = new Map();
  for (const project of projects) {
    const state = await getLiveProduction({
      projectName: project.name,
      productionDomain: project.productionDomain,
      projectId: projectIds.get(project.name),
      token,
      teamId,
      fetchImpl,
    });
    current.set(project.name, state);
  }

  const movedElsewhere = candidates.filter(({ project, deployment }) => {
    const now = current.get(project.name);
    const wasId = before.get(project.name)?.id ?? null;
    // 同じ candidate を人が先に promote した場合は競合ではない。
    return now?.id !== wasId && now?.id !== deployment.id;
  });
  if (movedElsewhere.length > 0) {
    const detail = movedElsewhere
      .map(({ project, deployment }) => {
        const now = current.get(project.name);
        return (
          `${project.name}: was ${before.get(project.name)?.id ?? 'none'}, ` +
          `now ${now?.id ?? 'none'}, candidate ${deployment.id}`
        );
      })
      .join('; ');
    throw new ReleaseError(
      `Production moved while waiting for candidates; refusing to promote over it (${detail})`,
    );
  }

  // 以降の判定はすべて待機後の実状態を使う。movedElsewhere を抜けている時点で
  // current は before か candidate のどちらかに一致している。
  const superseded = candidates.filter(({ project, deployment }) => {
    const live = current.get(project.name);
    return (
      live !== null &&
      live.createdAt !== null &&
      deployment.createdAt !== null &&
      live.createdAt > deployment.createdAt
    );
  });
  if (superseded.length > 0) {
    const names = superseded.map(({ project }) => project.name).join(', ');
    logger.log(`Skipping promote: a newer production deployment already serves ${names}.`);
    return { status: 'superseded', sha, promoted: [], rolledBack: [], preexistingSplit };
  }

  // 既に production へ出ている build は公開済みなので、gate の対象から外す。
  // 待機中に人が同じ candidate を promote していた場合もここで除外される。
  const pending = candidates.filter(
    ({ project, deployment }) => current.get(project.name)?.id !== deployment.id,
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
  const driftedProjects = [];
  try {
    for (const { project, deployment } of pending) {
      assertSimulationPoint(simulateFailure, `promote:${project.name}`);

      // smoke と audit で数分経っている。その間に人が Instant Rollback や手動
      // promote を行いうるので、rollback 先は promote の直前に取り直す。
      const live = await getLiveProduction({
        projectName: project.name,
        productionDomain: project.productionDomain,
        projectId: projectIds.get(project.name),
        token,
        teamId,
        fetchImpl,
      });

      if (live?.id === deployment.id) {
        logger.log(`${project.name}: another actor already promoted ${deployment.id}; skipping`);
        continue;
      }

      if (live?.id !== current.get(project.name)?.id) {
        throw new ReleaseError(
          `${project.name}: production moved to ${live?.id ?? 'none'} while the gate was ` +
            `running; refusing to promote ${deployment.id} over it`,
        );
      }

      const entry = {
        project,
        projectId: projectIds.get(project.name),
        autoAssignCustomDomains: expectedFor(project.name),
        deployment,
        previous: live,
      };
      logger.log(
        `${project.name}: promoting ${deployment.id} over ${entry.previous?.id ?? 'none'}`,
      );

      try {
        await requestProductionPointer({
          projectName: project.name,
          projectId: entry.projectId,
          deploymentId: deployment.id,
          token,
          teamId,
          fetchImpl,
          action: 'promote',
        });
      } catch (error) {
        // POST が届いたかどうか分からない。実状態を 1 回だけ見て、実際に動いて
        // いた時だけ rollback 対象へ入れる。無条件に入れると、何も起きていない
        // project へ rollback promote を撃ってしまい auto-assign を壊す。
        const state = await getLiveProduction({
          projectName: project.name,
          productionDomain: project.productionDomain,
          projectId: projectIds.get(project.name),
          token,
          teamId,
          fetchImpl,
        }).catch(() => null);
        if (state?.id === deployment.id) promoted.push(entry);
        throw error;
      }

      // POST が受理された時点で production は動きうる。反映確認が timeout しても
      // rollback 対象から漏らさないよう、確認を待つ前に記録する。
      promoted.push(entry);

      await waitForProductionAssignment({
        projectName: project.name,
        productionDomain: project.productionDomain,
        projectId: projectIds.get(project.name),
        deploymentId: deployment.id,
        token,
        teamId,
        fetchImpl,
        sleepImpl,
        nowImpl,
        action: 'promote',
      });

      // promote は auto-assign を true に戻す。次の project の確認を待つ間ずっと
      // 片側だけ auto-assign が有効な窓を作らないよう、ここで即座に戻す。
      // 復元の失敗は rollback を誘発させず、drifted に積んで最後に報告する。
      driftedProjects.push(
        ...(await restoreAll({ entries: [entry], token, teamId, fetchImpl, logger })),
      );
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
      preexistingSplit,
      preexistingDrift: driftedProjects,
    });
    throw Object.assign(error, { rolledBack });
  }

  // promote しなかった project も掃く。pending から除外された側や、外部の promote で
  // skip した側も、その promote の副作用で設定が飛んでいることがある。
  // ループ内の復元は「窓を作らない」ため、この掃きは「取りこぼさない」ためにある。
  const swept = await restoreAll({
    entries: projects.map((project) => ({
      project,
      projectId: projectIds.get(project.name),
      autoAssignCustomDomains: expectedFor(project.name),
    })),
    token,
    teamId,
    fetchImpl,
    logger,
  });
  for (const name of swept) {
    if (!driftedProjects.includes(name)) driftedProjects.push(name);
  }

  // production は正しい SHA を配信している。設定復元の失敗で巻き戻す理由はないが、
  // 放置すると次の merge が gate を迂回するため run は失敗させる。
  if (driftedProjects.length > 0) throw driftError(sha, driftedProjects);

  return { status: 'promoted', sha, promoted, rolledBack: [], preexistingSplit };
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
  preexistingSplit = [],
  preexistingDrift = [],
}) {
  const rolledBack = [];
  const stranded = [];
  const drifted = [...preexistingDrift];

  for (const entry of [...promoted].reverse()) {
    if (!entry.previous?.id) {
      stranded.push(`${entry.project.name} (no previous production deployment recorded)`);
      continue;
    }
    try {
      const { autoAssignDrifted } = await rollbackDeployment({
        projectName: entry.project.name,
        productionDomain: entry.project.productionDomain,
        projectId: entry.projectId,
        autoAssignCustomDomains: entry.autoAssignCustomDomains,
        logger,
        deploymentId: entry.previous.id,
        token,
        teamId,
        fetchImpl,
        sleepImpl,
        nowImpl,
      });
      if (autoAssignDrifted) drifted.push(entry.project.name);
      logger.log(`${entry.project.name}: rolled back to ${entry.previous.id}`);
      rolledBack.push(entry);
    } catch {
      stranded.push(`${entry.project.name} -> ${entry.previous.id}`);
    }
  }

  if (stranded.length > 0 || drifted.length > 0 || preexistingSplit.length > 0) {
    const lines = [`Rollback after "${cause.message}" did not fully clean up.`];
    if (stranded.length > 0) {
      lines.push(`MANUAL ROLLBACK REQUIRED. Point production back to: ${stranded.join('; ')}`);
    }
    if (preexistingSplit.length > 0) {
      lines.push(
        `Outside this run's rollback scope: ${preexistingSplit.join(', ')} already served the ` +
          `target SHA before it started. Check them by hand.`,
      );
    }
    if (drifted.length > 0) {
      lines.push(
        `Production is restored, but autoAssignCustomDomains could not be restored for ` +
          `${drifted.join(', ')}. Set it back before the next merge or the gate is bypassed.`,
      );
    }
    // manualRollback は「production pointer が動かせていない」ものだけを指す。
    throw new ReleaseError(lines.join(' '), { manualRollback: stranded });
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
  if (result.preexistingSplit?.length > 0) {
    lines.push(
      '',
      `Pre-existing split from an earlier run: ${result.preexistingSplit.join(', ')}.`,
    );
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
    expectedAutoAssign:
      process.env.RELEASE_EXPECT_AUTO_ASSIGN === 'false'
        ? false
        : process.env.RELEASE_EXPECT_AUTO_ASSIGN === 'true'
          ? true
          : null,
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
