import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SCHEMAS } from '../lib/review-contract.mjs';
import { createReviewPack, schemaErrors, validateReview } from './review-pack.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'dayopt-review-pack-'));
  dirs.push(cwd);
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Review Fixture');
  git('config', 'user.email', 'review@example.invalid');
  writeFileSync(join(cwd, 'logic.ts'), 'export const value = 1;\n');
  git('add', 'logic.ts');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'logic.ts', 'renamed.ts');
  writeFileSync(join(cwd, 'renamed.ts'), 'export const value = 2;\n');
  git('add', 'renamed.ts');
  git('commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'renamed.ts'), 'UNCOMMITTED - must not enter review\n');
  const context = join(cwd, 'context.md');
  const verification = join(cwd, 'verification.md');
  writeFileSync(context, '目的: 値の変更。受け入れ条件: 2を返す。\n');
  writeFileSync(verification, '検証: 未実行。理由: fixture。\n');
  const out = join(cwd, 'pack');
  return { cwd, base, head, context, verification, out, git };
}
function envelope(manifest: { packId: string; baseSha: string; headSha: string }) {
  return {
    packId: manifest.packId,
    baseSha: manifest.baseSha,
    headSha: manifest.headSha,
    provider: 'OpenAI',
    model: 'fixture',
    modelFamily: 'GPT',
    sessionId: 'independent-fixture',
    independence: 'separate-session',
    role: 'behavior-verifier',
    result: {
      role: 'behavior-verifier',
      scopeChecked: ['logic.ts → renamed.ts'],
      facts: ['value changes from 1 to 2'],
      expectedTransitions: [],
      findings: [],
      counterevidence: [],
      unknowns: [],
      coverage: 'complete',
      recommendation: 'proceed',
      recommendationReason: 'Fixture contract matches',
    },
  };
}

describe('portable review pack', () => {
  it('pins committed base/head, includes both sides of rename and excludes uncommitted edits', () => {
    const f = fixture();
    const manifest = createReviewPack(f);
    expect(manifest.baseSha).toBe(f.base);
    expect(manifest.headSha).toBe(f.head);
    const sources = readFileSync(join(f.out, 'sources.json'), 'utf8');
    expect(sources).toContain('value = 1');
    expect(sources).toContain('value = 2');
    expect(sources).not.toContain('UNCOMMITTED');
    expect(manifest.changedPaths).toEqual(['logic.ts', 'renamed.ts']);
    expect(manifest.omissions.some((line: string) => line.includes('AGENTS.md'))).toBe(true);
    expect(readFileSync(join(f.out, 'behavior-verifier.prompt.md'), 'utf8')).toContain(f.head);
    expect(validateReview(f.out, envelope(manifest)).status).toBe('reviewed');
  });
  it('distinguishes unperformed, stale, partial and invalid from reviewed with zero findings', () => {
    const f = fixture();
    const manifest = createReviewPack(f);
    const result = envelope(manifest);
    expect(validateReview(f.out).status).toBe('not-run');
    expect(validateReview(f.out).findings).toBeNull();
    expect(validateReview(f.out, { ...result, headSha: f.base }).status).toBe('stale');
    expect(
      validateReview(f.out, {
        ...result,
        result: { ...result.result, coverage: 'partial', unknowns: ['caller not supplied'] },
      }).status,
    ).toBe('partial');
    expect(
      validateReview(f.out, { ...result, result: { ...result.result, scopeChecked: [] } }).status,
    ).toBe('invalid');
    expect(validateReview(f.out, { ...result, provider: '' }).status).toBe('invalid');
    expect(validateReview(f.out, {}).status).toBe('invalid');
    expect(
      validateReview(f.out, { ...result, result: { ...result.result, scopeChecked: ['  '] } })
        .status,
    ).toBe('invalid');
    expect(validateReview(f.out, { ...result, role: '__proto__' }).status).toBe('invalid');
    expect(validateReview(f.out, result).findings).toEqual([]);
  });
  it('binds the review to context and verification as well as commit SHAs', () => {
    const f = fixture();
    const old = createReviewPack(f);
    writeFileSync(f.context, '別の受け入れ条件');
    const nextOut = join(f.cwd, 'next');
    const next = createReviewPack({ ...f, out: nextOut });
    expect(next.packId).not.toBe(old.packId);
    expect(validateReview(nextOut, envelope(old)).status).toBe('stale');
    writeFileSync(join(nextOut, 'diff.patch'), 'tampered');
    expect(validateReview(nextOut, envelope(next)).status).toBe('invalid');
  });
  it('refuses to overwrite a previous pack', () => {
    const f = fixture();
    const old = createReviewPack(f);
    expect(() => createReviewPack(f)).toThrow();
    expect(validateReview(f.out, envelope(old)).status).toBe('reviewed');
  });
  it('refuses raw env source and context, including a context symlink', () => {
    const f = fixture();
    expect(() => createReviewPack({ ...f, sources: ['apps/product/.env.local'] })).toThrow(/env/);
    expect(() => createReviewPack({ ...f, sources: ['.envrc'] })).toThrow(/env/);
    expect(() => createReviewPack({ ...f, context: join(f.cwd, '.envrc') })).toThrow(/env/);
    writeFileSync(join(f.cwd, '.env.local'), 'DUMMY_ONLY=fixture');
    const alias = join(f.cwd, 'alias.md');
    symlinkSync('.env.local', alias);
    expect(() => createReviewPack({ ...f, context: alias })).toThrow(/env/);
  });
  it('rejects schema extensions rather than silently ignoring a constraint', () => {
    expect(schemaErrors({ type: 'string', pattern: '^safe$' }, 'unsafe')).not.toEqual([]);
    expect(
      schemaErrors(
        SCHEMAS['behavior-verifier'],
        envelope({ packId: '', baseSha: '', headSha: '' }).result,
      ),
    ).toEqual([]);
  });
  it('CLI exits nonzero for unperformed review; reviewed is transport validity, not a merge decision', () => {
    const f = fixture();
    const manifest = createReviewPack(f);
    const cli = resolve('scripts/tasks/review-pack.mjs');
    const unperformed = spawnSync(process.execPath, [cli, 'validate', '--pack', f.out], {
      encoding: 'utf8',
    });
    expect(unperformed.status).toBe(1);
    expect(JSON.parse(unperformed.stdout).status).toBe('not-run');
    const resultPath = join(f.cwd, 'result.json');
    writeFileSync(
      resultPath,
      JSON.stringify({
        ...envelope(manifest),
        result: { ...envelope(manifest).result, recommendation: 'halt' },
      }),
    );
    const reviewed = spawnSync(
      process.execPath,
      [cli, 'validate', '--pack', f.out, '--result', resultPath],
      { encoding: 'utf8' },
    );
    expect(reviewed.status).toBe(0);
    expect(JSON.parse(reviewed.stdout).recommendation).toBe('halt');
  });
});
