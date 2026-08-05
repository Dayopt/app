import { describe, expect, it, vi } from 'vitest';

import {
  auditProjectMetadata,
  auditProjectSettings,
  runProductionConfigAudit,
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
      productionEntry('UPSTASH_REDIS_REST_URL'),
      productionEntry('UPSTASH_REDIS_REST_TOKEN', 'sensitive'),
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
  };
}

function compliantWebSettings() {
  return {
    rootDirectory: 'apps/web',
    autoAssignCustomDomains: false,
    commandForIgnoringBuildStep: null,
    enableAffectedProjectsDeployments: false,
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

describe('Production Config Audit — project settings (rootDirectory / autoAssignCustomDomains / Ignored Build Step)', () => {
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
