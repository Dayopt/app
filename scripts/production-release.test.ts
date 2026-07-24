import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  findDeploymentForSha,
  runProductionRelease,
  smokeDeployment,
  waitForReadyCandidates,
  writeReleaseStatus,
} from './production-release.mjs';

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
const TOKEN = 'vercel-token-must-not-appear';
const BYPASS = 'bypass-secret-must-not-appear';

/** 実際の smoke marker をすべて含む body。個別テストで上書きする。 */
const SMOKE_BODY = '<html lang="en">{"status":"healthy"}</html>';

/** RELEASE_PROJECTS が期待する x-matched-path を返す smoke response。 */
const MATCHED_PATHS: Record<string, string> = {
  '/': '/en',
  '/ja': '/ja',
  '/api/health': '/api/health',
  '/auth/login': '/[locale]/auth/login',
  '/ja/auth/login': '/[locale]/auth/login',
};

function smokeResponse(url: string, body = SMOKE_BODY) {
  const path = new URL(url).pathname;
  return new Response(body, {
    status: 200,
    headers: { 'x-matched-path': MATCHED_PATHS[path] ?? path },
  });
}

function deployment(uid: string, sha: string, readyState = 'READY', created = 2000) {
  return {
    uid,
    url: `${uid}.vercel.app`,
    readyState,
    created,
    target: 'production',
    meta: { githubCommitSha: sha },
  };
}

function projectTarget(id: string, sha: string, createdAt = 1000) {
  return {
    id: 'prj_test',
    targets: { production: { id, createdAt, meta: { githubCommitSha: sha } } },
  };
}

const noop = { log: () => {} };
const noSleep = () => Promise.resolve();

/** URL ごとに応答を返す fetch mock。Vercel API 以外は smoke とみなす。 */
function createVercelMock(handlers: Record<string, () => unknown>) {
  const fetchImpl = vi.fn(async (input: URL | string) => {
    const url = String(input);
    if (new URL(url).origin !== 'https://api.vercel.com') {
      return smokeResponse(url);
    }
    const key = Object.keys(handlers).find((pattern) => url.includes(pattern));
    if (!key) throw new Error(`Unhandled request: ${url}`);
    return Response.json(handlers[key]!());
  });
  return { fetchImpl };
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
 * promote と rollback は同じ endpoint を使うので、対象 deployment id で区別する。
 */
function createReleaseWorld(
  options: {
    productionSha?: string;
    smokeBody?: string;
    autoAssign?: boolean | null;
    webAlreadyAtTarget?: boolean;
  } = {},
) {
  const previous = { web: 'dpl_web_old', product: 'dpl_product_old' };
  // Vercel の promote endpoint は autoAssignCustomDomains を true に戻す
  // （vercel/vercel#15095）。その副作用を再現する。
  const autoAssign: Record<string, boolean | null> = {
    web: options.autoAssign === undefined ? false : options.autoAssign,
    product: options.autoAssign === undefined ? false : options.autoAssign,
  };
  const patches: { project: string; value: unknown }[] = [];
  const production: Record<string, { id: string; sha: string; createdAt: number }> = {
    web: options.webAlreadyAtTarget
      ? { id: 'dpl_web_new', sha: SHA, createdAt: 2000 }
      : { id: previous.web, sha: options.productionSha ?? OLD_SHA, createdAt: 1000 },
    product: { id: previous.product, sha: options.productionSha ?? OLD_SHA, createdAt: 1000 },
  };
  const candidates = {
    web: deployment('dpl_web_new', SHA),
    product: deployment('dpl_product_new', SHA),
  };
  const pointCalls: { project: string; deploymentId: string }[] = [];

  const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (new URL(url).origin !== 'https://api.vercel.com') {
      return smokeResponse(url, options.smokeBody);
    }

    const project = url.includes('web') ? 'web' : 'product';

    if (method === 'PATCH' && url.includes('/v9/projects/')) {
      const value = JSON.parse(String(init?.body ?? '{}')).autoAssignCustomDomains;
      patches.push({ project, value });
      autoAssign[project] = value;
      return new Response(null, { status: 200 });
    }
    if (method === 'POST' && url.includes('/promote/')) {
      const deploymentId = url.split('/promote/')[1]!.split('?')[0]!;
      // promote / rollback は project 名ではなく prj_ ID を使う。
      expect(url).toContain(`/projects/prj_${project}/promote/`);
      pointCalls.push({ project, deploymentId });
      // 副作用: 設定が true へ戻る。
      if (autoAssign[project] !== null) autoAssign[project] = true;
      const isRollback = deploymentId === previous[project as 'web' | 'product'];
      production[project] = isRollback
        ? { id: deploymentId, sha: OLD_SHA, createdAt: 1000 }
        : { id: deploymentId, sha: SHA, createdAt: 2000 };
      return new Response(null, { status: 202 });
    }
    if (url.includes('/v7/deployments')) {
      return Response.json({ deployments: [candidates[project as 'web' | 'product']] });
    }
    if (url.includes('/env')) {
      return Response.json(auditMetadata(project as 'product' | 'web'));
    }
    if (url.includes('/v9/projects/')) {
      const current = production[project]!;
      return Response.json({
        id: `prj_${project}`,
        autoAssignCustomDomains: autoAssign[project],
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

  const promoted = () =>
    pointCalls.filter((call) => call.deploymentId.endsWith('_new')).map((call) => call.project);
  const rolledBack = () =>
    pointCalls.filter((call) => call.deploymentId.endsWith('_old')).map((call) => call.project);

  return { fetchImpl, pointCalls, promoted, rolledBack, patches, autoAssign };
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
  it('returns only the production deployment whose commit SHA matches', async () => {
    const { fetchImpl } = createVercelMock({
      '/v7/deployments': () => ({
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
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(`sha=${SHA}`);
  });

  it('ignores deployments created outside the GitHub integration', async () => {
    const cliDeployment = {
      uid: 'dpl_cli',
      url: 'dpl_cli.vercel.app',
      readyState: 'ERROR',
      created: 3000,
      target: 'production',
      meta: { gitCommitSha: SHA },
    };
    const { fetchImpl } = createVercelMock({
      '/v7/deployments': () => ({ deployments: [cliDeployment, deployment('dpl_match', SHA)] }),
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

  it('ignores preview deployments that share the commit SHA', async () => {
    const preview = { ...deployment('dpl_preview', SHA), target: null };
    const { fetchImpl } = createVercelMock({
      '/v7/deployments': () => ({ deployments: [preview] }),
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
      '/v7/deployments': () => ({ deployments: [deployment('dpl_web', SHA, 'ERROR')] }),
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
      '/v7/deployments': () => ({ deployments: [deployment('dpl_web', SHA, 'BUILDING')] }),
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
  const okBody = () => smokeResponse('https://dpl.vercel.app/');

  it('sends the bypass header only when a secret is configured', async () => {
    const withSecret = vi.fn(okBody);
    await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      checks: [{ path: '/' }],
      bypassSecret: BYPASS,
      fetchImpl: withSecret,
      sleepImpl: noSleep,
      logger: noop,
    });
    expect(withSecret.mock.calls[0]?.[1]?.headers).toHaveProperty('x-vercel-protection-bypass');

    const withoutSecret = vi.fn(okBody);
    await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      checks: [{ path: '/' }],
      bypassSecret: undefined,
      fetchImpl: withoutSecret,
      sleepImpl: noSleep,
      logger: noop,
    });
    expect(withoutSecret.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'x-vercel-protection-bypass',
    );
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
        checks: [{ path: '/' }],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).rejects.toThrow(/Protection Bypass for Automation/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a 200 that was served by a different route', async () => {
    // product は未知 path でも 200 を返すため、status だけでは不足する。
    const fetchImpl = vi.fn(
      async () =>
        new Response('<title>Calendar</title>', {
          status: 200,
          headers: { 'x-matched-path': '/[locale]/[nday]' },
        }),
    );

    await expect(
      smokeDeployment({
        projectName: 'product',
        deploymentUrl: 'dpl.vercel.app',
        checks: [{ path: '/auth/login', matchedPath: '/[locale]/auth/login' }],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).rejects.toThrow(/was served by \/\[locale\]\/\[nday\]/);
    // route の不一致は retry しても変わらない。
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a 200 that streamed a Next.js failure', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>NEXT_HTTP_ERROR_FALLBACK;404</html>', {
          status: 200,
          headers: { 'x-matched-path': '/en' },
        }),
    );

    await expect(
      smokeDeployment({
        projectName: 'web',
        deploymentUrl: 'dpl.vercel.app',
        checks: [{ path: '/', matchedPath: '/en' }],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).rejects.toThrow(/streamed NEXT_HTTP_ERROR_FALLBACK/);
  });

  it('sends an explicit Accept-Language so locale detection cannot redirect', async () => {
    const fetchImpl = vi.fn(okBody);
    await smokeDeployment({
      projectName: 'web',
      deploymentUrl: 'dpl.vercel.app',
      checks: [{ path: '/' }],
      bypassSecret: undefined,
      fetchImpl,
      sleepImpl: noSleep,
      logger: noop,
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ 'accept-language': 'en' });
  });

  it('retries transient failures and never leaks the bypass secret or response body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('internal detail', { status: 500 }))
      .mockResolvedValueOnce(smokeResponse('https://dpl.vercel.app/'));

    await expect(
      smokeDeployment({
        projectName: 'web',
        deploymentUrl: 'dpl.vercel.app',
        checks: [{ path: '/', matchedPath: '/en' }],
        bypassSecret: BYPASS,
        fetchImpl,
        sleepImpl: noSleep,
        logger: noop,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => new Response('internal detail', { status: 503 }));
    const error = await smokeDeployment({
      projectName: 'product',
      deploymentUrl: 'dpl.vercel.app',
      checks: [{ path: '/api/health', contains: '"status":"healthy"' }],
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
    const world = createReleaseWorld({ productionSha: SHA });

    await expect(release({ fetchImpl: world.fetchImpl })).resolves.toMatchObject({
      status: 'already-released',
    });
    expect(world.pointCalls).toEqual([]);
  });

  it('skips promote when a newer production deployment already exists', async () => {
    const { fetchImpl } = createVercelMock({
      '/v7/deployments': () => ({ deployments: [deployment('dpl_new', SHA, 'READY', 1000)] }),
      '/v9/projects/': () => projectTarget('dpl_newer', OLD_SHA, 5000),
    });

    await expect(release({ fetchImpl })).resolves.toMatchObject({ status: 'superseded' });
  });

  it('promotes web before product after smoke and audit succeed', async () => {
    const world = createReleaseWorld();

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['web', 'product']);
    expect(world.rolledBack()).toEqual([]);
  });

  it('rolls web back to its previous deployment when product fails to promote', async () => {
    const world = createReleaseWorld();

    await expect(
      release({ fetchImpl: world.fetchImpl, simulateFailure: 'promote:product' }),
    ).rejects.toThrow(/Simulated failure at promote:product/);

    expect(world.promoted()).toEqual(['web']);
    expect(world.rolledBack()).toEqual(['web']);
  });

  it('leaves production untouched when smoke fails before any promote', async () => {
    const world = createReleaseWorld();

    await expect(
      release({ fetchImpl: world.fetchImpl, simulateFailure: 'smoke:web' }),
    ).rejects.toThrow(/Simulated failure at smoke:web/);

    expect(world.pointCalls).toEqual([]);
  });

  it('stops before promote when a candidate serves an unhealthy /api/health', async () => {
    const world = createReleaseWorld({ smokeBody: '{"status":"degraded"}' });

    await expect(release({ fetchImpl: world.fetchImpl })).rejects.toThrow(
      /without the expected content/,
    );
    expect(world.pointCalls).toEqual([]);
  });

  it('rolls back a promote whose confirmation never lands', async () => {
    // POST は受理されたが production 割当の反映が確認できない場合。
    // 確認待ちで諦めると web だけ新 SHA という部分公開が残る。
    const world = createReleaseWorld();
    let clock = 0;
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/promote/dpl_web_new')) {
        // 受理はするが production 割当は動かさない。
        world.pointCalls.push({ project: 'web', deploymentId: 'dpl_web_new' });
        return new Response(null, { status: 202 });
      }
      return world.fetchImpl(input, init);
    });

    const error = await release({
      fetchImpl,
      nowImpl: () => (clock += 60_000),
    }).catch((thrown: Error) => thrown);

    expect(error.message).toMatch(/promote did not take effect/);
    expect(world.rolledBack()).toEqual(['web']);
  });

  it('demands a manual rollback when the automatic rollback also fails', async () => {
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/promote/dpl_web_old')) {
        return new Response(null, { status: 500 });
      }
      // 以降は既定の world mock に委ねる。
      return world.fetchImpl(input, init);
    });

    const error = await release({ fetchImpl, simulateFailure: 'promote:product' }).catch(
      (thrown: Error) => thrown,
    );

    expect(error.message).toContain('MANUAL ROLLBACK REQUIRED');
    expect(error.message).toContain('dpl_web_old');
    expect(error.message).not.toContain(TOKEN);
  });

  it('restores autoAssignCustomDomains that promote flips back on', async () => {
    // vercel/vercel#15095: promote endpoint が project 設定を書き換える。
    // 放置すると次の main merge が gate を通らず直接公開される。
    const world = createReleaseWorld();

    await expect(release({ fetchImpl: world.fetchImpl })).resolves.toMatchObject({
      status: 'promoted',
    });

    expect(world.patches).toEqual([
      { project: 'web', value: false },
      { project: 'product', value: false },
    ]);
    expect(world.autoAssign).toEqual({ web: false, product: false });
  });

  it('leaves autoAssignCustomDomains alone while it is intentionally enabled', async () => {
    // 段階適用の Phase A では Auto-assign が ON のままでよい。
    // 事前値へ戻すだけなので、勝手に無効化しない。
    const world = createReleaseWorld({ autoAssign: true });

    await release({ fetchImpl: world.fetchImpl });

    expect(world.patches).toEqual([]);
    expect(world.autoAssign).toEqual({ web: true, product: true });
  });

  it('fails the run without rolling back when the setting cannot be restored', async () => {
    // 設定復元の失敗で正常なリリースを巻き戻すと、production が理由なく旧 SHA へ戻る。
    // production はそのままにし、run だけ失敗させて次の merge 前の対処を促す。
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') {
        return new Response(null, { status: 500 });
      }
      return world.fetchImpl(input, init);
    });

    const error = await release({ fetchImpl }).catch((thrown: Error) => thrown);

    expect(error.message).toMatch(/autoAssignCustomDomains could not be restored/);
    expect(world.promoted()).toEqual(['web', 'product']);
    expect(world.rolledBack()).toEqual([]);
  });

  it('names a pre-existing split it cannot roll back', async () => {
    // 前回 run が中断して web だけ公開された状態。web は戻し先を持たないので
    // 自動 rollback の対象にできない。名指しだけはする。
    const world = createReleaseWorld({ webAlreadyAtTarget: true });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(result.preexistingSplit).toEqual(['web']);
    // web は既に対象 SHA を配信しているので promote しない。
    expect(world.promoted()).toEqual(['product']);
  });

  it('refuses to promote over production that moved while waiting', async () => {
    // 待機中にオペレータが Instant Rollback した場合、その判断を上書きしない。
    const world = createReleaseWorld();
    let projectReads = 0;
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v9/projects/web') && (init?.method ?? 'GET') === 'GET') {
        projectReads += 1;
        // 1 回目（before snapshot）は通常、2 回目（待機後）は別 deployment。
        if (projectReads > 1) {
          return Response.json({
            id: 'prj_web',
            autoAssignCustomDomains: false,
            targets: {
              production: {
                id: 'dpl_web_hotfix',
                createdAt: 1500,
                meta: { githubCommitSha: OLD_SHA },
              },
            },
          });
        }
      }
      return world.fetchImpl(input, init);
    });

    await expect(release({ fetchImpl })).rejects.toThrow(/Production moved while waiting/);
    expect(world.promoted()).toEqual([]);
  });

  it('still checks the setting when both projects already serve the SHA', async () => {
    // 前回 run が復元に失敗して終わった後の再実行。ここで success を返すと
    // auto-assign が true のまま tag gate を通ってしまう。
    const world = createReleaseWorld({ productionSha: SHA, autoAssign: true });
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') return new Response(null, { status: 500 });
      return world.fetchImpl(input, init);
    });

    await expect(release({ fetchImpl, expectedAutoAssign: false })).rejects.toThrow(
      /could not be restored/,
    );
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
    expect(world.promoted()).toEqual(['web', 'product']);
  });
});

describe('writeReleaseStatus', () => {
  function outputFile() {
    return join(mkdtempSync(join(tmpdir(), 'release-status-')), 'output.txt');
  }

  it('writes each known status for the workflow to branch on', () => {
    for (const status of ['already-released', 'promoted', 'superseded', 'failed']) {
      const path = outputFile();
      writeReleaseStatus(status, { env: { GITHUB_OUTPUT: path } });
      expect(readFileSync(path, 'utf8')).toBe(`release_status=${status}\n`);
    }
  });

  it('refuses to write a status outside the known set', () => {
    const path = outputFile();
    writeReleaseStatus('promoted\nmalicious=1', { env: { GITHUB_OUTPUT: path } });
    expect(() => readFileSync(path, 'utf8')).toThrow();
  });
});
