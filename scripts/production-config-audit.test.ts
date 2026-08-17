import { describe, expect, it, vi } from 'vitest';

import {
  auditProjectMetadata,
  auditProjectSettings,
  evaluateProductionDeploymentHealth,
  runProductionConfigAudit,
  runProductionDeployHealthCheck,
} from './production-config-audit.mjs';

function productionEntry(key: string, type = 'plain') {
  return { key, target: ['production'], type, value: `must-not-appear-${key}` };
}

function completeProductMetadata() {
  return {
    envs: [
      productionEntry('RESEND_API_KEY', 'sensitive'),
      productionEntry('RESEND_FROM_EMAIL'),
      productionEntry('RESEND_WEBHOOK_SECRET', 'sensitive'),
      productionEntry('NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
      productionEntry('UPSTASH_REDIS_REST_URL'),
      productionEntry('UPSTASH_REDIS_REST_TOKEN', 'sensitive'),
      productionEntry('RECOVERY_CODE_PEPPER', 'sensitive'),
    ],
  };
}

function completeWebMetadata() {
  return {
    envs: [
      productionEntry('RESEND_API_KEY', 'sensitive'),
      productionEntry('RESEND_FROM_EMAIL'),
      productionEntry('RESEND_WEBHOOK_SECRET', 'sensitive'),
      productionEntry('NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
      productionEntry('TURNSTILE_SECRET_KEY', 'sensitive'),
      productionEntry('UPSTASH_REDIS_REST_URL'),
      productionEntry('UPSTASH_REDIS_REST_TOKEN', 'sensitive'),
    ],
  };
}

function compliantProductSettings() {
  return {
    rootDirectory: 'apps/product',
    autoAssignCustomDomains: false,
    commandForIgnoringBuildStep: null,
    enableAffectedProjectsDeployments: false,
    resourceConfig: { functionDefaultTimeout: 60 },
  };
}

function compliantWebSettings() {
  return {
    rootDirectory: 'apps/web',
    autoAssignCustomDomains: false,
    commandForIgnoringBuildStep: null,
    enableAffectedProjectsDeployments: false,
    resourceConfig: { functionDefaultTimeout: 60 },
  };
}

describe('Production Config Audit', () => {
  it('accepts complete metadata-only Product and Web contracts', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json(completeProductMetadata()))
      .mockResolvedValueOnce(Response.json(compliantProductSettings()))
      .mockResolvedValueOnce(Response.json(completeWebMetadata()))
      .mockResolvedValueOnce(Response.json(compliantWebSettings()));

    await expect(
      runProductionConfigAudit({ token: 'token', teamId: 'team', fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('decrypt');
  });

  it('fails for missing Production keys, wrong secret types, or non-Production credentials', () => {
    const metadata = completeProductMetadata();
    metadata.envs = metadata.envs.filter((entry) => entry.key !== 'RESEND_FROM_EMAIL');
    metadata.envs.push({
      key: 'RESEND_API_KEY',
      target: ['preview'],
      type: 'encrypted',
      value: 'private-preview-value',
    });
    const apiKey = metadata.envs.find((entry) => entry.key === 'RESEND_API_KEY');
    if (apiKey) apiKey.type = 'encrypted';

    const errors = auditProjectMetadata('product', metadata);

    expect(errors).toContain('product: RESEND_FROM_EMAIL is missing from Production');
    expect(errors).toContain(
      'product: RESEND_API_KEY must use Vercel sensitive type in Production',
    );
    expect(errors).toContain('product: RESEND_API_KEY must not target preview');
    expect(JSON.stringify(errors)).not.toContain('private-preview-value');
  });

  it('rejects the legacy contact credentials in any environment', () => {
    const metadata = completeProductMetadata();
    metadata.envs.push(productionEntry('GITHUB_TOKEN', 'sensitive'));
    metadata.envs.push({
      key: 'GITHUB_CONTACT_REPO',
      target: ['preview'],
      type: 'plain',
      value: 'must-not-appear',
    });

    const errors = auditProjectMetadata('product', metadata);

    expect(errors).toContain('product: legacy GITHUB_TOKEN must not be configured');
    expect(errors).toContain('product: legacy GITHUB_CONTACT_REPO must not be configured');
  });

  it('accepts metadata that no longer carries the legacy contact credentials', () => {
    expect(auditProjectMetadata('product', completeProductMetadata())).toEqual([]);
  });
});

describe('Production Config Audit — project settings (rootDirectory / autoAssignCustomDomains / Ignored Build Step / Default Function Timeout)', () => {
  it('accepts a fully compliant project (Phase 4 defaults)', () => {
    expect(auditProjectSettings('product', compliantProductSettings())).toEqual([]);
    expect(auditProjectSettings('web', compliantWebSettings())).toEqual([]);
  });

  it('accepts commandForIgnoringBuildStep being entirely absent from the response', () => {
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.commandForIgnoringBuildStep;
    expect(auditProjectSettings('product', settings)).toEqual([]);
  });

  it('fails closed when rootDirectory drifts from the vercel.json ignoreCommand contract', () => {
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      rootDirectory: 'apps/web',
    });
    expect(errors).toContain('product: rootDirectory must be "apps/product"');
  });

  it('fails closed when rootDirectory is missing from the response', () => {
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.rootDirectory;
    expect(auditProjectSettings('product', settings)).toContain(
      'product: rootDirectory is missing from project metadata',
    );
  });

  it('fails when autoAssignCustomDomains is not false', () => {
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      autoAssignCustomDomains: true,
    });
    expect(errors).toContain('product: autoAssignCustomDomains must be false');
  });

  it('fails closed when autoAssignCustomDomains is missing from the response', () => {
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.autoAssignCustomDomains;
    expect(auditProjectSettings('product', settings)).toContain(
      'product: autoAssignCustomDomains is missing from project metadata',
    );
  });

  it('fails when a dashboard Ignored Build Step command drifts from vercel.json ignoreCommand', () => {
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      commandForIgnoringBuildStep: 'exit 0',
    });
    expect(errors).toContain(
      'product: commandForIgnoringBuildStep must be null/unset — vercel.json ignoreCommand is the source of truth',
    );
  });

  it('fails when enableAffectedProjectsDeployments ("Skip deployments") is enabled', () => {
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      enableAffectedProjectsDeployments: true,
    });
    expect(errors).toContain(
      'product: enableAffectedProjectsDeployments ("Skip deployments") must be disabled — it ignores the workspace dependency graph and conflicts with vercel.json ignoreCommand',
    );
  });

  it('treats a missing enableAffectedProjectsDeployments as compliant (toggle never touched)', () => {
    // トグルを一度も操作していない project では応答にこのフィールド自体が現れない
    // （2026-08-05 の trusted dispatch で web が該当することを実測）。不在 = 無効。
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.enableAffectedProjectsDeployments;
    expect(auditProjectSettings('product', settings)).toEqual([]);
  });

  it('fails when sourceFilesOutsideRootDirectory is disabled', () => {
    // false だと root 外の scripts/ が build container に無く、ignoreCommand が毎回
    // exit 非 0 = fail open になり skip が静かに全滅する（PR #1835 Codex P2）。
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      sourceFilesOutsideRootDirectory: false,
    });
    expect(errors).toContain(
      'product: sourceFilesOutsideRootDirectory ("Include source files outside of the Root Directory") must stay enabled — the vercel.json ignoreCommand runs scripts/ci/impact.mjs from outside the Root Directory',
    );
  });

  it('treats a missing sourceFilesOutsideRootDirectory as compliant (default is enabled)', () => {
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.sourceFilesOutsideRootDirectory;
    expect(auditProjectSettings('product', settings)).toEqual([]);
  });

  it('fails when resourceConfig.functionDefaultTimeout drifts from the 60s flip', () => {
    const errors = auditProjectSettings('product', {
      ...compliantProductSettings(),
      resourceConfig: { functionDefaultTimeout: 300 },
    });
    expect(errors).toContain('product: resourceConfig.functionDefaultTimeout must be 60');
  });

  it('fails closed when resourceConfig.functionDefaultTimeout is missing from resourceConfig', () => {
    const settings = compliantProductSettings();
    settings.resourceConfig = {} as { functionDefaultTimeout: number };
    expect(auditProjectSettings('product', settings)).toContain(
      'product: resourceConfig.functionDefaultTimeout is missing from project metadata',
    );
  });

  it('fails closed when resourceConfig itself is missing from the response', () => {
    const settings = compliantProductSettings() as Record<string, unknown>;
    delete settings.resourceConfig;
    expect(auditProjectSettings('product', settings)).toContain(
      'product: resourceConfig.functionDefaultTimeout is missing from project metadata',
    );
  });

  it('fails closed when the response is not an object', () => {
    expect(auditProjectSettings('product', null)).toEqual([
      'product: project metadata response is invalid',
    ]);
  });

  it('throws for an unknown project name', () => {
    expect(() => auditProjectSettings('storybook', compliantProductSettings())).toThrow(
      'Unknown Vercel project contract: storybook',
    );
  });
});

describe('Production Deploy Health (#2124)', () => {
  const SHA = 'b560f84d6b6e5b2f6e5b2f6e5b2f6e5b2f6e5b2f';
  const NOW = 1_755_400_000_000; // 固定基準時刻

  function deployment(overrides: Record<string, unknown> = {}) {
    return {
      uid: 'dpl_1',
      created: NOW - 5 * 60 * 1000,
      state: 'READY',
      meta: { githubCommitSha: SHA },
      ...overrides,
    };
  }

  it('passes when the latest deployment is READY', () => {
    const result = evaluateProductionDeploymentHealth({ deployments: [deployment()], nowMs: NOW });
    expect(result).toEqual({ ok: true, reason: expect.stringContaining('READY') });
  });

  it('fails when the latest deployment is ERROR, even freshly created', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ state: 'ERROR', created: NOW - 1000 })],
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ERROR');
  });

  it('fails when the latest deployment is CANCELED', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ state: 'CANCELED', created: NOW })],
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('CANCELED');
  });

  it('fails closed when no production deployments exist at all (never skip)', () => {
    // ignoreCommand によるスキップは「前回の READY デプロイがそのまま最新として残る」
    // だけで deployments 配列自体が空にはならない。空配列は fetch/project 設定の異常。
    const result = evaluateProductionDeploymentHealth({ deployments: [], nowMs: NOW });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('no production deployments found');
  });

  it('does not fail when the latest deployment is old (ignoreCommand skip is healthy, not stale)', () => {
    // web を触らない merge のたびに web 側だけ「最新デプロイが古い main HEAD 用」に
    // なるのは ignoreCommand の意図的スキップであり、異常ではない。SHA 一致もタイム
    // スタンプの新しさも判定条件にしない。
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ created: NOW - 5 * 24 * 60 * 60 * 1000 })], // 5日前
      nowMs: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('tolerates an in-progress (BUILDING) deployment within the grace period', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ state: 'BUILDING', created: NOW - 5 * 60 * 1000 })],
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: true, reason: expect.stringContaining('BUILDING') });
  });

  it('fails when a deployment is stuck BUILDING beyond the grace period', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ state: 'BUILDING', created: NOW - 40 * 60 * 1000 })],
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('stuck');
  });

  it('picks the newest deployment when several exist', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [
        deployment({ uid: 'dpl_old', state: 'ERROR', created: NOW - 10 * 60 * 1000 }),
        deployment({ uid: 'dpl_new', state: 'READY', created: NOW - 2 * 60 * 1000 }),
      ],
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: true, reason: expect.stringContaining('READY') });
  });

  it('reads readyState as a fallback when state is absent', () => {
    const result = evaluateProductionDeploymentHealth({
      deployments: [deployment({ state: undefined, readyState: 'ERROR' })],
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ERROR');
  });

  it('fails closed when the deployments response is not an array', () => {
    const result = evaluateProductionDeploymentHealth({ deployments: null, nowMs: NOW });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('invalid');
  });

  it('runProductionDeployHealthCheck resolves when both projects are READY', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ deployments: [deployment()] }))
      .mockResolvedValueOnce(Response.json({ deployments: [deployment()] }));

    await expect(
      runProductionDeployHealthCheck({ token: 'token', teamId: 'team', fetchImpl, nowMs: NOW }),
    ).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('target=production');
  });

  it('runProductionDeployHealthCheck rejects when any project is unhealthy', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ deployments: [deployment({ state: 'ERROR' })] }))
      .mockResolvedValueOnce(Response.json({ deployments: [deployment()] }));

    await expect(
      runProductionDeployHealthCheck({ token: 'token', teamId: 'team', fetchImpl, nowMs: NOW }),
    ).rejects.toThrow('product');
  });

  it('throws for missing token or teamId', async () => {
    const fetchImpl = vi.fn();
    await expect(
      // @ts-expect-error 実行時ガードを検証するため意図的に token を省略する
      runProductionDeployHealthCheck({ teamId: 'team', fetchImpl }),
    ).rejects.toThrow('VERCEL_TOKEN');
    await expect(
      // @ts-expect-error 実行時ガードを検証するため意図的に teamId を省略する
      runProductionDeployHealthCheck({ token: 'token', fetchImpl }),
    ).rejects.toThrow('VERCEL_TEAM_ID');
  });
});
