import { describe, expect, it, vi } from 'vitest';

import { auditProjectMetadata, runProductionConfigAudit } from './production-config-audit.mjs';

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

describe('Production Config Audit', () => {
  it('accepts complete metadata-only Product and Web contracts', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json(completeProductMetadata()))
      .mockResolvedValueOnce(Response.json(completeWebMetadata()));

    await expect(
      runProductionConfigAudit({ token: 'token', teamId: 'team', fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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

  it('defers legacy GitHub env removal until the post-smoke flag is enabled', () => {
    const metadata = completeProductMetadata();
    metadata.envs.push(productionEntry('GITHUB_TOKEN', 'sensitive'));

    expect(auditProjectMetadata('product', metadata)).toEqual([]);
    expect(auditProjectMetadata('product', metadata, { forbidLegacyContactEnv: true })).toContain(
      'product: legacy GITHUB_TOKEN must be removed after contact smoke',
    );
  });
});
