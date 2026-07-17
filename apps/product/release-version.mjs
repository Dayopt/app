import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
export const rootPackageJsonPath = join(moduleDirectory, '../../package.json');

export function parseReleaseVersion(packageJsonText) {
  const manifest = JSON.parse(packageJsonText);
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('Root package.json must define a release version');
  }
  return manifest.version;
}

export const releaseVersion = parseReleaseVersion(readFileSync(rootPackageJsonPath, 'utf8'));
