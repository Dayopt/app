import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  RELEASE_PROJECTS,
  findDeploymentForSha,
  gitDiffFiles,
  resolveProjectImpact,
  runProductionRelease,
  smokeDeployment,
  waitForReadyCandidates,
  writeReleaseManifest,
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
  '/auth/signup': '/[locale]/auth/signup',
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

/** GET /v13/deployments/{id} が返す形。 */
function deploymentRecord(id: string, sha: string, createdAt = 1000) {
  return {
    id,
    url: `${id}.vercel.app`,
    readyState: 'READY',
    createdAt,
    target: 'production',
    meta: { githubCommitSha: sha },
  };
}

const DOMAINS: Record<string, string> = { web: 'dayopt.app', product: 'app.dayopt.app' };

/**
 * URL からどちらの project 向けかを判定する。
 * `target=production` の中に 'product' が含まれるので、先に取り除いてから判定する。
 */
function projectFromUrl(url: string): 'web' | 'product' {
  const withoutTarget = url.replaceAll('production', '');
  if (withoutTarget.includes('app.dayopt.app') || withoutTarget.includes('product')) {
    return 'product';
  }
  return 'web';
}

const noop = { log: () => {} };
const noSleep = () => Promise.resolve();

/**
 * live production は alias 起点で解決する。`targets.production` は build 中の
 * deployment も指すため使えない（実測で確認済み）。
 */
function createVercelMock(handlers: Record<string, () => unknown>) {
  const fetchImpl = vi.fn(async (input: URL | string) => {
    const url = String(input);
    if (new URL(url).origin !== 'https://api.vercel.com') return smokeResponse(url);
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
 * promote / rollback は同じ endpoint なので、対象 deployment id で区別する。
 */
function createReleaseWorld(
  options: {
    productionSha?: string;
    smokeBody?: string;
    autoAssign?: boolean | null;
    webAlreadyAtTarget?: boolean;
    /** web の alias 読み取り n 回目に返す deployment id。末尾の値が以降も続く。 */
    webAliasSequence?: string[];
  } = {},
) {
  const bothAtTarget = options.productionSha === SHA;
  const live: Record<string, string> = {
    web: bothAtTarget || options.webAlreadyAtTarget ? 'dpl_web_new' : 'dpl_web_old',
    product: bothAtTarget ? 'dpl_product_new' : 'dpl_product_old',
  };
  const store: Record<string, ReturnType<typeof deploymentRecord>> = {
    dpl_web_old: deploymentRecord('dpl_web_old', OLD_SHA, 1000),
    dpl_product_old: deploymentRecord('dpl_product_old', OLD_SHA, 1000),
    dpl_web_new: deploymentRecord('dpl_web_new', SHA, 2000),
    dpl_product_new: deploymentRecord('dpl_product_new', SHA, 2000),
    dpl_web_hotfix: deploymentRecord('dpl_web_hotfix', OLD_SHA, 1500),
  };
  // promote endpoint は autoAssignCustomDomains を true に戻す（vercel/vercel#15095）。
  const autoAssign: Record<string, boolean | null> = {
    web: options.autoAssign === undefined ? false : options.autoAssign,
    product: options.autoAssign === undefined ? false : options.autoAssign,
  };
  const patches: { project: string; value: unknown }[] = [];
  const candidates = {
    web: deployment('dpl_web_new', SHA),
    product: deployment('dpl_product_new', SHA),
  };
  const pointCalls: { project: string; deploymentId: string }[] = [];
  let webAliasReads = 0;

  const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (new URL(url).origin !== 'https://api.vercel.com') {
      return smokeResponse(url, options.smokeBody);
    }

    const project = projectFromUrl(url);

    if (method === 'PATCH' && url.includes('/v9/projects/')) {
      const value = JSON.parse(String(init?.body ?? '{}')).autoAssignCustomDomains;
      patches.push({ project, value });
      autoAssign[project] = value;
      return new Response(null, { status: 200 });
    }
    if (method === 'POST' && url.includes('/promote/')) {
      const deploymentId = url.split('/promote/')[1]!.split('?')[0]!;
      // promote は project 名ではなく prj_ ID を使い、対象 project と一致すること。
      expect(url).toContain(`/projects/prj_${project}/promote/`);
      pointCalls.push({ project, deploymentId });
      live[project] = deploymentId;
      if (autoAssign[project] !== null) autoAssign[project] = true;
      return new Response(null, { status: 202 });
    }
    if (url.includes('/v7/deployments')) {
      return Response.json({ deployments: [candidates[project as 'web' | 'product']] });
    }
    if (url.includes('/env')) {
      return Response.json(auditMetadata(project));
    }
    if (url.includes('/v4/aliases/')) {
      if (project === 'web' && options.webAliasSequence) {
        const seq = options.webAliasSequence;
        const id = seq[Math.min(webAliasReads, seq.length - 1)]!;
        webAliasReads += 1;
        if (id !== live.web) {
          // 外部の promote が起きたとみなす。promote endpoint の副作用も再現する。
          live.web = id;
          if (autoAssign.web !== null) autoAssign.web = true;
        }
        return Response.json({ deploymentId: id });
      }
      return Response.json({ deploymentId: live[project] });
    }
    if (url.includes('/v13/deployments/')) {
      const id = url.split('/v13/deployments/')[1]!.split('?')[0]!;
      return Response.json(store[id] ?? deploymentRecord(id, OLD_SHA, 1000));
    }
    if (url.includes('/v9/projects/')) {
      return Response.json({ id: `prj_${project}`, autoAssignCustomDomains: autoAssign[project] });
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  const promoted = () =>
    pointCalls.filter((call) => call.deploymentId.endsWith('_new')).map((call) => call.project);
  const rolledBack = () =>
    pointCalls.filter((call) => call.deploymentId.endsWith('_old')).map((call) => call.project);

  return { fetchImpl, pointCalls, promoted, rolledBack, patches, autoAssign, live, store, DOMAINS };
}

/** 両 app に影響する差分（root 設定）。project 別の影響は各 test で上書きする。 */
const AFFECTS_BOTH = () => ['pnpm-lock.yaml'];

function release(overrides: Record<string, unknown> = {}) {
  return runProductionRelease({
    sha: SHA,
    token: TOKEN,
    teamId: 'team',
    sleepImpl: noSleep,
    nowImpl: () => 0,
    logger: noop,
    bypassSecrets: { web: BYPASS, product: BYPASS },
    diffFilesImpl: AFFECTS_BOTH,
    // 既定は「checkout = release 対象」。実 repo の HEAD は SHA と一致しないので、
    // 注入しないと全 test が fail closed 経路（常に両方 affected）に落ちる。
    headShaImpl: () => SHA,
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
      '/v4/aliases/': () => ({ deploymentId: 'dpl_newer' }),
      '/v13/deployments/': () => deploymentRecord('dpl_newer', OLD_SHA, 5000),
      '/v9/projects/': () => ({ id: 'prj_test', autoAssignCustomDomains: false }),
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
    // 1回目=before snapshot、2回目以降=待機後。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_hotfix'],
    });

    await expect(release({ fetchImpl: world.fetchImpl })).rejects.toThrow(
      /Production moved while waiting/,
    );
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

  it('respects a manual promote of the same candidate during the wait', async () => {
    // 待機中に人が同じ candidate を promote した場合は競合ではない。
    // 止めず、かつ二重 promote もしない。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new'],
    });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
  });

  it('refuses to promote when production moves during smoke and audit', async () => {
    // 待機後の再取得と promote の間には smoke と audit があり数分かかる。
    // 1回目=before, 2回目=待機後, 3回目=promote 直前。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_old', 'dpl_web_hotfix'],
    });

    await expect(release({ fetchImpl: world.fetchImpl })).rejects.toThrow(
      /production moved to dpl_web_hotfix/,
    );
    expect(world.promoted()).toEqual([]);
  });

  it('restores the setting for a project it skipped promoting', async () => {
    // 外部が同じ candidate を promote した場合、その promote も auto-assign を
    // true に戻す。promote を飛ばした project も設定は揃えて終える。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new'],
      autoAssign: false,
    });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
    // promote していない web も、最後の掃きで false に戻る。
    expect(world.patches).toContainEqual({ project: 'web', value: false });
  });

  it('smokes candidates that Vercel already auto-assigned', async () => {
    // Auto-assign が有効な段階適用中は candidate が待機中に自動割当され、
    // promote 対象が空になる。それでも smoke は走らせ、毎 merge を
    // smoke と bypass secret の実働テストにする。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new'],
    });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
    // promote しなかった web の candidate にも smoke が飛んでいる。
    const smokeUrls = world.fetchImpl.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('dpl_web_new.vercel.app'));
    expect(smokeUrls.length).toBeGreaterThan(0);
  });

  it('sweeps the setting even when smoke aborts the run', async () => {
    // 待機中に外部が web candidate を promote して auto-assign が true に戻り、
    // その後 product の smoke が失敗した場合。ここで抜けると誰も設定を戻さず、
    // 次の merge が gate を迂回する。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new'],
      smokeBody: '{"status":"degraded"}',
    });

    await expect(release({ fetchImpl: world.fetchImpl })).rejects.toThrow(
      /without the expected content/,
    );
    expect(world.pointCalls).toEqual([]);
    // 失敗経路でも web の設定は false へ戻っている。
    expect(world.patches).toContainEqual({ project: 'web', value: false });
  });

  it('names projects whose setting could not be restored when smoke aborts', async () => {
    // 掃き自体が失敗した場合、run は smoke の失敗だけを報告して終わる。
    // auto-assign が有効なまま残る事実を名指ししないと、次の merge が
    // gate を迂回することにオペレータが気づけない。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new'],
      smokeBody: '{"status":"degraded"}',
    });
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') return new Response(null, { status: 500 });
      return world.fetchImpl(input, init);
    });
    const logs: string[] = [];
    const logger = { log: (message: string) => logs.push(message) };

    await expect(release({ fetchImpl, logger })).rejects.toThrow(/without the expected content/);
    expect(logs.join('\n')).toMatch(/could not be restored for web/);
  });

  it('reports whether the gate checks actually ran', async () => {
    const normal = createReleaseWorld();
    await expect(release({ fetchImpl: normal.fetchImpl })).resolves.toMatchObject({
      gateChecksRan: true,
    });

    const forced = createReleaseWorld();
    await expect(release({ fetchImpl: forced.fetchImpl, force: true })).resolves.toMatchObject({
      gateChecksRan: false,
    });
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

describe('resolveProjectImpact', () => {
  const web = RELEASE_PROJECTS.find((project) => project.name === 'web')!;
  const product = RELEASE_PROJECTS.find((project) => project.name === 'product')!;

  it('treats an unknown production SHA as affected', () => {
    // GitHub 連携以外で作られた deployment には commit SHA が無い。
    // 基準が取れないまま skip すると、変更が production へ出ないまま success になる。
    expect(resolveProjectImpact({ project: product, baseSha: null, targetSha: SHA }).affected).toBe(
      true,
    );
  });

  it('treats an unreadable git history as affected', () => {
    // shallow clone / gc 済みで基準 commit が無い場合。Vercel の判定ではなく
    // Dayopt 側の判定を正とする以上、判定不能は必ず fail closed へ倒す。
    const decision = resolveProjectImpact({
      project: product,
      baseSha: OLD_SHA,
      targetSha: SHA,
      diffFilesImpl: () => {
        throw new Error('bad object');
      },
    });
    expect(decision).toMatchObject({ affected: true });
    expect(decision.reason).toMatch(/fail closed/);
  });

  it('treats an empty diff as unaffected', () => {
    // git が正常終了して 0 件を返したのは「差分なし」の確定的な答えであって、
    // 一覧の取得失敗ではない。
    expect(
      resolveProjectImpact({
        project: web,
        baseSha: OLD_SHA,
        targetSha: SHA,
        diffFilesImpl: () => [],
      }).affected,
    ).toBe(false);
  });

  it('separates product-only changes from web', () => {
    const diffFilesImpl = () => ['apps/product/src/app/page.tsx'];
    expect(
      resolveProjectImpact({ project: product, baseSha: OLD_SHA, targetSha: SHA, diffFilesImpl })
        .affected,
    ).toBe(true);
    expect(
      resolveProjectImpact({ project: web, baseSha: OLD_SHA, targetSha: SHA, diffFilesImpl })
        .affected,
    ).toBe(false);
  });

  it('lists both sides of a rename through the real git', () => {
    // 既定の diff 実装（引数の綴り・-z 分割・--no-renames）を実際の git で確認する。
    // ここが壊れても injection 付きの test は全て通る。
    //
    // 使い捨て repo を作るのは、CI の Unit job が shallow clone（fetch-depth: 1）で
    // 動くため。この repo の HEAD~1 に依存すると CI でだけ落ちる。
    const repo = mkdtempSync(join(tmpdir(), 'release-diff-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    git('init', '--quiet', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    mkdirSync(join(repo, 'apps/product/src'), { recursive: true });
    writeFileSync(join(repo, 'apps/product/src/page.tsx'), 'export const page = 1;\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();

    // app から docs へ動かす。rename 検出が有効だと移動先しか出ず、product の
    // build 入力からファイルが消えた事実を取りこぼす。
    mkdirSync(join(repo, 'docs'), { recursive: true });
    renameSync(join(repo, 'apps/product/src/page.tsx'), join(repo, 'docs/page.tsx'));
    git('add', '-A');
    git('commit', '--quiet', '-m', 'move');
    const target = git('rev-parse', 'HEAD').trim();

    expect(gitDiffFiles(base, target, { cwd: repo }).sort()).toEqual([
      'apps/product/src/page.tsx',
      'docs/page.tsx',
    ]);
  });
});

describe('runProductionRelease (affected-aware)', () => {
  it('promotes only product when web is untouched', async () => {
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/product/src/app/page.tsx'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
    // web の candidate は待たない。Vercel が deployment を作らないので待てば timeout する。
    const webCandidateLookups = world.fetchImpl.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/v7/deployments') && url.includes('projectId=web'));
    expect(webCandidateLookups).toEqual([]);
  });

  it('promotes only web when product is untouched', async () => {
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/web/src/app/page.tsx'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['web']);
  });

  it('promotes both when a shared package changes', async () => {
    // 実在する共有 package を使う。存在しない package 名だと未知 path の
    // fail closed で両方 affected になり、依存グラフ解決を検証したことにならない。
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['packages/i18n/src/index.ts'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['web', 'product']);
  });

  it('promotes only product when a product-only package changes', async () => {
    // packages/domain は product だけが依存する。依存グラフを実際に辿らないと
    // この区別は出ない。
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['packages/domain/src/index.ts'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
  });

  it('is a no-op success when the merge affects no app', async () => {
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['docs/engineering/infra.md', '.github/workflows/docs-guard.yml'],
    });

    expect(result.status).toBe('unaffected');
    expect(world.pointCalls).toEqual([]);
    // production が動いていない以上、この commit を tag できてよい。
    expect(result.manifest.projects.map((entry: { action: string }) => entry.action)).toEqual([
      'skipped',
      'skipped',
    ]);
  });

  it('is a no-op when one project already serves the SHA and the other is untouched', async () => {
    // 前回 run が web だけ公開して中断した後の再実行。product の影響は product 自身の
    // live SHA から測り直すので、product に影響が無ければこの状態は完結していて
    // 何もしないのが正しい。manifest で両者の live SHA が読めることを担保する。
    const world = createReleaseWorld({ webAlreadyAtTarget: true });

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['docs/engineering/infra.md'],
    });

    expect(result.status).toBe('unaffected');
    expect(result.preexistingSplit).toEqual([]);
    expect(world.pointCalls).toEqual([]);
    expect(result.manifest.projects).toEqual([
      expect.objectContaining({ name: 'web', action: 'already-serving', sourceSha: SHA }),
      expect.objectContaining({ name: 'product', action: 'skipped', sourceSha: OLD_SHA }),
    ]);
  });

  it('marks manifest values this run did not observe itself', async () => {
    // unaffected な project の値は run 開始時点の観測。待機中に人が動かしていれば
    // 実態とズレるため、復旧時に取り違えないよう出所を残す。
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/product/src/app/page.tsx'],
    });

    expect(result.manifest.projects).toEqual([
      expect.objectContaining({ name: 'web', observedAt: 'run-start' }),
      expect.objectContaining({ name: 'product', observedAt: 'this-run' }),
    ]);
  });

  it('classifies everything as affected when the checkout is not the release target', async () => {
    // workflow_dispatch で古い SHA を再試行した場合。依存グラフは checkout の
    // manifest から解決するため、target 当時と違うグラフで分類しかねない
    // （target の後で依存を外していると「consumer 無し」と誤判定する）。
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      headShaImpl: () => OLD_SHA,
      diffFilesImpl: () => ['docs/engineering/infra.md'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['web', 'product']);
  });

  it('verifies a build that is already live before calling the commit released', async () => {
    // Auto-assign や中断した run が gate を通さずに live にした build を、
    // promote 0 件の success で「live として認証」してしまわないこと。
    const world = createReleaseWorld({ productionSha: SHA, smokeBody: '{"status":"degraded"}' });

    await expect(
      release({ fetchImpl: world.fetchImpl, diffFilesImpl: () => ['docs/x.md'] }),
    ).rejects.toThrow(/without the expected content/);
  });

  it('runs the audit against a build that is already live', async () => {
    const world = createReleaseWorld({ productionSha: SHA });
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).includes('/env')) return Response.json({ envs: [] }); // 契約違反の metadata
      return world.fetchImpl(input, init);
    });

    await expect(release({ fetchImpl, diffFilesImpl: () => ['docs/x.md'] })).rejects.toThrow(
      /Production Config Audit failed/,
    );
  });

  it('records a candidate that goes live during the wait as live, not pending', async () => {
    // 待機中に Auto-assign が candidate を live にすると pending filter で除外され、
    // promote loop に届かない。manifest 上「未着手」に見せない。
    const world = createReleaseWorld({ webAliasSequence: ['dpl_web_old', 'dpl_web_new'] });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(world.promoted()).toEqual(['product']);
    expect(result.manifest.projects).toContainEqual(
      expect.objectContaining({
        name: 'web',
        action: 'already-serving',
        deploymentId: 'dpl_web_new',
        observedAt: 'this-run',
      }),
    );
  });

  it('smokes both production domains after a one-sided promote', async () => {
    // 片側だけ進んだ production は、その組み合わせが初めて世に出る状態になる。
    const world = createReleaseWorld();

    await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/product/src/app/page.tsx'],
    });

    const smoked = world.fetchImpl.mock.calls
      .map((call) => String(call[0]))
      .filter(
        (url) => url.startsWith('https://dayopt.app') || url.startsWith('https://app.dayopt.app'),
      );
    expect(smoked).toContain('https://dayopt.app/');
    expect(smoked).toContain('https://app.dayopt.app/api/health');
  });

  it('smokes the production domains even when Vercel auto-assigned the candidate', async () => {
    // Auto-assign が有効な段階適用中は promote 件数が 0 になる。promote 件数で
    // 分岐すると cutover までこの smoke が一度も走らない。
    const world = createReleaseWorld({ webAliasSequence: ['dpl_web_old', 'dpl_web_new'] });

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/web/src/app/page.tsx'],
    });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual([]);
    const smoked = world.fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(smoked).toContain('https://dayopt.app/');
    expect(smoked).toContain('https://app.dayopt.app/api/health');
  });

  it('refuses to report a SHA as live when the domain moved off the candidate', async () => {
    // 待機中に auto-assign された candidate は promote loop を通らないため、その後
    // 誰かが rollback しても ID を確認する経路が無かった。smoke は health しか見ないので
    // 健全な別 deployment が応答すれば通り、live でない SHA に success が付く。
    // 1回目=before, 2回目=待機後（自動割当）, 3回目=最終確認（別 deployment へ移動）。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_new', 'dpl_web_hotfix'],
    });

    await expect(release({ fetchImpl: world.fetchImpl })).rejects.toThrow(
      /web: production serves dpl_web_hotfix, not the released dpl_web_new/,
    );

    // この run が promote したのは product だけ。戻すのもそれだけ。
    expect(world.promoted()).toEqual(['product']);
    expect(world.rolledBack()).toEqual(['product']);
  });

  it('refuses to report an already-live SHA when the domain moves during the gate', async () => {
    // promote 0 件の経路は candidate の ID 突き合わせを通らない。smoke と audit の
    // 数分の間に人が Instant Rollback すると、live でない commit に success が付く。
    // 1回目=run 開始時（target を配信中）、2回目=検証時（別 SHA へ移動）。
    const world = createReleaseWorld({
      productionSha: SHA,
      webAliasSequence: ['dpl_web_new', 'dpl_web_hotfix'],
    });

    await expect(
      release({ fetchImpl: world.fetchImpl, diffFilesImpl: () => ['docs/x.md'] }),
    ).rejects.toThrow(/web: production moved to .* refusing to report/);
    expect(world.pointCalls).toEqual([]);
  });

  it('leaves a project alone when another actor moved production before the rollback', async () => {
    // 我々の promote 後に人が hotfix を promote した場合。ここで entry.previous を
    // promote すると、その hotfix を古い deployment で上書きしてしまう。
    // 1-3回目=promote まで, 4回目=promote 反映確認, 5回目以降=外部が hotfix へ移動。
    const world = createReleaseWorld({
      webAliasSequence: [
        'dpl_web_old',
        'dpl_web_old',
        'dpl_web_old',
        'dpl_web_new',
        'dpl_web_hotfix',
      ],
    });

    const error = await release({ fetchImpl: world.fetchImpl }).catch((thrown: Error) => thrown);

    expect(error.message).toMatch(/Left alone because another actor moved production first: web/);
    // web は外部の hotfix が乗っているので触らない。product だけ戻す。
    expect(world.rolledBack()).toEqual(['product']);
  });

  it('sends no bypass secret to the production domains', async () => {
    // production domain に Deployment Protection が付く設定事故を捕まえるための
    // smoke なので、bypass header で迂回してはいけない。
    const world = createReleaseWorld();
    const headers: (HeadersInit | undefined)[] = [];
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).startsWith('https://dayopt.app')) headers.push(init?.headers);
      return world.fetchImpl(input, init);
    });

    await release({ fetchImpl });

    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(JSON.stringify(header)).not.toContain(BYPASS);
      expect(header).not.toHaveProperty('x-vercel-protection-bypass');
    }
  });

  it('rolls back this run own promote when the production smoke fails', async () => {
    const world = createReleaseWorld();

    await expect(
      release({
        fetchImpl: world.fetchImpl,
        diffFilesImpl: () => ['apps/product/src/app/page.tsx'],
        simulateFailure: 'production-smoke:web',
      }),
    ).rejects.toThrow(/Simulated failure at production-smoke:web/);

    // web は promote していないので rollback 対象外。product だけ戻す。
    expect(world.promoted()).toEqual(['product']);
    expect(world.rolledBack()).toEqual(['product']);
  });

  it('keeps a project it did not promote out of the rollback scope', async () => {
    // web は前の run から対象 SHA を配信している。戻し先が無いので rollback せず、
    // 名指しだけして人の判断に委ねる。
    const world = createReleaseWorld({ webAlreadyAtTarget: true });

    const error = await release({
      fetchImpl: world.fetchImpl,
      simulateFailure: 'promote:product',
    }).catch((thrown: Error) => thrown);

    expect(error.message).toMatch(/Simulated failure at promote:product/);
    expect(world.rolledBack()).toEqual([]);
    expect(error.message).toMatch(/Outside this run's rollback scope: web/);
  });

  it('records each project deployment id and source SHA in the manifest', async () => {
    const world = createReleaseWorld();

    const result = await release({
      fetchImpl: world.fetchImpl,
      diffFilesImpl: () => ['apps/product/src/app/page.tsx'],
    });

    expect(result.manifest).toMatchObject({ sha: SHA, status: 'promoted' });
    expect(result.manifest.projects).toEqual([
      expect.objectContaining({
        name: 'web',
        affected: false,
        action: 'skipped',
        deploymentId: 'dpl_web_old',
        sourceSha: OLD_SHA,
      }),
      expect.objectContaining({
        name: 'product',
        affected: true,
        action: 'promoted',
        deploymentId: 'dpl_product_new',
        sourceSha: SHA,
        previousDeploymentId: 'dpl_product_old',
      }),
    ]);
  });

  it('keeps rolled-back projects out of the surviving list when a rollback strands one', async () => {
    // 両方 promote 後に失敗し、web の rollback だけが失敗する。戻せた product を
    // 「新 SHA 配信中」と記録すると、復旧の担当者が触る必要のない側を触る。
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).includes('/promote/dpl_web_old'))
        return new Response(null, { status: 500 });
      return world.fetchImpl(input, init);
    });

    const error = await release({
      fetchImpl,
      simulateFailure: 'production-smoke:web',
    }).catch(
      (thrown: Error & { manifest?: { projects: { name: string; action: string }[] } }) => thrown,
    );

    expect(error.message).toContain('MANUAL ROLLBACK REQUIRED');
    expect(world.rolledBack()).toEqual(['product']);
    expect(error.manifest?.projects).toEqual([
      // 戻せなかった側だけが新 SHA を配信している。
      expect.objectContaining({ name: 'web', action: 'promoted', deploymentId: 'dpl_web_new' }),
      expect.objectContaining({
        name: 'product',
        action: 'rolled-back',
        deploymentId: 'dpl_product_old',
      }),
    ]);
  });

  it('records a candidate another actor promoted as live, not pending', async () => {
    // gate 実行中に外部 actor が同じ candidate を promote した場合。この run は
    // 動かしていないが live ではあるので、未着手に見せない。
    const world = createReleaseWorld({
      webAliasSequence: ['dpl_web_old', 'dpl_web_old', 'dpl_web_new'],
    });

    const result = await release({ fetchImpl: world.fetchImpl });

    expect(result.status).toBe('promoted');
    expect(world.promoted()).toEqual(['product']);
    expect(result.manifest.projects).toContainEqual(
      expect.objectContaining({
        name: 'web',
        action: 'already-serving',
        deploymentId: 'dpl_web_new',
        sourceSha: SHA,
        observedAt: 'this-run',
      }),
    );
  });

  it('records the surviving deployment when the run fails after a promote', async () => {
    // 部分失敗の復旧では、手動 rollback 先が manifest から読めることが要件。
    const world = createReleaseWorld();
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      if (String(input).includes('/promote/dpl_web_old'))
        return new Response(null, { status: 500 });
      return world.fetchImpl(input, init);
    });

    const error = await release({ fetchImpl, simulateFailure: 'promote:product' }).catch(
      (thrown: Error & { manifest?: { projects: { name: string; action: string }[] } }) => thrown,
    );

    expect(error.manifest?.status).toBe('failed');
    expect(error.manifest?.projects).toContainEqual(
      expect.objectContaining({ name: 'web', action: 'promoted', deploymentId: 'dpl_web_new' }),
    );
  });
});

describe('writeReleaseManifest', () => {
  it('writes the manifest only when a path is configured', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'release-manifest-')), 'manifest.json');
    const manifest = { sha: SHA, status: 'promoted', projects: [] };

    expect(writeReleaseManifest(manifest, { env: {} })).toBe(false);
    expect(writeReleaseManifest(manifest, { env: { RELEASE_MANIFEST_PATH: path } })).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(manifest);
  });
});

describe('writeReleaseStatus', () => {
  function outputFile() {
    return join(mkdtempSync(join(tmpdir(), 'release-status-')), 'output.txt');
  }

  it('writes each known status for the workflow to branch on', () => {
    for (const status of ['already-released', 'promoted', 'superseded', 'unaffected', 'failed']) {
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
