import { describe, expect, it, vi } from 'vitest';

import {
  findDeploymentForSha,
  runProductionRelease,
  smokeDeployment,
  waitForReadyCandidates,
} from './production-release.mjs';

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
const TOKEN = 'vercel-token-must-not-appear';
const BYPASS = 'bypass-secret-must-not-appear';

type Deployment = {
  uid: string;
  url: string;
  readyState: string;
  created: number;
  meta: { githubCommitSha: string };
};

function deployment(uid: string, sha: string, readyState = 'READY', created = 2000): Deployment {
  return { uid, url: `${uid}.vercel.app`, readyState, created, meta: { githubCommitSha: sha } };
}

function projectTarget(id: string, sha: string, createdAt = 1000) {
  return { targets: { production: { id, createdAt, meta: { githubCommitSha: sha } } } };
}

const noop = { log: () => {} };
const noSleep = () => Promise.resolve();

/**
 * URL ごとに応答を返す fetch mock。呼び出し履歴を calls に記録する。
 */
function createVercelMock(handlers: Record<string, () => unknown>) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });

    const key = Object.keys(handlers).find((pattern) => url.includes(pattern));
    if (!key) throw new Error(`Unhandled request: ${url}`);
    return Response.json(handlers[key]!());
  });
  return { fetchImpl, calls };
}

/** production env 契約を満たす metadata（audit を通過させるため） */
function auditMetadata(project: 'product' | 'web') {
  const sensitive = (key: string) => ({ key, target: ['production'], type: 'sensitive' });
  const plain = (key: string) => ({ key, target: ['production'], type: 'plain' });
  const shared = [
    sensitive('RESEND_API_KEY'),
    plain('RESEND_FROM_EMAIL'),
    sensitive('RESEND_WEBHOOK_SECRET'),
    plain('UPSTASH_REDIS_REST_URL'),
    sensitive('UPSTASH_REDIS_REST_TOKEN'),
  ];
  return {
    envs:
      project === 'web'
        ? [...shared, plain('NEXT_PUBLIC_TURNSTILE_SITE_KEY'), sensitive('TURNSTILE_SECRET_KEY')]
        : shared,
  };
}

/**
 * 両 project が candidate を持つ既定シナリオ。
 * production target は promote が成功するたびに進む。
 */
function createReleaseWorld(options: { productionSha?: string } = {}) {
  const production = {
    web: { id: 'dpl_web_old', sha: options.productionSha ?? OLD_SHA, createdAt: 1000 },
    product: { id: 'dpl_product_old', sha: options.productionSha ?? OLD_SHA, createdAt: 1000 },
  };
  const candidates = {
    web: deployment('dpl_web_new', SHA),
    product: deployment('dpl_product_new', SHA),
  };
  const promoteCalls: string[] = [];
  const rollbackCalls: string[] = [];

  const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const project = url.includes('web') ? 'web' : 'product';

    if (!url.startsWith('https://api.vercel.com')) {
      return new Response(null, { status: 200 });
    }
    if (method === 'POST' && url.includes('/promote/')) {
      promoteCalls.push(project);
      production[project] = {
        ...candidates[project],
        id: candidates[project].uid,
        createdAt: 2000,
      };
      return Response.json({});
    }
    if (method === 'POST' && url.includes('/rollback/')) {
      rollbackCalls.push(project);
      production[project] = { id: 'dpl_' + project + '_old', sha: OLD_SHA, createdAt: 1000 };
      return Response.json({});
    }
    if (url.includes('/v6/deployments')) {
      return Response.json({ deployments: [candidates[project]] });
    }
    if (url.includes('/env')) {
      return Response.json(auditMetadata(project));
    }
    if (url.includes('/v9/projects/')) {
      const current = production[project];
      return Response.json({
        targets: {
          production: {
            id: current.id,
            createdAt: current.createdAt,
            meta: { githubCommitSha: current.sha },
          },
        },
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  return { fetchImpl, promoteCalls, rollbackCalls, production };
}

function release(overrides: Record<string, unknown> = {}) {
  return runProductionRelease({
    sha: SHA,
    token: TOKEN,
    teamId: 'team',
    sleepImpl: noSleep,
    nowImpl: () => 0,
    logger: noop,
    bypassSecrets: { web: BYPASS, product: BYPASS },
    ...overrides,
  });
}

describe('findDeploymentForSha', () => {
  it('returns only the deployment whose commit SHA matches', async () => {
    const { fetchImpl } = createVercelMock({
      '/v6/deployments': () => ({
        deployments: [deployment('dpl_other', OLD_SHA), deployment('dpl_match', SHA)],
      }),
    });

    const found = await findDeploymentForSha({
      projectName: 'web',
      sha: SHA,
      token: TOKEN,
      teamId: 'team',
      fetchImpl,
    });

    expect(found?.id).toBe('dpl_match');
  });

  it('returns null when no deployment exists for the SHA', async () => {
    const { fetchImpl } = createVercelMock({
      '/v6/deployments': () => ({ deployments: [deployment('dpl_other', OLD_SHA)] }),
    });

    await expect(
      findDeploymentForSha({
        projectName: 'web',
        sha: SHA,
        token: TOKEN,
        teamId: 'team',
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });
});

describe('waitForReadyCandidates', () => {
  const projects = [{ name: 'web' }, { name: 'product' }];

  it('resolves once every project reports READY', async () => {
    let round = 0;
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const project = String(input).includes('web') ? 'web' : 'product';
      round += 1;
      const state = project === 'web' || round > 2 ? 'READY' : 'BUILDING';
      return Response.json({ deployments: [deployment(`dpl_${project}`, SHA, state)] });
    });

    const ready = await waitForReadyCandidates({
      projects,
      sha: SHA,
      token: TOKEN,
      teamId: 'team',
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => 0,
      logger: noop,
    });

    expect(ready.map((entry) => entry.deployment.id)).toEqual(['dpl_web', 'dpl_product']);
  });

  it('fails fast when a build ends in ERROR', async () => {
    const { fetchImpl } = createVercelMock({
      '/v6/deployments': () => ({ deployments: [deployment('dpl_web', SHA, 'ERROR')] }),
    });

    await expect(
      waitForReadyCandidates({
        projects,
        sha: SHA,
        token: TOKEN,
        teamId: 'team',
        fetchImpl,
        sleepImpl: noSleep,
        nowImpl: () => 0,
        logger: noop,
      }),
    ).rejects.toThrow(/ended in ERROR/);
  });

  it('times out when a candidate never becomes READY', async () => {
    const { fetchImpl } = createVercelMock({
      '/v6/deployments': () => ({ deployments: [deployment('dpl_web', SHA, 'BUILDING')] }),
    });
    let clock = 0;

    await expect(
      waitForReadyCandidates({
        projects,
        sha: SHA,
        token: TOKEN,
        teamId: 'team',
        fetchImpl,
        sleepImpl: noSleep,
        nowImpl: () => (clock += 60_000),
        logger: noop,
        timeoutMs: 120_000,
      }),
    ).rejects.toThrow(/Timed out waiting for READY/);
  });
});

describe('smokeDeployment', () => {
  it('sends the bypass header only when a secret is configured', async () => {
    const withSecret = vi.fn(async () => new Response(null, { status: 200 }));
    await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      paths: ['/'],
      bypassSecret: BYPASS,
      fetchImpl: withSecret,
      sleepImpl: noSleep,
      logger: noop,
    });
    expect(withSecret.mock.calls[0]?.[1]?.headers).toHaveProperty('x-vercel-protection-bypass');

    const withoutSecret = vi.fn(async () => new Response(null, { status: 200 }));
    await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      paths: ['/'],
      bypassSecret: undefined,
      fetchImpl: withoutSecret,
      sleepImpl: noSleep,
      logger: noop,
    });
    expect(withoutSecret.mock.calls[0]?.[1]?.headers).toEqual({});
  });

  it('reports a missing Protection Bypass instead of retrying the SSO redirect', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://vercel.com/sso-api?url=x' },
        }),
    );

    await expect(
      smokeDeployment({
        projectName: 'web',
        deploymentUrl: 'dpl.vercel.app',
        paths: ['/'],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).rejects.toThrow(/Protection Bypass for Automation/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and never leaks the bypass secret or response body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('internal detail', { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(
      smokeDeployment({
        projectName: 'web',
        deploymentUrl: 'dpl.vercel.app',
        paths: ['/'],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => new Response('internal detail', { status: 503 }));
    const error = await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      paths: ['/api/health'],
      bypassSecret: BYPASS,
      fetchImpl: failing,
      sleepImpl: noSleep,
      logger: noop,
    }).catch((thrown: Error) => thrown);

    expect(error.message).toContain('503');
    expect(error.message).not.toContain(BYPASS);
    expect(error.message).not.toContain('internal detail');
  });
});

describe('runProductionRelease', () => {
  it('rejects a SHA that is not a full commit hash', async () => {
    await expect(release({ sha: 'main' })).rejects.toThrow(/40 character commit SHA/);
  });

  it('is a no-op when both projects already serve the SHA', async () => {
    const { fetchImpl, promoteCalls } = createReleaseWorld({ productionSha: SHA });

    await expect(release({ fetchImpl })).resolves.toMatchObject({ status: 'already-released' });
    expect(promoteCalls).toEqual([]);
  });

  it('skips promote when a newer production deployment already exists', async () => {
    const { fetchImpl } = createVercelMock({
      '/v6/deployments': () => ({ deployments: [deployment('dpl_new', SHA, 'READY', 1000)] }),
      '/v9/projects/': () => projectTarget('dpl_newer', OLD_SHA, 5000),
    });

    await expect(release({ fetchImpl })).resolves.toMatchObject({ status: 'superseded' });
  });

  it('promotes web before product after smoke and audit succeed', async () => {
    const { fetchImpl, promoteCalls, rollbackCalls } = createReleaseWorld();

    const result = await release({ fetchImpl });

    expect(result.status).toBe('promoted');
    expect(promoteCalls).toEqual(['web', 'product']);
    expect(rollbackCalls).toEqual([]);
  });

  it('rolls web back to its previous deployment when product fails to promote', async () => {
    const { fetchImpl, promoteCalls, rollbackCalls } = createReleaseWorld();

    await expect(release({ fetchImpl, simulateFailure: 'promote:product' })).rejects.toThrow(
      /Simulated failure at promote:product/,
    );

    expect(promoteCalls).toEqual(['web']);
    expect(rollbackCalls).toEqual(['web']);
  });

  it('leaves production untouched when smoke fails before any promote', async () => {
    const { fetchImpl, promoteCalls, rollbackCalls } = createReleaseWorld();

    await expect(release({ fetchImpl, simulateFailure: 'smoke:web' })).rejects.toThrow(
      /Simulated failure at smoke:web/,
    );

    expect(promoteCalls).toEqual([]);
    expect(rollbackCalls).toEqual([]);
  });

  it('demands a manual rollback when the automatic rollback also fails', async () => {
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).includes('/rollback/')) {
        return new Response(null, { status: 500 });
      }
      return world.fetchImpl(input, init);
    });

    const error = await release({ fetchImpl, simulateFailure: 'promote:product' }).catch(
      (thrown: Error) => thrown,
    );

    expect(error.message).toContain('MANUAL ROLLBACK REQUIRED');
    expect(error.message).toContain('dpl_web_old');
    expect(error.message).not.toContain(TOKEN);
  });

  it('skips smoke and audit under Force Promote', async () => {
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).includes('/env')) throw new Error('audit must not run under force');
      return world.fetchImpl(input, init);
    });

    await expect(release({ fetchImpl, force: true })).resolves.toMatchObject({
      status: 'promoted',
    });
    expect(world.promoteCalls).toEqual(['web', 'product']);
  });
});
