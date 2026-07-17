import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseReleaseVersion, releaseVersion, rootPackageJsonPath } from './release-version.mjs';

describe('Product release version', () => {
  it('root package.jsonをrelease versionの正本として読む', () => {
    expect(rootPackageJsonPath).toBe(resolve(process.cwd(), '../../package.json'));
    const rootManifest = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));

    expect(releaseVersion).toBe(rootManifest.version);
  });

  it('versionがないmanifestを拒否する', () => {
    expect(() => parseReleaseVersion('{}')).toThrow(
      'Root package.json must define a release version',
    );
  });
});
