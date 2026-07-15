import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type PackageContract = {
  engines?: { node?: string };
  devDependencies?: { '@types/node'?: string };
};

const repoRoot = process.cwd();

function readPackageContract(path: string): PackageContract {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as PackageContract;
}

describe('Node.js version contract', () => {
  const runtimeMajor = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim();

  it('aligns deploy-root engines with .nvmrc', () => {
    for (const path of ['package.json', 'apps/web/package.json']) {
      expect(readPackageContract(path).engines?.node, path).toBe(`${runtimeMajor}.x`);
    }
  });

  it('aligns Node.js type definitions with the runtime major', () => {
    for (const path of ['package.json', 'apps/product/package.json', 'apps/web/package.json']) {
      expect(readPackageContract(path).devDependencies?.['@types/node'], path).toMatch(
        new RegExp(`^\\^${runtimeMajor}\\.`),
      );
    }
  });

  it('uses .nvmrc as the GitHub Actions source', () => {
    const setupAction = readFileSync(resolve(repoRoot, '.github/actions/setup/action.yml'), 'utf8');

    expect(setupAction).toContain("default: '.nvmrc'");
    expect(setupAction).toContain('node-version-file: ${{ inputs.node-version-file }}');

    for (const path of [
      '.github/workflows/ci.yml',
      '.github/workflows/docs-guard.yml',
      '.github/workflows/integration.yml',
    ]) {
      const workflow = readFileSync(resolve(repoRoot, path), 'utf8');
      expect(workflow, path).not.toContain('NODE_VERSION');
    }
  });
});
