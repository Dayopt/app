import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectPreflight, renderPreflight } from './agent-preflight.mjs';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dayopt-preflight-'));
  dirs.push(root);
  expect(spawnSync('git', ['init', '-q'], { cwd: root }).status).toBe(0);
  writeFileSync(join(root, '.nvmrc'), '24');
  return root;
}
describe('agent preflight', () => {
  it('reports missing dependencies and hooks, never marks runtime hooks as active', () => {
    const root = fixture();
    const state = collectPreflight(root);
    expect(state.dependencies).toBe(false);
    expect(state.hooks['pre-push']).toBe(false);
    expect(renderPreflight(state)).toContain('commit / push 前に');
  });
  it('uses repository root from a subdirectory and verifies configured hook files', () => {
    const root = fixture();
    for (const dir of [
      'src/deep',
      'node_modules/.pnpm',
      '.husky/_',
      '.agents/skills/routing',
      '.codex',
    ])
      mkdirSync(join(root, dir), { recursive: true });
    for (const name of ['pre-commit', 'pre-push']) {
      writeFileSync(join(root, '.husky/_', name), '#!/bin/sh\n');
      writeFileSync(join(root, '.husky', name), 'true\n');
    }
    writeFileSync(join(root, '.agents/skills/routing/SKILL.md'), 'test');
    writeFileSync(join(root, '.codex/hooks.json'), '{}');
    expect(spawnSync('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: root }).status).toBe(
      0,
    );
    const state = collectPreflight(join(root, 'src/deep'));
    expect(state.root).toBe(root.replace(/^\/var\//, '/private/var/'));
    expect(state.dependencies).toBe(true);
    expect(state.hooks['pre-push']).toBe(true);
    expect(state.skills).toBe(true);
    expect(state.codexHooks).toContain('unverified');
  });
  it('CLI exits nonzero on missing prerequisites and supports JSON', () => {
    const root = fixture();
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/tasks/agent-preflight.mjs'), '--json'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).dependencies).toBe(false);
  });
});
