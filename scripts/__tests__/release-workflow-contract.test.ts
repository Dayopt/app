import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORST_CASE_RELEASE_MS } from '../production-release.mjs';

/**
 * Production Release workflow は Vercel の promote / rollback 権限を持つ token を
 * 扱うため、信頼境界を YAML の形で固定する。bash step は unit test できないので、
 * 壊れたら Production に影響する制御だけを contract として検査する。
 */
const WORKFLOWS = join(process.cwd(), '.github/workflows');

function workflow(name: string) {
  return readFileSync(join(WORKFLOWS, name), 'utf8');
}

describe('release workflow contract', () => {
  const release = workflow('release.yml');

  it('has no push trigger; promote is manual dispatch only (#2268)', () => {
    // main push で自動 promote すると、merge のたびに Production domain が
    // 切り替わる。#2268 でこれを廃止し、workflow_dispatch のみへ一本化した。
    // 再発すると意図しない自動 promote が復活するため、on: ブロック全体を
    // 検査して push: を含まないことを固定する。
    const onBlock = release.slice(release.indexOf('\non:'), release.indexOf('\npermissions:'));
    expect(onBlock).not.toMatch(/^\s*push:/m);
    expect(onBlock).toMatch(/^\s*workflow_dispatch:/m);
  });

  it('never checks out a caller-supplied ref', () => {
    // ref に inputs.sha を渡すと、未 merge の commit が持つ script が
    // Production secret 付きで実行される。これが唯一の実効的な防御。
    const checkoutBlock = release.slice(
      release.indexOf('actions/checkout'),
      release.indexOf('actions/setup-node'),
    );
    expect(checkoutBlock).toContain('persist-credentials: false');
    expect(checkoutBlock).not.toMatch(/^\s*ref:/m);
  });

  it('validates the SHA shape before using it in an API path', () => {
    const shapeCheck = release.indexOf('40 character commit SHA');
    const compareCall = release.indexOf('compare/heads/main');
    expect(shapeCheck).toBeGreaterThan(-1);
    expect(compareCall).toBeGreaterThan(shapeCheck);
  });

  it('accepts only commits already merged into main', () => {
    expect(release).toContain('compare/heads/main...$sha');
    expect(release).toContain('"$status" != "identical" ] && [ "$status" != "behind"');
    // ahead / diverged を許可に足すと未 merge の commit が Production へ出る。
    expect(release).not.toMatch(/status" = "(ahead|diverged)"/);
  });

  it('keeps the compare check fail-closed', () => {
    // export / local を前置すると command substitution の終了ステータスが
    // 代入文に伝わらず、gh の失敗が握り潰される。
    expect(release).not.toMatch(/^\s*(export|local|declare)\s+status=\$\(/m);
  });

  it('publishes the commit status only for a resolved SHA', () => {
    expect(release).toContain("if: always() && steps.target.outputs.sha != ''");
    expect(release).toContain('statuses/$RELEASE_SHA');
    // caller の入力を status API のパスへ直接入れない。
    expect(release).not.toContain('statuses/${{ inputs.sha }}');
  });

  it('checks out enough history to diff against the live production SHA', () => {
    // shallow clone だと過去の production SHA が checkout に無く、影響判定が毎回
    // fail closed へ落ちる。安全側ではあるが affected-aware 化が無効化される。
    const checkoutBlock = release.slice(
      release.indexOf('actions/checkout'),
      release.indexOf('actions/setup-node'),
    );
    expect(checkoutBlock).toMatch(/^\s*fetch-depth:\s*0\s*$/m);
  });

  it('treats a no-op release as success', () => {
    // app へ影響しない merge（docs / CI 設定）は promote が 0 件でも live 相当。
    // ここで failure にすると、その commit へ永久に tag を打てなくなる。
    const publishStep = release.slice(release.indexOf('Publish Production Release status'));
    expect(publishStep).toMatch(/RELEASE_STATUS" = "unaffected"[\s\S]{0,200}state=success/);
    // 合否側でも unaffected を落とさない（superseded だけが失敗）。
    const enforceStep = release.slice(release.indexOf('Enforce release result'));
    expect(enforceStep).not.toContain('unaffected');
    expect(enforceStep).toContain('"$RELEASE_STATUS" = "superseded"');
  });

  it('keeps the release manifest even when the run fails', () => {
    // project ごとに live SHA が分かれうるため、部分失敗の復旧では manifest が
    // 手動 rollback 先の一次情報になる。失敗時に落とすと復旧の手掛かりが消える。
    expect(release).toContain('RELEASE_MANIFEST_PATH: release-manifest.json');
    const uploadStep = release.slice(release.indexOf('Upload release manifest'));
    expect(uploadStep).toMatch(/if:\s*always\(\)/);
    expect(uploadStep).toContain('path: release-manifest.json');
  });

  it('scopes the release manifest artifact name by run attempt', () => {
    // 同名 artifact は同一 run 内で 2 度 upload できない。re-run（workflow の
    // 再試行）すると 1 回目の attempt が既に同名を使っているため upload が失敗し、
    // 手動 rollback の一次情報である manifest が re-run 側では 1 つも残らない。
    const uploadStep = release.slice(release.indexOf('Upload release manifest'));
    expect(uploadStep).toContain('name: release-manifest-${{ github.run_attempt }}');
    expect(uploadStep).not.toMatch(/^\s*name:\s*release-manifest\s*$/m);
  });

  it('refuses to call a superseded commit live', () => {
    // superseded は promote 0 件。success を publish すると create-release.yml の
    // gate を素通りし、live でない commit に Release が作られる。
    expect(release).toContain('steps.release.outputs.release_status');
    const publishStep = release.slice(release.indexOf('Publish Production Release status'));
    expect(publishStep).toMatch(/RELEASE_STATUS" = "superseded"[\s\S]{0,200}state=failure/);
  });

  it('verifies layer-3 (heavy-tier) checks are green before promoting (#2269)', () => {
    // CI 4 層再設計で E2E / Web E2E / Integration Tests は per-PR から撤去され、
    // main push 後の層 3 だけが検証する。promote 前にこの gate が無いと、
    // 壊れた main がそのまま Production へ昇格しうる。
    const gateStep = release.slice(
      release.indexOf('Verify heavy-tier (layer 3) checks are green'),
      release.indexOf('Wait, smoke, and promote Production'),
    );
    expect(gateStep.length).toBeGreaterThan(0);

    // 3 context すべてを検証する
    for (const context of ['🎭 E2E Tests', '🌐 Web Build & E2E', 'Integration Tests']) {
      expect(gateStep).toContain(context);
    }

    // force（break-glass）時のみ skip する。既存の smoke/audit skip と同じ条件式。
    expect(gateStep).toMatch(/if:\s*'!inputs\.force'/);

    // 見つからない・pending・failure はすべて exit 1（fail closed）に倒す
    expect(gateStep).toContain('exit 1');
  });

  it('allows more wall clock than the script can consume', () => {
    // job が先に kill されると、rollback 途中の片系 promote が
    // 手動 rollback の手掛かり（run summary の previous id）ごと消える。
    const timeoutMinutes = Number(release.match(/timeout-minutes:\s*(\d+)/)?.[1]);
    expect(timeoutMinutes).toBeGreaterThan(0);
    expect(timeoutMinutes * 60_000).toBeGreaterThan(WORST_CASE_RELEASE_MS);
    // checkout / setup / API 往復のぶんの余裕も残す。
    expect(timeoutMinutes * 60_000 - WORST_CASE_RELEASE_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('attaches the job to an environment that can gate non-main dispatches', () => {
    expect(release).toMatch(/^\s*environment:\s*production-release\s*$/m);
  });

  it('gates GitHub Release creation on a live Production Release status', () => {
    const createRelease = workflow('create-release.yml');
    expect(createRelease).toContain('Production Release');
    expect(createRelease).toContain('"$state" != "success"');
  });

  it('keeps the audit workflow pinned to its trusted base revision', () => {
    // release.yml と対称に「掃除」されないよう固定する。pull_request_target で
    // PR head を checkout すると、PR code が Vercel token を読める。
    const audit = workflow('production-config-audit.yml');
    expect(audit).toContain('ref: ${{ github.event.pull_request.base.sha || github.sha }}');
  });
});
