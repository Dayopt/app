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
      // CTA の href まで見る。product 側の `/auth/signup` が生きていても、web から
      // その導線が消えていれば入口は失われる（destination の存在確認だけでは足りない）。
      // HeroSection は server component の素の <a href> なので SSR の本文に出る。
      { path: '/', matchedPath: '/en', contains: 'app.dayopt.app/auth/signup' },
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
      // web の hero / header / pricing の CTA がここへ入る（app.dayopt.app/auth/signup）。
      // product 側だけを進めた release で消えると、web からの唯一の入口が落ちる。
      { path: '/auth/signup', matchedPath: '/[locale]/auth/signup' },
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
 * 「要求が受理されなかった」が確定する HTTP status。これ以外（5xx / transport 失敗）は
 * 届いたかどうか分からないので、production を動かした可能性がある側として扱う。
 * 429 も含める。rate limit は要求の拒否であって、受理して遅延しているのではない。
 */
const DEFINITIVE_REJECTIONS = new Set([400, 401, 403, 404, 429]);

/**
 * promote の受理が不確かな時、その反映を待つ窓。POST が 5xx / transport で失敗しても
 * Vercel 側が受理していることがあり、alias の変化は非同期に遅れて現れる。rollback 直後に
 * 「previous のままだから戻った」と即断すると、その後に元の promote が着地して
 * gate を通っていない deployment が live になる。
 *
 * 窓は `ASSIGN_TIMEOUT_MS` と同じにする。**この script 自身が assignment の反映に
 * その時間まで許しているのだから、遅れて着地する promote も同じ時間まで有効**。
 * これより短い窓にすると、その差の時間帯に着地する promote を必ず見逃す。
 */
const AMBIGUOUS_SETTLE_MS = ASSIGN_TIMEOUT_MS;

/**
 * 掃きと検証を交互に回す上限。外部 actor が promote を続ける限り収束しないので
 * 有限で打ち切り、最後の検証が通った時点の観測を根拠にする。
 */
const STABILIZE_ATTEMPTS = 3;

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

// project あたりの反映待ちは最大 2 回分。promote の確認 + rollback の確認、または
// promote の受理が不確かな場合の「着地待ち + rollback の確認」のどちらか。
// 受理が不確かな経路では promote の確認を行わずに抜けるので、3 つが重なることはない。
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
 *
 * `cwd` は test が使い捨ての repo を渡すためだけの口。実行時は常に ROOT。
 */
export function gitDiffFiles(baseSha, targetSha, { cwd = ROOT } = {}) {
  const stdout = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', baseSha, targetSha],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      // 失敗は戻り値（throw）で扱う。stderr をそのまま親へ流すと、fail closed の
      // 正常な分岐が run のログでは事故のように見える。
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  return stdout.split('\0').filter(Boolean);
}

/** checkout の HEAD SHA。取れなければ null（fail closed 経路へ落とす）。 */
export function gitHeadSha({ cwd = ROOT } = {}) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
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
 *
 * `checkoutAtTarget` は「checkout の tree が target SHA そのものか」。workspace 依存
 * グラフは **checkout の manifest** から解決するため、これが false だと target 当時と
 * 違うグラフで分類することになる。`workflow_dispatch` で古い SHA を再試行した時に
 * 起きる（release.yml は main 包含だけを要求し、checkout は dispatch した ref のまま）。
 * 例えば target の後で web が package への依存を外していると、その package の変更が
 * 「web に consumer 無し」と判定され、live でない build に success が付く。
 */
export function resolveProjectImpact({
  project,
  baseSha,
  targetSha,
  checkoutAtTarget = true,
  diffFilesImpl = gitDiffFiles,
}) {
  if (!SHA_PATTERN.test(baseSha ?? '')) {
    return { affected: true, reason: 'current production SHA is unknown (fail closed)' };
  }
  if (baseSha === targetSha) {
    return { affected: false, reason: `already serving ${short(targetSha)}` };
  }
  if (!checkoutAtTarget) {
    return { affected: true, reason: 'checkout is not the release target (fail closed)' };
  }

  // この関数は throw しない。判定に関わるあらゆる失敗（git・workspace manifest の
  // 読み取り・分類）を affected へ倒す。呼び出し側は decisions を組み立てる前に
  // manifest を作れないので、ここで抜けると失敗経路だけ manifest を失う。
  try {
    const files = diffFilesImpl(baseSha, targetSha);

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
  } catch {
    return {
      affected: true,
      reason: `cannot resolve impact for ${short(baseSha)}..${short(targetSha)} (fail closed)`,
    };
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
    // status は呼び出し側が「要求が確実に拒否されたか（4xx）」と「届いたか不明か
    // （5xx / transport）」を区別するために使う。
    throw Object.assign(
      new ReleaseError(`Vercel API ${label} failed with status ${response.status}`),
      { status: response.status },
    );
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

/**
 * 復元をまとめて試し、`drifted`（失敗した project）と `restored`（実際に直した
 * project）を返す。個別失敗は throw しない。
 *
 * `restored` が空でないことは「直前に外部の promote があった」証拠になる。alias を
 * 動かさない再 promote（同じ deployment を promote し直す）は設定だけを飛ばすので、
 * これが唯一の検出手段。
 */
async function restoreAll({ entries, token, teamId, fetchImpl, logger }) {
  const drifted = [];
  const restored = [];
  for (const entry of entries) {
    try {
      const didRestore = await restoreAutoAssignCustomDomains({
        projectName: entry.project.name,
        projectId: entry.projectId,
        expected: entry.autoAssignCustomDomains,
        token,
        teamId,
        fetchImpl,
        logger,
      });
      if (didRestore) restored.push(entry.project.name);
    } catch {
      drifted.push(entry.project.name);
    }
  }
  return { drifted, restored };
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
export function buildManifest({
  sha,
  status,
  projects,
  decisions,
  before,
  promoted,
  rolledBack,
  externallyLive = new Map(),
  movedAway = new Map(),
  gatesPassed = new Set(),
}) {
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
      // **この run が置いたのではない deployment が live** と観測された分。待機中の
      // 外部 promote でも、我々の promote 後の hotfix でも入る。実際に配信している
      // ものを載せるのが目的なので、他のどの推定よりも優先する。
      const moved = rolled ? null : (movedAway.get(project.name) ?? null);
      // 外部 actor が先に promote した分。この run は動かしていないが live ではある。
      const external = entry ? null : (externallyLive.get(project.name) ?? null);

      // 最終的に「今 live」と判断した記録。action も ID もここから導く。
      const effective = moved ?? serving ?? restored ?? external ?? live;

      // **target が live なのに、この run の gate を通っていない状態。** 待機中の
      // Auto-assign や他者の promote で live になり、その後 gate が落ちた場合に起きる。
      // `already-serving`（= 触るな）と書くと、認証されていない build が放置される。
      const uncertified =
        !entry && !moved && effective?.sha === sha && !gatesPassed.has(project.name);

      const action = moved
        ? moved.id
          ? 'moved-externally' // 他者の deployment が live。**戻す対象ではない**
          : 'unassigned' // production domain にどの deployment も割り当たっていない
        : entry
          ? rolled
            ? 'rolled-back'
            : 'promoted'
          : uncertified
            ? 'uncertified' // gate を通らずに live。**手動で戻す判断が要る**
            : effective?.sha === sha
              ? 'already-serving'
              : decision?.affected
                ? 'pending' // affected だが promote へ到達しなかった（先行 gate で停止）
                : 'skipped';

      return {
        name: project.name,
        productionDomain: project.productionDomain,
        affected: decision?.affected ?? null,
        reason: decision?.reason ?? null,
        action,
        deploymentId: effective?.id ?? null,
        sourceSha: effective?.sha ?? null,
        // 未割当の時は「戻す先」が manifest から消えないよう、run 開始時点の deployment を
        // 復旧先として残す（promote entry があればそちらが優先）。
        // 復旧先。promote entry があればその previous、`uncertified` / `unassigned` では
        // run 開始時点の deployment（それが唯一の戻し先）。
        // 復旧先。**今 live なものと同じ ID は戻し先にならない。** run 開始時点で既に
        // target が live だった project が gate に落ちた場合、run 開始時点の deployment は
        // まさにその落ちた deployment なので、戻し先としては使えない（null にして
        // runbook 側で deployment 履歴を辿らせる）。
        previousDeploymentId:
          entry?.previous?.id ??
          ((uncertified || (moved && !moved.id)) && live?.id && live.id !== effective?.id
            ? live.id
            : null),
        // この run が観測していない project の値は run 開始時点のもの。candidate 待機
        // （最大 25 分）の間に人が Instant Rollback していれば実態とズレる。復旧時に
        // 「いつ観測した値か」を取り違えないよう、出所を値と一緒に残す。
        observedAt: moved || entry || external ? 'this-run' : 'run-start',
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
  headShaImpl = gitHeadSha,
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
  // 依存グラフも diff も checkout の tree から読む。target と違う tree で分類すると
  // 当時と違うグラフで判定することになるため、一致しない run は fail closed に倒す。
  const checkoutAtTarget = headShaImpl() === sha;
  if (!checkoutAtTarget) {
    logger.log(`Checkout is not ${sha}; classifying every project as affected (fail closed).`);
  }

  const decisions = new Map();
  const decisionLines = [];
  for (const project of projects) {
    const decision = resolveProjectImpact({
      project,
      baseSha: before.get(project.name)?.sha ?? null,
      targetSha: sha,
      checkoutAtTarget,
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

  // この run が promote していないのに target SHA が live になった project。
  // 待機中や gate 実行中に外部 actor が同じ candidate を promote した場合に入る。
  const externallyLive = new Map();

  /**
   * **この run の gate（production smoke + config audit + live 検証）を実際に通した
   * project 名。** 「target が live なのに gate を通っていない」を manifest で
   * `uncertified` として区別するために使う。
   *
   * run の status から推測しない。status は gate の前に返る経路（superseded）もあれば、
   * gate を通った後の設定失敗（settings-drift）もあり、どちらも「認証されたか」とは
   * 独立だから。
   */
  const gatesPassed = new Set();

  // この run が promote した後に他者が別 deployment を live にした project。
  // rollback せず残すため、manifest には観測した live を載せる（我々の candidate を
  // 配信中と誤記すると、runbook の手順で「戻す」対象に見えてしまう）。
  const movedAway = new Map();

  /**
   * 失敗 manifest を作る前に、全 project の live を読み直して観測を反映する。
   *
   * gate（smoke / audit）が落ちた時点では、その project の live が run 開始時点から
   * 動いていても誰も記録していない。manifest が run 開始時点の deployment を
   * `skipped` / `already-serving` として載せると、runbook が「触るな」と案内して
   * unhealthy な domain を放置させる。読めない project は黙って飛ばす（best effort）。
   */
  const refreshObservedLive = async ({ skip = new Set() } = {}) => {
    for (const project of projects) {
      // この run が説明を持つ project は触らない（promote / rollback / 待機中の
      // 自動割当は、それぞれの経路が既に正しい記録を作っている）。
      if (skip.has(project.name) || externallyLive.has(project.name)) continue;
      const startId = before.get(project.name)?.id ?? null;
      const live = await getLiveProduction({
        projectName: project.name,
        productionDomain: project.productionDomain,
        projectId: projectIds.get(project.name),
        token,
        teamId,
        fetchImpl,
      }).catch(() => undefined);
      if (live === undefined) continue; // 読めなかった
      if ((live?.id ?? null) !== startId) {
        movedAway.set(project.name, { id: live?.id ?? null, sha: live?.sha ?? null });
      }
    }
  };

  const manifestFor = (status, { promoted = [], rolledBack = [] } = {}) =>
    buildManifest({
      sha,
      status,
      projects,
      decisions,
      before,
      promoted,
      rolledBack,
      externallyLive,
      movedAway,
      gatesPassed,
    });

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

  const alreadyServingNames = new Set(alreadyServing.map((project) => project.name));

  /**
   * **success を出す前に、判定の前提が今も成り立っているかを live 状態で確認する。**
   *
   * この run が置いた deployment だけを見ても足りない。release の success は
   * 「この commit が live」という主張で、tag gate（create-release.yml）がそれを信じる。
   * gate の実行中は数分あり、その間に人や Auto-assign が任意の project を動かせる。
   * project ごとに「何を期待するか」は判定の種類で決まる:
   *
   * - candidate を出した project … その deployment が live であること
   * - 既に target を配信していた project … 今も target SHA であること
   * - skip した project … 判定の基準にした SHA のままであること（変わっていれば
   *   「影響なし」の判定自体が別の基準で下されたことになり、陳腐化している）
   *
   * force でも実行する。Force Promote が免除するのは health / config の gate であって、
   * 「promote した SHA が今も live」という主張そのものではない。
   */
  const verifyLiveState = async (candidateEntries) => {
    const expectedId = new Map(
      candidateEntries.map(({ project, deployment }) => [project.name, deployment.id]),
    );

    for (const project of projects) {
      const live = await getLiveProduction({
        projectName: project.name,
        productionDomain: project.productionDomain,
        projectId: projectIds.get(project.name),
        token,
        teamId,
        fetchImpl,
      });

      const wanted = expectedId.get(project.name);
      if (wanted) {
        if (live?.id !== wanted) {
          // live が null（alias 未割当）も観測結果。落とすと manifest が
          // 「我々の candidate を配信中」のまま残る。
          movedAway.set(project.name, { id: live?.id ?? null, sha: live?.sha ?? null });
          throw new ReleaseError(
            `${project.name}: production serves ${live?.id ?? 'none'}, not the released ` +
              `${wanted}; refusing to report ${sha} as live`,
          );
        }
        continue;
      }

      // **deployment ID が run 開始時点から変わっていたら認証しない。**
      // 同じ commit の別 deployment でも build 時の設定は違いうるし、gate（smoke /
      // config audit）を一度も通っていない。`READY` と source SHA は gate が
      // 証明している内容ではないので、「SHA が同じなら受理」は認証の穴になる。
      const startId = before.get(project.name)?.id ?? null;
      if (live?.id !== startId) {
        movedAway.set(project.name, { id: live?.id ?? null, sha: live?.sha ?? null });
        throw new ReleaseError(
          `${project.name}: production moved to ${live?.id ?? 'no deployment'} after the gates ran; ` +
            `that deployment was never smoked or audited, so ${sha} is not certified`,
        );
      }

      // 基準 SHA が観測できていない project は affected へ倒っているのでここには来ない。
      const wantedSha = alreadyServingNames.has(project.name)
        ? sha
        : (before.get(project.name)?.sha ?? null);
      if (wantedSha && live?.sha !== wantedSha) {
        movedAway.set(project.name, { id: live?.id ?? null, sha: live?.sha ?? null });
        throw new ReleaseError(
          `${project.name}: production moved to ${live?.sha ?? 'an unknown commit'} while the ` +
            `gate was running; refusing to report ${sha} as live`,
        );
      }
    }
  };

  /**
   * **設定を掃いた後に live 状態を検証する。** この順序が要点で、逆にすると掃きが
   * 設定を直せてしまうために、検証後・掃き中に起きた promote が失敗として現れない。
   *
   * verify が不受理の移動を見つけたら throw する。**この関数は rollback で保護された
   * 領域の中から呼ぶ**こと（呼び出し側の catch が rollback と manifest を担う）。
   *
   * @returns 残っている drift（空でなければ設定復元が失敗している）
   */
  const stabilize = async (candidateEntries) => {
    let sweep = await sweepSettings();
    for (let attempt = 1; attempt <= STABILIZE_ATTEMPTS; attempt += 1) {
      // 検証を掃きの**後**に置く。逆順だと、掃きが設定を直せてしまうために、その間に
      // 起きた promote が失敗として現れない。
      await verifyLiveState(candidateEntries);

      // 検証の後にもう一度掃く。**同じ deployment を promote し直す操作は alias を
      // 動かさないので検証は通るが、auto-assign だけが飛ぶ。** 掃きが「直した」なら
      // その間に promote があったということなので、もう一周して検証し直す。
      sweep = await sweepSettings();
      if (sweep.restored.length === 0) return sweep.drifted;
      logger.log(
        `Auto-assign was re-enabled during verification; re-checking (attempt ${attempt}).`,
      );
    }
    return sweep.drifted;
  };

  // **この関数のどの出口も、抜ける前に auto-assign を掃く。** 外部の promote は
  // 設定を true へ戻す（vercel/vercel#15095）。掃き忘れた出口が 1 つでもあると、
  // その run は正しく失敗したのに次の main merge が gate を通らず直接公開される。
  // 出口ごとに書くと必ず取り残しが出るため（実際 3 巡続けて別の出口が見つかった）、
  // 本体を包んで一括で掃く。restoreAll は差分がある時だけ PATCH するので、
  // 既に掃いた経路で重ねて呼んでも副作用は無い。
  //
  // finally ではなく catch + 後処理にしているのは、**最後の掃きで見つかった drift を
  // 失敗として扱う**ため。finally で throw すると実行中の例外を握り潰すので、
  // 失敗経路では報告だけに留め、成功経路でだけ settings-drift へ倒す。
  const result = await (async () => {
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
      // **ここでは失敗にしない。** 一時的な失敗なら stabilize の掃きで直る。判定を
      // 最初の観測で確定させると、既に直っている状態で tag を打てなくする。
      const { drifted } = await sweepSettings();
      if (drifted.length > 0) {
        logger.log(`Initial restore failed for ${drifted.join(', ')}; stabilization decides.`);
      }

      // **promote が 0 件でも、この run が success を出せば「その build は live」として
      // tag gate を通る**（create-release.yml）。既に target を配信している project は
      // Auto-assign や中断した run が gate を通さずに live にした可能性があるため、
      // 認証する前に実際の production domain を見る。ここを素通りさせると、
      // smoke も audit も一度も通っていない build に tag を打ててしまう。
      //
      // gate の実行中に外部の promote が起きると auto-assign が再び true へ戻る。
      // 上の復元は gate より前なので、**抜ける経路すべてで掃き直す**（finally）。
      // 掃き忘れると次の main merge が gate を迂回して直接公開される。
      try {
        if (!force && alreadyServing.length > 0) {
          // **smoke は alreadyServing だけでなく全 project の domain へ。** 通常経路と
          // 同じ範囲にする。片側だけ見て success を出すと、健全でない skip 側の domain や
          // cross-app の組み合わせ破損を認証したまま tag を打てる。
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
          await runProductionConfigAudit({ token, teamId, fetchImpl });
          logger.log('Production Config Audit passed against live Vercel metadata.');
        }

        // promote していなくても「この commit が live」を主張する以上、前提を確認する。
        // 掃きと検証は安定するまで交互に回す（§stabilize）。
        const residual = await stabilize([]);
        // ここまで来れば smoke / audit / live 検証を通っている。設定復元が失敗しても
        // 「認証された」事実は変わらないので、drift 判定より前に記録する。
        for (const project of projects) gatesPassed.add(project.name);
        if (residual.length > 0) {
          throw Object.assign(driftError(sha, residual), {
            manifest: manifestFor('settings-drift'),
          });
        }
      } catch (error) {
        reportSweepDrift((await sweepSettings()).drifted);
        await refreshObservedLive();
        if (!error.manifest) Object.assign(error, { manifest: manifestFor('failed') });
        throw error;
      }

      return {
        status,
        sha,
        promoted: [],
        rolledBack: [],
        preexistingSplit,
        gateChecksRan: !force && alreadyServing.length > 0,
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
      // 25 分待った後の失敗。ここで manifest を付けずに抜けると、artifact が
      // 1 つも残らない（run 開始時点の状態すら読めなくなる）。
      const state = await getLiveProduction({
        projectName: project.name,
        productionDomain: project.productionDomain,
        projectId: projectIds.get(project.name),
        token,
        teamId,
        fetchImpl,
      }).catch((error) => {
        throw Object.assign(error, { manifest: manifestFor('failed') });
      });
      current.set(project.name, state);
    }

    // 待機中に Auto-assign や人が candidate を live にした分をここで拾う。promote loop の
    // 記録だけに頼ると、この後の `pending` filter で除外されて loop に届かず、live なのに
    // manifest 上「未着手（pending）」として復旧手順に出てしまう。
    for (const { project, deployment } of candidates) {
      if (current.get(project.name)?.id === deployment.id) {
        externallyLive.set(project.name, { id: deployment.id, sha });
      }
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

      // 観測した実 deployment を manifest へ載せる。run 開始時点の値のままだと
      // 「未着手（pending）」に見え、復旧手順が実際の live を取り違える。
      for (const { project } of movedElsewhere) {
        const now = current.get(project.name);
        // now が null（alias 未割当）も観測結果。落とすと manifest が run 開始時点の
        // deployment を「未着手」として残す。
        movedAway.set(project.name, { id: now?.id ?? null, sha: now?.sha ?? null });
      }

      // 外部の promote は auto-assign を true へ戻す（vercel/vercel#15095）。
      // ここで掃かずに抜けると、次の main merge が gate を通らず直接公開される。
      reportSweepDrift((await sweepSettings()).drifted);

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
      // 外部の promote が auto-assign を戻している可能性があるため、抜ける前に掃く。
      // **drift があっても superseded のままにする。** ここは「より新しい deployment が
      // live」と証明した経路で、settings-drift（= 正しい SHA が live）へ塗り替えると
      // 復旧手順が矛盾する。設定の問題は報告として別に出す。
      reportSweepDrift((await sweepSettings()).drifted);
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
        reportSweepDrift((await sweepSettings()).drifted);
        await refreshObservedLive();
        throw Object.assign(error, { manifest: manifestFor('failed') });
      }
    }

    const promoted = [];
    const driftedProjects = [];
    /** stabilize が最後に観測した設定 drift。空でなければ run を失敗させる。 */
    let residualDrift = [];
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
          // gate をこの後通せなければ manifest は `uncertified` になる（gatesPassed に
          // 入らないため）。復旧先は run 開始時点の deployment。
          // この run は動かしていないが live ではある。manifest で「未着手」に見えないよう
          // 記録する（rollback 対象には入れない。戻し先を観測していないため）。
          externallyLive.set(project.name, { id: deployment.id, sha });
          continue;
        }

        if (live?.id !== current.get(project.name)?.id) {
          // 観測した実 deployment を manifest へ載せてから抜ける。run 開始時点の値の
          // ままだと「未着手（pending）」に見え、復旧手順が live を取り違える。
          // live が null（alias 未割当）も観測結果なので落とさない。
          movedAway.set(project.name, { id: live?.id ?? null, sha: live?.sha ?? null });
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
          // **POST が届いたかどうか分からない状態は「何も起きていない」ではない。**
          // response を失っただけで Vercel 側は受理しているかもしれず、alias が
          // まだ前の deployment を返すのは反映待ちとも区別がつかない（読み取り自体が
          // 失敗することもある）。ここで rollback 対象から外すと、この run が終わった
          // 後に target が live になり、戻す先を誰も知らないまま片側公開が残る。
          //
          // 迷ったら rollback 対象に入れる。何も起きていなかった場合の代償は
          // 「previous を previous へ promote する空振り」だけで、auto-assign は
          // rollback 側の復元と関数末尾の掃きが戻す。rollbackPromoted は実行前に
          // live を読み直し、第三の deployment が居れば触らない。
          // ただし 4xx は「受理されなかった」が確定する。ここで rollback 対象に入れると
          // 何も起きていない production へ 2 度目の mutation を撃ち、同じ理由でそれも
          // 失敗して「手動 rollback が要る」と誤報することになる。
          if (DEFINITIVE_REJECTIONS.has(error?.status)) {
            logger.log(`${project.name}: promote was rejected (${error.status}); nothing to undo`);
            throw error;
          }
          logger.log(
            `${project.name}: promote request outcome is unknown; keeping it in the rollback scope`,
          );
          // rollback 側で「戻った」と即断させないための印。previous は一度も live を
          // 外れていない可能性があり、その場合 assignment の確認が即座に通ってしまう。
          promoted.push({ ...entry, ambiguous: true });
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
          ...(await restoreAll({ entries: [entry], token, teamId, fetchImpl, logger })).drifted,
        );
        logger.log(`${project.name}: promoted ${deployment.id}`);
      }

      // promote 後の production domain smoke。candidate smoke は各 deployment を単体で
      // 見るが、affected な側だけを進めた production は **その組み合わせが初めて世に出る
      // 状態**なので、実際に配信している両 domain を最後に確認する。
      //
      // 検出できるのは smokeChecks に載っている経路だけ。cross-app のリンク切れ一般は
      // 見ない。web から product への唯一の入口である signup CTA は product の check に
      // 入れてあるので、その 1 本だけが「片側 promote で web の導線が落ちる」を捕まえる。
      // bypass secret は送らない。production domain に Deployment Protection が付く
      // 設定事故（利用者に SSO 画面が出る）を、この smoke で捕まえたいため。
      //
      // 条件は promote 件数ではなく targets。Auto-assign が有効な段階適用中は candidate が
      // 待機中に自動割当されて promote 件数が 0 になるため、promote 件数で分岐すると
      // cutover までこの smoke が一度も走らない（candidate smoke と同じ理由）。
      //
      // **promote していない側の失敗でも rollback する**（catch へ落ちる）。この smoke が
      // 守りたいのは「product を進めたら web が壊れた」型の cross-app 破損で、そこでは
      // rollback が唯一の復旧手段になる。代償として、無関係な既存障害が正常な promote を
      // 巻き戻しうるが、production は数分前の既知状態へ戻るだけで、run は失敗として残る。
      // 「壊れたまま success で終える」より安全な側へ倒す。
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

      // smoke は「domain が健全か」しか見ず、**どの deployment が応答したかは見ない**。
      // 全 project について「判定の前提が今も成り立つか」を確認する（§verifyLiveState）。
      // force でも実行する。Force Promote が免除するのは health / config の gate であって、
      // 「promote した SHA が今も live」という主張そのものではない。
      //
      // 掃きと検証は安定するまで交互に回す。**rollback 保護の内側**で行うので、ここで
      // 不受理の移動を見つけた場合はこの run が promote した分が巻き戻る。
      residualDrift = await stabilize(candidates);
      // gate を通した事実を記録する（status ではなく実績で manifest を分類するため）。
      for (const project of projects) gatesPassed.add(project.name);
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
        // 一部だけ戻して throw した場合、戻せた分はエラー側にしか残らない。
        rolledBack = rollbackError.rolledBack ?? [];
        for (const { entry, live } of rollbackError.observedLive ??
          rollbackError.movedExternally ??
          []) {
          movedAway.set(entry.project.name, { id: live.id ?? null, sha: live.sha ?? null });
        }
      } finally {
        // rollback の成否に関わらず、promote しなかった project の設定も掃く。
        reportSweepDrift((await sweepSettings()).drifted);
      }
      // rollback は promote した project しか読み直さない。それ以外の live が
      // 動いていた場合も manifest へ反映してから失敗させる。
      await refreshObservedLive({ skip: new Set(promoted.map((e) => e.project.name)) });
      throw Object.assign(failure, {
        rolledBack,
        manifest: manifestFor('failed', { promoted, rolledBack }),
      });
    }

    // promote しなかった project も掃く。pending から除外された側や、外部の promote で
    // skip した側も、その promote の副作用で設定が飛んでいることがある。
    // ループ内の復元は「窓を作らない」ため、この掃きは「取りこぼさない」ためにある。
    //
    // **判定はこの最新の掃きだけで行う。** ループ内の復元が一時的に失敗しても、ここで
    // 復元できていれば設定は正しい。過去の失敗を積み上げると、既に直っている状態で
    // release を止めて tag を打てなくする。
    if (driftedProjects.length > 0) {
      logger.log(
        `Earlier restore attempts failed for ${driftedProjects.join(', ')}; the final sweep decides.`,
      );
    }

    // production は正しい SHA を配信している。設定復元の失敗で巻き戻す理由はないが、
    // 放置すると次の merge が gate を迂回するため run は失敗させる。
    if (residualDrift.length > 0) {
      // production は正しい SHA を配信している。失敗の理由は設定の復元だけなので、
      // manifest の status を分ける。'failed' のままだと runbook の「失敗した run の
      // promoted は戻す」に従って、健全な deployment が不要に巻き戻される。
      throw Object.assign(driftError(sha, residualDrift), {
        manifest: manifestFor('settings-drift', { promoted }),
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
  })().catch(async (error) => {
    // 失敗経路。元の失敗理由を優先し、掃きの結果は報告だけにする。
    reportSweepDrift((await sweepSettings()).drifted);
    throw error;
  });

  // 成功経路。ここまでの掃きの後に外部 promote が設定を戻していることがあるため、
  // もう一度掃いて、それでも残る drift は run の失敗にする（放置すると次の merge が
  // gate を迂回する）。production は正しい SHA を配信しているので deployment は戻さない。
  // 成功経路でここに追加の掃きを置かない。**掃きの後に検証が無い構造を作らないため**
  // （掃きは設定を直せてしまうので、その間に起きた promote が失敗として現れない）。
  // 各 return 経路は stabilize（掃き + 検証を交互）か、superseded 側の明示的な掃きで
  // 既に完了している。
  return result;
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
  const movedExternally = [];
  /** 分類に関わらず「この run が置いたものでない live」を観測した記録。manifest 用。 */
  const observedLive = [];
  const drifted = [...preexistingDrift];

  for (const entry of [...promoted].reverse()) {
    if (!entry.previous?.id) {
      stranded.push(`${entry.project.name} (no previous production deployment recorded)`);
      continue;
    }

    // **外部が先に production を動かしていたら触らない。** 我々が promote した後に
    // 人が hotfix を promote した場合、ここで entry.previous を promote すると
    // その hotfix を古い deployment で上書きすることになる。rollback は
    // 「この run が置いた deployment を戻す」操作であって、production を
    // 我々の想定へ強制する操作ではない。
    //
    // 判定は「candidate でも previous でもない第三の deployment か」。previous の
    // ままなのは外部の介入ではなく **promote が反映されなかった**場合で、そこでは
    // rollback を撃つ（POST は受理済みなので後から反映されうる。観測ではなく
    // 意図した終端状態を明示する）。
    // **読めなかった時は触らない。** 失敗を「競合なし」と同一視すると、まさに守ろうと
    // している hotfix を上書きしうる。production を変更するより、人の確認へ回す。
    let live;
    try {
      live = await getLiveProduction({
        projectName: entry.project.name,
        productionDomain: entry.project.productionDomain,
        projectId: entry.projectId,
        token,
        teamId,
        fetchImpl,
      });
    } catch {
      stranded.push(`${entry.project.name} -> ${entry.previous.id} (live deployment unreadable)`);
      continue;
    }

    // **alias 未割当（live=null）も「他者が意図的に外した」状態として扱う。** ここで
    // previous を promote すると、人が意図して切り離した domain に traffic を戻して
    // しまう。release run にその判断の権限は無い。
    const isKnown = live && (live.id === entry.deployment.id || live.id === entry.previous.id);
    if (!isKnown) {
      const observedState = live ?? { id: null, sha: null };
      movedExternally.push({ entry, live: observedState });
      observedLive.push({ entry, live: observedState });
      logger.log(
        `${entry.project.name}: production is on ${observedState.id ?? 'no deployment'}; leaving it alone`,
      );
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

      // **受理が不確かな promote では「previous のままだった」は戻った証拠にならない。**
      // POST が届いていた場合、alias の変化は非同期に遅れて現れる。assignment の確認は
      // previous が一度も live を外れていなければ即座に通ってしまうので、猶予を置いて
      // 見直す。ここで target が現れたら、run 終了後に着地するのと同じ状態なので
      // 手動確認へ回す。
      if (entry.ambiguous) {
        const deadline = nowImpl() + AMBIGUOUS_SETTLE_MS;
        let landed = null; // 我々の candidate が遅れて着地した
        let foreign = null; // 第三の deployment / alias 未割当
        let last = null; // 窓の中で最後に読めた状態
        let observed = false;
        while (nowImpl() < deadline) {
          await sleepImpl(ASSIGN_POLL_MS);
          let settled;
          try {
            settled = await getLiveProduction({
              projectName: entry.project.name,
              productionDomain: entry.project.productionDomain,
              projectId: entry.projectId,
              token,
              teamId,
              fetchImpl,
            });
          } catch {
            continue; // 読めない回で判断しない。窓の残りで見直す
          }
          observed = true;
          // **どの観測でも打ち切らない。** 受理済みの promote も rollback の POST も
          // 非同期に着地するので、途中の状態で分類すると誤った手動操作を促す。
          // 窓の最後まで見て、最後に読めた状態だけで判断する。
          last = settled ?? { id: null, sha: null };
        }

        if (last) {
          if (last.id === entry.deployment.id) landed = last;
          else if (last.id !== entry.previous.id) foreign = last;
        }

        // 自分の candidate は manifest に記録しない（`moved-externally` になると
        // runbook が「戻さない」と案内するのに、エラーは MANUAL ROLLBACK REQUIRED を
        // 出す矛盾になる）。第三の deployment と alias 未割当だけを載せる。
        if (foreign) observedLive.push({ entry, live: foreign });

        // 窓の間 1 度も読めなかった場合、「previous のままだった」は観測に基づかない。
        // 読めない間に遅れた promote が着地していても分からないので、戻ったと宣言しない。
        if (!observed) {
          stranded.push(
            `${entry.project.name} -> ${entry.previous.id} ` +
              `(live deployment unreadable throughout the settle window)`,
          );
          continue;
        }

        // 自分の promote が着地していたら手動確認へ。窓の最後まで見た上での判断なので、
        // 第三の deployment より優先する（後から上書きしているため）。
        if (landed) {
          stranded.push(
            `${entry.project.name} -> ${entry.previous.id} (a delayed promote landed on ${landed.id})`,
          );
          continue;
        }

        // 窓の終わりに残っていたのが他者の選択（典型は緊急 hotfix）や未割当なら、
        // 戻すと上書きになるので触らず名指しする。
        if (foreign) {
          movedExternally.push({ entry, live: foreign });
          logger.log(
            `${entry.project.name}: production moved to ${foreign.id ?? 'no deployment'} during the settle window; leaving it alone`,
          );
          continue;
        }
      }

      logger.log(`${entry.project.name}: rolled back to ${entry.previous.id}`);
      rolledBack.push(entry);
    } catch {
      stranded.push(`${entry.project.name} -> ${entry.previous.id}`);
    }
  }

  if (
    stranded.length > 0 ||
    drifted.length > 0 ||
    preexistingSplit.length > 0 ||
    movedExternally.length > 0
  ) {
    const lines = [`Rollback after "${cause.message}" did not fully clean up.`];
    if (stranded.length > 0) {
      lines.push(`MANUAL ROLLBACK REQUIRED. Point production back to: ${stranded.join('; ')}`);
    }
    if (movedExternally.length > 0) {
      const detail = movedExternally
        .map(({ entry, live }) => `${entry.project.name} (now ${live.id})`)
        .join('; ');
      lines.push(
        `Left alone because another actor moved production first: ${detail}. ` +
          `Confirm that deployment is the intended one.`,
      );
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
    // rolledBack / movedExternally も載せる。ここで throw すると呼び出し側の代入が
    // 完了せず、戻し済みや他者が動かした分まで「我々の候補を配信中」として
    // manifest に載ってしまう（runbook はその manifest を復旧の一次情報にする）。
    throw Object.assign(new ReleaseError(lines.join(' '), { manualRollback: stranded }), {
      rolledBack,
      movedExternally,
      observedLive,
    });
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
