import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveImpact } from './ci/impact.mjs';
import { runProductionConfigAudit } from './production-config-audit.mjs';

const API_ORIGIN = 'https://api.vercel.com';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * promote 順序 = 配列順。web を先に promote するため、2 つ目(product)が失敗した時に
 * rollback 対象になるのは web 側だけになる。
 *
 * `impactKey` は Impact Resolver（scripts/ci/impact.mjs）の出力キー。project 名と
 * 同じ文字列だが、判定側のキー名と release 側の project 名を別々に変えられるよう
 * 明示的に持つ。
 *
 * smoke は status だけでは足りない。product は未知 path でも 200 を返し
 * （`/[locale]/[nday]` が任意の 1 segment に一致する）、Next.js は streaming 中の
 * 失敗も 200 のまま返す。そこで Next.js が返す `x-matched-path` で
 * 「どの route が応答したか」を確定させ、内容が意味を持つ endpoint だけ本文も見る。
 */
export const RELEASE_PROJECTS = [
  {
    name: 'web',
    impactKey: 'web',
    bypassEnv: 'VERCEL_BYPASS_WEB',
    productionDomain: 'dayopt.app',
    smokeChecks: [
      { path: '/', matchedPath: '/en' },
      { path: '/ja', matchedPath: '/ja' },
    ],
  },
  {
    name: 'product',
    impactKey: 'product',
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
 * smoke は candidate（promote 前）と production domain（promote 後）で 2 巡する。
 */
const WORST_CASE_SMOKE_MS =
  RELEASE_PROJECTS.reduce((total, project) => total + project.smokeChecks.length, 0) *
  (SMOKE_ATTEMPTS * SMOKE_TIMEOUT_MS + (SMOKE_ATTEMPTS - 1) * SMOKE_RETRY_DELAY_MS);

export const WORST_CASE_RELEASE_MS =
  READY_TIMEOUT_MS + WORST_CASE_SMOKE_MS * 2 + RELEASE_PROJECTS.length * ASSIGN_TIMEOUT_MS * 2;

export class ReleaseError extends Error {
  constructor(message, { manualRollback } = {}) {
    super(message);
    this.name = 'ReleaseError';
    this.manualRollback = manualRollback ?? null;
  }
}

// ─── 影響判定（Impact Resolver の release 側 consumer）──────────────────

const SHA_PATTERN = /^[0-9a-f]{40}$/;

const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : 'unknown');

/**
 * 2 commit 間の変更ファイル一覧を返す。
 *
 * - `--no-renames` … rename 検出を切り、移動元の path も一覧へ残す。有効なままだと
 *   `apps/product/foo.ts` → `docs/foo.ts` の rename が新 path だけになり、ファイルが
 *   消えた側の app を unaffected と誤判定する（merge gate 側の previous_filename と同じ穴）
 * - `-z` … `core.quotePath` による非 ASCII path のエスケープを避ける
 *
 * 対象 commit が checkout に無い（shallow clone / gc 済み）場合は git が非 0 で終了し、
 * 呼び出し側の fail closed 経路へ落ちる。
 */
function gitDiffFiles(baseSha, targetSha) {
  const stdout = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', baseSha, targetSha],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      // 失敗は戻り値（throw）で扱う。stderr をそのまま親へ流すと、fail closed の
      // 正常な分岐が run のログでは事故のように見える。
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  return stdout.split('\0').filter(Boolean);
}

/**
 * 「この project の production を target SHA へ進める必要があるか」を判定する。
 *
 * 基準は **その project が今配信している deployment の source SHA**。project ごとに
 * 基準が違うのが要点で、web が 3 commit 遅れていても product だけが進んでいれば、
 * web の判定は web の live SHA から見た差分で行う。
 *
 * 判定不能はすべて affected（fail closed）へ倒す。Vercel の skip 判定ではなく
 * Dayopt 側の判定を正とする設計原則（overview.md §4-2）に従う。
 */
export function resolveProjectImpact({
  project,
  baseSha,
  targetSha,
  diffFilesImpl = gitDiffFiles,
}) {
  if (!SHA_PATTERN.test(baseSha ?? '')) {
    return { affected: true, reason: 'current production SHA is unknown (fail closed)' };
  }
  if (baseSha === targetSha) {
    return { affected: false, reason: `already serving ${short(targetSha)}` };
  }

  let files;
  try {
    files = diffFilesImpl(baseSha, targetSha);
  } catch {
    return {
      affected: true,
      reason: `cannot diff ${short(baseSha)}..${short(targetSha)} (fail closed)`,
    };
  }

  // git が正常終了して 0 件を返したのは「差分が無い」という確定的な答え。
  // 変更ファイル一覧の取得失敗（resolveImpact 側の fail closed 対象）とは別物なので、
  // resolveImpact へ空配列を渡さずここで unaffected を確定させる。
  if (files.length === 0) {
    return { affected: false, reason: `no file changes since ${short(baseSha)}` };
  }

  const impact = resolveImpact(files);
  // 未知キー（impactKey の改名事故）も affected へ倒す。
  const affected = impact[project.impactKey] !== false;
  const trigger = impact.reasons?.[project.impactKey] ?? impact.unknown?.[0];
  return {
    affected,
    reason: affected
      ? `changed since ${short(baseSha)}${trigger ? ` (${trigger})` : ''}`
      : `no ${project.impactKey} impact since ${short(baseSha)}`,
  };
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

// ─── release manifest ───────────────────────────────────────────────

/**
 * 「この run の後、どの project が何を配信しているか」を機械可読で残す。
 *
 * affected-aware 化で project ごとに live SHA が別々になりうるため、run の
 * ログを読まないと production の実態が分からない状態を避ける。部分失敗の
 * 復旧では、これが手動 rollback 先の一次情報になる。
 */
export function buildManifest({ sha, status, projects, decisions, before, promoted, rolledBack }) {
  const promotedBy = new Map(promoted.map((entry) => [entry.project.name, entry]));
  const rolledBackNames = new Set(rolledBack.map((entry) => entry.project.name));

  return {
    sha,
    status,
    projects: projects.map((project) => {
      const decision = decisions.get(project.name);
      const live = before.get(project.name) ?? null;
      const entry = promotedBy.get(project.name);
      const rolled = entry && rolledBackNames.has(project.name);
      // promote 済みで rollback していない = その deployment が今も live。run が
      // 失敗している場合、これがそのまま手動 rollback の対象になる。
      const serving = entry && !rolled ? { id: entry.deployment.id, sha } : null;
      const restored = rolled
        ? { id: entry.previous?.id ?? null, sha: entry.previous?.sha ?? null }
        : null;

      const action = entry
        ? rolled
          ? 'rolled-back'
          : 'promoted'
        : decision?.affected
          ? 'pending' // affected だが promote へ到達しなかった（先行 gate で停止）
          : live?.sha === sha
            ? 'already-serving'
            : 'skipped';

      return {
        name: project.name,
        productionDomain: project.productionDomain,
        affected: decision?.affected ?? null,
        reason: decision?.reason ?? null,
        action,
        deploymentId: (serving ?? restored ?? live)?.id ?? null,
        sourceSha: (serving ?? restored ?? live)?.sha ?? null,
        previousDeploymentId: entry?.previous?.id ?? null,
      };
    }),
  };
}

/**
 * manifest を run の artifact として残す。path 未設定なら何もしない。
 *
 * 書き込み失敗で run の合否を変えない。manifest は診断用で、ここで throw すると
 * promote 済みの正常な release を artifact の都合で失敗扱いにしてしまう。
 */
export function writeReleaseManifest(manifest, { env = process.env, logger = console } = {}) {
  if (!manifest) return false;
  const path = env.RELEASE_MANIFEST_PATH;
  if (!path) return false;
  try {
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    return true;
  } catch (error) {
    logger.error?.(`Could not write the release manifest (${error?.name ?? 'WriteFailed'})`);
    return false;
  }
}

/**
 * merge 済み SHA を、その merge の影響を受ける project の production domain へ公開する。
 *
 * 影響を受けない project は candidate を待たず promote もしない（Vercel が
 * deployment 自体を作らないため、待てば必ず timeout する）。production を動かす
 * 意図があった run は、最後に**全 project の production domain**を smoke する。
 * 片側だけ進んだ production は、その組み合わせが初めて世に出る状態だから。
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
  diffFilesImpl = gitDiffFiles,
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

  // project ごとに「今配信している SHA → target SHA」の差分で影響を判定する。
  // 既に target を配信している project は差分が空になるため affected にならない
  // （alreadyServing と targets は排他）。
  const decisions = new Map();
  const decisionLines = [];
  for (const project of projects) {
    const decision = resolveProjectImpact({
      project,
      baseSha: before.get(project.name)?.sha ?? null,
      targetSha: sha,
      diffFilesImpl,
    });
    decisions.set(project.name, decision);
    const line = `- ${project.name}: ${decision.affected ? 'affected' : 'skip'} — ${decision.reason}`;
    decisionLines.push(line);
    logger.log(line.slice(2));
  }
  writeStepSummary(['', '### Impact', '', ...decisionLines]);

  const alreadyServing = projects.filter((project) => before.get(project.name)?.sha === sha);
  const targets = projects.filter((project) => decisions.get(project.name).affected);

  const manifestFor = (status, { promoted = [], rolledBack = [] } = {}) =>
    buildManifest({ sha, status, projects, decisions, before, promoted, rolledBack });

  // 前回 run が中断して片側だけ公開された状態。既に配信中の側は戻し先を持たないので
  // 自動 rollback の対象にはできない。せめて名指しして人が判断できるようにする。
  // promote する予定が無い run には rollback scope 自体が無いので警告しない。
  const preexistingSplit =
    alreadyServing.length > 0 && targets.length > 0
      ? alreadyServing.map((project) => project.name)
      : [];
  if (preexistingSplit.length > 0) {
    const message =
      `Pre-existing split: ${preexistingSplit.join(', ')} already serve ${sha} from an earlier run. ` +
      `They are outside this run's rollback scope; check them by hand if this run fails.`;
    logger.log(message);
    writeStepSummary(['', `> ${message}`]);
  }

  if (targets.length === 0) {
    const status = alreadyServing.length === projects.length ? 'already-released' : 'unaffected';
    logger.log(
      status === 'already-released'
        ? `All projects already serve ${sha}; nothing to promote.`
        : `No project is affected by ${sha}; nothing to promote.`,
    );
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
    if (drifted.length > 0)
      throw Object.assign(driftError(sha, drifted), { manifest: manifestFor('failed') });
    return {
      status,
      sha,
      promoted: [],
      rolledBack: [],
      preexistingSplit,
      manifest: manifestFor(status),
    };
  }

  const candidates = await waitForReadyCandidates({
    projects: targets,
    sha,
    token,
    teamId,
    fetchImpl,
    sleepImpl,
    nowImpl,
    logger,
  }).catch((error) => {
    throw Object.assign(error, { manifest: manifestFor('failed') });
  });

  // 待機は最大 25 分ブロックする。その間に人が Instant Rollback や手動 promote を
  // 行いうるため、判定は待機後の実状態で行う。unaffected な project は promote 対象で
  // ないので読み直さない（この run が動かさない先の状態は before で足りる）。
  const current = new Map();
  for (const project of targets) {
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
    throw Object.assign(
      new ReleaseError(
        `Production moved while waiting for candidates; refusing to promote over it (${detail})`,
      ),
      { manifest: manifestFor('failed') },
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
    return {
      status: 'superseded',
      sha,
      promoted: [],
      rolledBack: [],
      preexistingSplit,
      manifest: manifestFor('superseded'),
    };
  }

  // 既に production へ出ている build は公開済みなので、gate の対象から外す。
  // 待機中に人が同じ candidate を promote していた場合もここで除外される。
  const pending = candidates.filter(
    ({ project, deployment }) => current.get(project.name)?.id !== deployment.id,
  );

  // 全 project の auto-assign を期待値へ戻す。外部の promote が待機中に設定を
  // 飛ばしている可能性があるため、失敗して抜けるどの経路でも最後に呼ぶ。
  // restoreAll は project 単位で失敗を握るので、この呼び出し自体は throw しない。
  const sweepSettings = () =>
    restoreAll({
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

  // 掃きで復元に失敗した project は、元の失敗と別に名指しする。放置すると次の
  // merge が gate を迂回するのに、run の失敗理由には現れないため。
  const reportSweepDrift = (drifted) => {
    if (drifted.length === 0) return;
    const message =
      `autoAssignCustomDomains could not be restored for ${drifted.join(', ')}. ` +
      `Set it back before the next merge or the release gate is bypassed.`;
    logger.log(message);
    writeStepSummary(['', `> ${message}`]);
  };

  if (force) {
    logger.log('Force Promote: skipping smoke and Production Config Audit.');
  } else {
    // smoke は promote 対象（pending）ではなく全 candidate に対して走らせる。
    // Auto-assign が有効な段階適用中は candidate が待機中に自動割当されて
    // pending が空になるため、pending だけを対象にすると smoke のコードパスが
    // 一度も実行されないまま cutover を迎えてしまう。全 candidate に走らせる
    // ことで、毎 merge が smoke と bypass secret の実働テストを兼ねる。
    try {
      for (const { project, deployment } of candidates) {
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
    } catch (error) {
      // 外部の promote が待機中に auto-assign を飛ばしていた場合、ここで抜けると
      // 誰も設定を戻さない。掃いてから失敗させる。
      reportSweepDrift(await sweepSettings());
      throw Object.assign(error, { manifest: manifestFor('failed') });
    }
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

    // promote 後の production domain smoke。candidate smoke は各 deployment を単体で
    // 見るが、affected な側だけを進めた production は **その組み合わせが初めて世に出る
    // 状態**なので、実際に配信している両 domain を最後に確認する。
    // bypass secret は送らない。production domain に Deployment Protection が付く
    // 設定事故（利用者に SSO 画面が出る）を、この smoke で捕まえたいため。
    //
    // 条件は promote 件数ではなく targets。Auto-assign が有効な段階適用中は candidate が
    // 待機中に自動割当されて promote 件数が 0 になるため、promote 件数で分岐すると
    // cutover までこの smoke が一度も走らない（candidate smoke と同じ理由）。
    if (!force && targets.length > 0) {
      for (const project of projects) {
        assertSimulationPoint(simulateFailure, `production-smoke:${project.name}`);
        await smokeDeployment({
          projectName: `${project.name} production`,
          deploymentUrl: project.productionDomain,
          checks: project.smokeChecks,
          fetchImpl,
          sleepImpl,
          logger,
        });
      }
    }
  } catch (error) {
    // promote 済みの側を戻す。対象は **この run が promote した project だけ**で、
    // 前から target を配信していた側（preexistingSplit）には戻し先が無い。
    let failure = error;
    let rolledBack = [];
    try {
      rolledBack = await rollbackPromoted({
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
    } catch (rollbackError) {
      // 手動 rollback の指示を持つ方を投げる。元の失敗理由は cause として本文に入る。
      failure = rollbackError;
    } finally {
      // rollback の成否に関わらず、promote しなかった project の設定も掃く。
      reportSweepDrift(await sweepSettings());
    }
    throw Object.assign(failure, {
      rolledBack,
      manifest: manifestFor('failed', { promoted, rolledBack }),
    });
  }

  // promote しなかった project も掃く。pending から除外された側や、外部の promote で
  // skip した側も、その promote の副作用で設定が飛んでいることがある。
  // ループ内の復元は「窓を作らない」ため、この掃きは「取りこぼさない」ためにある。
  const swept = await sweepSettings();
  for (const name of swept) {
    if (!driftedProjects.includes(name)) driftedProjects.push(name);
  }

  // production は正しい SHA を配信している。設定復元の失敗で巻き戻す理由はないが、
  // 放置すると次の merge が gate を迂回するため run は失敗させる。
  if (driftedProjects.length > 0) {
    throw Object.assign(driftError(sha, driftedProjects), {
      manifest: manifestFor('failed', { promoted }),
    });
  }

  return {
    status: 'promoted',
    sha,
    promoted,
    rolledBack: [],
    preexistingSplit,
    gateChecksRan: !force,
    manifest: manifestFor('promoted', { promoted }),
  };
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
export const RELEASE_STATUSES = new Set([
  'already-released',
  'promoted',
  'superseded',
  'unaffected',
  'failed',
]);

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
  if (result.status === 'promoted' && result.promoted.length === 0) {
    lines.push(
      '',
      'Nothing was left to promote: Vercel auto-assigned the candidates (Auto-assign is on).',
    );
    lines.push(
      result.gateChecksRan
        ? 'The gate still verified smoke and the config audit against them.'
        : 'Force Promote: smoke and the config audit were skipped, so nothing was verified.',
    );
  }
  if (result.status === 'superseded') {
    lines.push(
      '',
      'A newer Production deployment already serves Production. Nothing was promoted,',
      'and this commit is **not** live. Do not tag it.',
    );
  }
  if (result.status === 'unaffected') {
    lines.push(
      '',
      'This commit changes nothing that either app serves, so Production was left as it is.',
      'The build behind each domain is unchanged and equivalent to this commit.',
    );
  }
  if (result.manifest) {
    lines.push(
      '',
      '### Release manifest',
      '',
      '```json',
      JSON.stringify(result.manifest, null, 2),
      '```',
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
      writeReleaseManifest(result.manifest);
      writeReleaseStatus(result.status);
      console.log(`Production Release finished: ${result.status}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Production Release failed';
      const lines = ['## Production Release', '', `- Failed: ${message}`];
      // 部分失敗の復旧では「今どの project が何を配信しているか」が一次情報になる。
      // 失敗時こそ manifest を残す。
      if (error?.manifest) {
        lines.push(
          '',
          '### Release manifest',
          '',
          '```json',
          JSON.stringify(error.manifest, null, 2),
          '```',
        );
        writeReleaseManifest(error.manifest);
      }
      writeStepSummary(lines);
      writeReleaseStatus('failed');
      console.error(message);
      process.exitCode = 1;
    });
}
