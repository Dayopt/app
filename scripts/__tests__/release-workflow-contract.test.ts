import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

  it('refuses to call a superseded commit live', () => {
    // superseded は promote 0 件。success を publish すると create-release.yml の
    // gate を素通りし、live でない commit に Release が作られる。
    expect(release).toContain('steps.release.outputs.release_status');
    const publishStep = release.slice(release.indexOf('Publish Production Release status'));
    expect(publishStep).toMatch(/RELEASE_STATUS" = "superseded"[\s\S]{0,200}state=failure/);
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
