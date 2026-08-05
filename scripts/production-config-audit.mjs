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

// project metadata（env とは別の `GET /v9/projects/{idOrName}` エンドポイント）で監査する
// 契約。フィールド名は Vercel の公開 OpenAPI スペック（https://openapi.vercel.sh）で確認した
// ものを使う（#1817 Phase 4）。`rootDirectory` は Vercel dashboard 側の Root Directory 設定
// — vercel.json の `ignoreCommand`（`node ../../scripts/ci/impact.mjs --vercel <project>`）は
// build container の cwd がこの値になる前提で相対 path を組んでいるため、drift すると
// ignoreCommand 自体が壊れる（docs/projects/ci-monorepo-refactor/overview.md §8）。
const PROJECT_METADATA_CONTRACTS = {
  product: { rootDirectory: 'apps/product' },
  web: { rootDirectory: 'apps/web' },
};

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

/**
 * project 設定を監査する（env とは別の `GET /v9/projects/{idOrName}` 応答）。
 *
 * - `rootDirectory` — vercel.json の `ignoreCommand` が相対 path で
 *   `scripts/ci/impact.mjs` を呼ぶ前提になっている（Root Directory が cwd になる）。
 *   drift すると ignoreCommand 自体が壊れる
 * - `autoAssignCustomDomains` — production-release.mjs の promote が一時的に書き換えて
 *   戻す設定。常時 false が前提（release フローの事前条件）
 * - `commandForIgnoringBuildStep`（OpenAPI: nullable string） — dashboard 側の Ignored
 *   Build Step コマンド。vercel.json の `ignoreCommand` が正本なので、dashboard 側に
 *   別コマンドが設定されていたら drift（vercel.json を上書きしてしまう）
 * - `enableAffectedProjectsDeployments`（OpenAPI boolean。dashboard 表記は
 *   "Skip deployments (no changes to root directory)"） — workspace 依存グラフを見ない
 *   自動 skip で、`ignoreCommand`（依存グラフを見る）と競合するため常時 false が前提
 *   （docs/projects/ci-monorepo-refactor/overview.md §8 補足）
 *
 * fail closed: フィールドが応答に存在しない場合も failure とする（`commandForIgnoringBuildStep`
 * だけは nullable が仕様なので、キーが無い/null のどちらも compliant として扱う）。
 * 値そのものは出力しない（既存方針: metadata のみ、secret 値は取得・出力しない）。
 */
export function auditProjectSettings(projectName, project) {
  const contract = PROJECT_METADATA_CONTRACTS[projectName];
  if (!contract) throw new Error(`Unknown Vercel project contract: ${projectName}`);

  const errors = [];
  if (!project || typeof project !== 'object') {
    errors.push(`${projectName}: project metadata response is invalid`);
    return errors;
  }

  if (!('rootDirectory' in project)) {
    errors.push(`${projectName}: rootDirectory is missing from project metadata`);
  } else if (project.rootDirectory !== contract.rootDirectory) {
    errors.push(`${projectName}: rootDirectory must be "${contract.rootDirectory}"`);
  }

  if (!('autoAssignCustomDomains' in project)) {
    errors.push(`${projectName}: autoAssignCustomDomains is missing from project metadata`);
  } else if (project.autoAssignCustomDomains !== false) {
    errors.push(`${projectName}: autoAssignCustomDomains must be false`);
  }

  if ('commandForIgnoringBuildStep' in project && project.commandForIgnoringBuildStep != null) {
    errors.push(
      `${projectName}: commandForIgnoringBuildStep must be null/unset — vercel.json ignoreCommand is the source of truth`,
    );
  }

  if (!('enableAffectedProjectsDeployments' in project)) {
    errors.push(
      `${projectName}: enableAffectedProjectsDeployments is missing from project metadata`,
    );
  } else if (project.enableAffectedProjectsDeployments !== false) {
    errors.push(
      `${projectName}: enableAffectedProjectsDeployments ("Skip deployments") must be disabled — it ignores the workspace dependency graph and conflicts with vercel.json ignoreCommand`,
    );
  }

  return errors;
}

async function fetchProjectSettings(projectName, token, teamId, fetchImpl) {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`);
  url.searchParams.set('teamId', teamId);

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Vercel project metadata request failed for project: ${projectName}`);
  }
  return response.json();
}

/**
 * `checkProjectSettings` は既定 true（standalone の Production Config Audit workflow・
 * CLI 実行はこちら）。production-release.mjs は同じ関数を release 経路の gate として
 * **`checkProjectSettings: false`** で呼ぶ。理由: `autoAssignCustomDomains` は release 中
 * に一時的に true へ戻りうる（Vercel の promote endpoint の既知挙動 vercel/vercel#15095。
 * production-release.mjs 側は sweep/stabilize でこれを自前管理し、gate 実行中に外部
 * promote が起きて再び true になっても finally で掃き直す設計）。project 設定監査
 * （rootDirectory / commandForIgnoringBuildStep / enableAffectedProjectsDeployments /
 * autoAssignCustomDomains）は「定常状態の drift 検出」が目的の静的チェックで、release
 * 実行中の一時的な状態と衝突する。release 側の gate は従来どおり env metadata のみを見る。
 */
export async function runProductionConfigAudit({
  token,
  teamId,
  fetchImpl = fetch,
  checkProjectSettings = true,
}) {
  if (!token) throw new Error('VERCEL_TOKEN is required for Production Config Audit');
  if (!teamId) throw new Error('VERCEL_TEAM_ID is required for Production Config Audit');

  const allErrors = [];
  for (const projectName of Object.keys(PROJECT_CONTRACTS)) {
    const response = await fetchProjectMetadata(projectName, token, teamId, fetchImpl);
    allErrors.push(...auditProjectMetadata(projectName, response));

    if (checkProjectSettings) {
      const settings = await fetchProjectSettings(projectName, token, teamId, fetchImpl);
      allErrors.push(...auditProjectSettings(projectName, settings));
    }
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
