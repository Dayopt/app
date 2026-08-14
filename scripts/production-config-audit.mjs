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
// ignoreCommand 自体が壊れる（docs/projects/_archive/ci-monorepo-refactor/overview.md §8）。
const PROJECT_METADATA_CONTRACTS = {
  product: { rootDirectory: 'apps/product', functionDefaultTimeout: 60 },
  web: { rootDirectory: 'apps/web', functionDefaultTimeout: 60 },
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
 *   （docs/projects/_archive/ci-monorepo-refactor/overview.md §8 補足）
 * - `resourceConfig.functionDefaultTimeout`（dashboard 表記は Functions タブの
 *   "Default Max Duration"） — 契約表に載らない経路（dynamic page の SSR、Server Action、
 *   ISR 再生成）が継承する Default Function Timeout。300 秒のままだと `/api/trpc/[trpc]` の
 *   意図的な 300 秒設定（tRPC だけ 300 の理由は infra.md §Function 実行時間の上限 参照）と
 *   区別が付かず drift を検知できないため、60 への flip 後にだけ pin できる（#1966）。
 *   フィールドは `GetProjectResponseBody` のトップレベルではなく `resourceConfig` object
 *   配下（`vercel/sdk` の `getprojectsresponsebodyresourceconfig.md` で確認、2026-08-14）。
 *   Vercel Dashboard の実測値（product / web とも 60）と一致することを同日 Functions タブ
 *   目視で確認済み
 *
 * fail closed: `rootDirectory` / `autoAssignCustomDomains` / `resourceConfig.
 * functionDefaultTimeout` は応答に存在しない場合も failure とする。
 * `commandForIgnoringBuildStep`（nullable が仕様）と `enableAffectedProjectsDeployments`
 * （トグル未操作の project では応答に現れないことを 2026-08-05 の trusted dispatch で実測）は、
 * キーが無い状態を compliant として扱う。値そのものは出力しない（既存方針: metadata のみ、
 * secret 値は取得・出力しない）。
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

  if (
    !project.resourceConfig ||
    typeof project.resourceConfig !== 'object' ||
    !('functionDefaultTimeout' in project.resourceConfig)
  ) {
    errors.push(
      `${projectName}: resourceConfig.functionDefaultTimeout is missing from project metadata`,
    );
  } else if (project.resourceConfig.functionDefaultTimeout !== contract.functionDefaultTimeout) {
    errors.push(
      `${projectName}: resourceConfig.functionDefaultTimeout must be ${contract.functionDefaultTimeout}`,
    );
  }

  if ('commandForIgnoringBuildStep' in project && project.commandForIgnoringBuildStep != null) {
    errors.push(
      `${projectName}: commandForIgnoringBuildStep must be null/unset — vercel.json ignoreCommand is the source of truth`,
    );
  }

  // このフィールドは他と違い「トグルを一度も操作していない project では応答に現れない」
  // ことを 2026-08-05 の trusted dispatch で実測した（web が該当）。不在 = 未設定 =
  // 無効と同義なので compliant として扱う。fail closed を緩めるのは意図的で、
  // 「有効(true)だけを drift とする」以上に厳しくすると未操作 project が恒久 failure になる。
  if (
    project.enableAffectedProjectsDeployments !== undefined &&
    project.enableAffectedProjectsDeployments !== false
  ) {
    errors.push(
      `${projectName}: enableAffectedProjectsDeployments ("Skip deployments") must be disabled — it ignores the workspace dependency graph and conflicts with vercel.json ignoreCommand`,
    );
  }

  // "Include source files outside of the Root Directory in the Build Step"。false に drift
  // すると root 外の scripts/ が build container から消え、ignoreCommand（../../scripts/ci/
  // impact.mjs）が毎回 module not found で exit 非 0 = fail open になり、skip が静かに全滅
  // する（PR #1835 Codex P2）。既定は有効なので、不在は compliant・false のみ drift とする
  // （enableAffectedProjectsDeployments と同じ「未操作トグルは応答に現れない」前提）。
  if (
    project.sourceFilesOutsideRootDirectory !== undefined &&
    project.sourceFilesOutsideRootDirectory !== true
  ) {
    errors.push(
      `${projectName}: sourceFilesOutsideRootDirectory ("Include source files outside of the Root Directory") must stay enabled — the vercel.json ignoreCommand runs scripts/ci/impact.mjs from outside the Root Directory`,
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
