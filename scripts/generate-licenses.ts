#!/usr/bin/env tsx
/**
 * License Information Generator
 *
 * OSS依存関係のライセンス情報を自動生成
 *
 * 実行方法:
 * ```bash
 * pnpm generate-licenses
 * ```
 *
 * 生成物:
 * 1. apps/product/public/legal/oss-credits.json - Web表示用JSON
 * 2. apps/product/public/legal/THIRD_PARTY_NOTICES.txt - Apache-2.0 NOTICEファイル集約
 *
 * @see Issue #545 - 第三者ライセンス表記整備 Phase 2
 * @see Issue #1436 - monorepo production transitive dependency support
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT_PACKAGE_NAME = '@dayopt/product';
const GENERATED_FILE_NAMES = ['oss-credits.json', 'THIRD_PARTY_NOTICES.txt'] as const;

type GeneratedFileName = (typeof GENERATED_FILE_NAMES)[number];

interface LicenseInfo {
  licenses: string;
  repository?: string;
  publisher?: string;
  copyright?: string;
  packagePath?: string;
}

/**
 * 公開用クレジット情報の型定義
 */
interface CreditInfo {
  name: string;
  version: string;
  license: string;
  repository?: string;
  publisher?: string;
  copyright?: string;
}

interface PnpmLicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  author?: string;
  homepage?: string;
}

interface PackageMetadata {
  repository?: string;
  author?: string;
  homepage?: string;
  copyright?: string;
}

interface LicenseGenerationContext {
  packageDir: string;
  packageName: string;
  workspaceRoot: string;
}

interface LicenseArtifacts {
  files: Record<GeneratedFileName, string>;
  outputDir: string;
  noticeCount: number;
  licenseStats: Record<string, number>;
}

/**
 * メイン処理
 */
export function generateLicenses(args = process.argv.slice(2)): void {
  if (args.includes('--help')) {
    printHelp();
    return;
  }

  const checkOnly = args.includes('--check');
  const unknownArgs = args.filter((arg) => arg !== '--check');
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArgs.join(', ')}`);
  }

  console.log('📄 License Information Generator');
  console.log('='.repeat(50));

  const context = resolveGenerationContext();

  // 1. pnpmでproduction dependency treeのライセンス情報を収集
  console.log('\n📦 Collecting dependency licenses...');
  const packages = collectLicenses(context);
  console.log(`   ✅ Found ${Object.keys(packages).length} packages`);

  // 2. 生成物を組み立てる
  const artifacts = buildLicenseArtifacts(packages, context.packageDir);
  console.log('\n📋 Extracting Apache-2.0 NOTICE files...');
  console.log(`   ✅ Found ${artifacts.noticeCount} NOTICE files`);

  if (checkOnly) {
    checkGeneratedFiles(artifacts);
    console.log('\n✅ License generated files are up to date!');
    console.log('='.repeat(50));
    return;
  }

  // 3. JSON形式で公開用データを生成
  console.log('\n🔧 Generating oss-credits.json...');
  ensureOutputDir(artifacts.outputDir);
  const jsonPath = join(artifacts.outputDir, 'oss-credits.json');
  writeFileSync(jsonPath, artifacts.files['oss-credits.json'], 'utf-8');
  console.log(`   ✅ Created: ${jsonPath}`);

  // 4. THIRD_PARTY_NOTICES.txt を生成
  console.log('\n📝 Generating THIRD_PARTY_NOTICES.txt...');
  const noticesPath = join(artifacts.outputDir, 'THIRD_PARTY_NOTICES.txt');
  writeFileSync(noticesPath, artifacts.files['THIRD_PARTY_NOTICES.txt'], 'utf-8');
  console.log(`   ✅ Created: ${noticesPath}`);

  // 5. 統計情報を表示
  console.log('\n📊 License Statistics:');
  Object.entries(artifacts.licenseStats)
    .sort(([, a], [, b]) => b - a)
    .forEach(([license, count]) => {
      console.log(`   ${license}: ${count} packages`);
    });

  console.log('\n✅ License information generated successfully!');
  console.log('='.repeat(50));
}

/**
 * pnpm licenses listで依存関係のライセンス情報を収集
 */
function collectLicenses(context: LicenseGenerationContext): Record<string, LicenseInfo> {
  const output = execFileSync(
    'pnpm',
    [
      '--filter',
      getProductionDependencyFilter(context.packageName),
      'licenses',
      'list',
      '--prod',
      '--json',
      '--long',
    ],
    {
      cwd: context.workspaceRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return parsePnpmLicenses(output);
}

export function getProductionDependencyFilter(packageName: string): string {
  return `${packageName}...`;
}

export function parsePnpmLicenses(raw: string): Record<string, LicenseInfo> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error('pnpm licenses output must be a JSON object');
  }

  const packages: Record<string, LicenseInfo> = {};

  Object.entries(parsed).forEach(([licenseName, entries]) => {
    if (!Array.isArray(entries)) {
      throw new Error(`pnpm licenses output for ${licenseName} must be an array`);
    }

    entries.forEach((entry) => {
      const licenseEntry = parsePnpmLicenseEntry(entry, licenseName);
      licenseEntry.versions.forEach((version) => {
        const key = `${licenseEntry.name}@${version}`;
        const packagePath = findPackagePathForVersion(licenseEntry, version);
        const metadata = packagePath ? readPackageMetadata(packagePath) : {};

        const repository = normalizeRepository(metadata.repository ?? licenseEntry.homepage);
        const publisher = metadata.author ?? licenseEntry.author;
        packages[key] = {
          licenses: licenseEntry.license,
          ...(repository ? { repository } : {}),
          ...(publisher ? { publisher } : {}),
          ...(metadata.copyright ? { copyright: metadata.copyright } : {}),
          ...(packagePath ? { packagePath } : {}),
        };
      });
    });
  });

  return packages;
}

/**
 * Apache-2.0のNOTICEファイルを抽出
 */
function extractNotices(packages: Record<string, LicenseInfo>): string[] {
  const notices: string[] = [];

  Object.entries(packages).forEach(([name, info]) => {
    if (info.licenses.includes('Apache-2.0') && info.packagePath) {
      const noticeFile = findNoticeFile(info.packagePath);

      if (existsSync(noticeFile)) {
        try {
          const noticeContent = readFileSync(noticeFile, 'utf-8');
          notices.push(`\n${'='.repeat(80)}\n${name}\n${'='.repeat(80)}\n\n${noticeContent}`);
        } catch (error) {
          console.warn(`   ⚠️  Failed to read NOTICE for ${name}:`, error);
        }
      }
    }
  });

  return notices;
}

/**
 * 公開用のクレジット情報を生成
 */
export function generateCredits(packages: Record<string, LicenseInfo>): CreditInfo[] {
  return Object.entries(packages)
    .map(([nameWithVersion, info]) => {
      // "package@version" の形式から name と version を分離
      const lastAtIndex = nameWithVersion.lastIndexOf('@');
      const name = nameWithVersion.substring(0, lastAtIndex);
      const version = nameWithVersion.substring(lastAtIndex + 1);

      return {
        name,
        version,
        license: info.licenses,
        ...(info.repository ? { repository: info.repository } : {}),
        ...(info.publisher ? { publisher: info.publisher } : {}),
        ...(info.copyright ? { copyright: info.copyright } : {}),
      };
    })
    .sort((a, b) => {
      const nameOrder = a.name.localeCompare(b.name);
      return nameOrder === 0 ? a.version.localeCompare(b.version) : nameOrder;
    });
}

/**
 * THIRD_PARTY_NOTICES.txt ファイルの内容を生成
 */
export function generateNoticesFile(notices: string[]): string {
  const header = `Dayopt - Third Party Notices

This file contains notices for third-party software components included in this project.

Apache License 2.0 - NOTICE Files
${'-'.repeat(80)}

The following components are licensed under the Apache License 2.0 and include
NOTICE files that must be preserved according to the license terms.

`;

  const footer = `
${'-'.repeat(80)}

For a complete list of all third-party software and their licenses,
please visit: /legal/oss-credits

Generated by scripts/generate-licenses.ts.
`;

  if (notices.length === 0) {
    return header + '\n(No Apache-2.0 packages with NOTICE files found)\n' + footer;
  }

  return header + notices.join('\n\n') + footer;
}

/**
 * ライセンスごとの統計を計算
 */
function calculateLicenseStats(packages: Record<string, LicenseInfo>): Record<string, number> {
  const stats: Record<string, number> = {};

  Object.values(packages).forEach((info) => {
    const license = info.licenses;
    stats[license] = (stats[license] || 0) + 1;
  });

  return stats;
}

function buildLicenseArtifacts(
  packages: Record<string, LicenseInfo>,
  packageDir: string,
): LicenseArtifacts {
  const notices = extractNotices(packages);
  const credits = generateCredits(packages);
  const outputDir = join(packageDir, 'public', 'legal');

  return {
    files: {
      'oss-credits.json': `${JSON.stringify(credits, null, 2)}\n`,
      'THIRD_PARTY_NOTICES.txt': generateNoticesFile(notices),
    },
    outputDir,
    noticeCount: notices.length,
    licenseStats: calculateLicenseStats(packages),
  };
}

function checkGeneratedFiles(artifacts: LicenseArtifacts): void {
  const staleFiles = GENERATED_FILE_NAMES.filter((fileName) => {
    const filePath = join(artifacts.outputDir, fileName);
    if (!existsSync(filePath)) {
      return true;
    }

    const currentContent = normalizeGeneratedFileForCheck(
      fileName,
      readFileSync(filePath, 'utf-8'),
    );
    const expectedContent = normalizeGeneratedFileForCheck(fileName, artifacts.files[fileName]);

    return currentContent !== expectedContent;
  });

  if (staleFiles.length === 0) {
    return;
  }

  console.error('\n❌ License generated files are out of date:');
  staleFiles.forEach((fileName) => {
    console.error(`   - ${join(artifacts.outputDir, fileName)}`);
  });
  console.error('\nRun `pnpm generate-licenses` and commit the updated files.');
  process.exit(1);
}

export function normalizeGeneratedFileForCheck(
  fileName: GeneratedFileName,
  content: string,
): string {
  if (fileName !== 'oss-credits.json') {
    return content;
  }

  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    return content;
  }

  const credits = parsed.filter((item) => {
    if (!isCreditInfo(item)) {
      return true;
    }

    return !isPlatformSpecificCredit(item);
  });

  return `${JSON.stringify(credits, null, 2)}\n`;
}

function isCreditInfo(value: unknown): value is CreditInfo {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.version === 'string' &&
    typeof value.license === 'string'
  );
}

function isPlatformSpecificCredit(credit: Pick<CreditInfo, 'name'>): boolean {
  return (
    credit.name.startsWith('@esbuild/') ||
    credit.name.startsWith('@img/sharp-') ||
    credit.name.startsWith('@next/swc-') ||
    credit.name.startsWith('@parcel/watcher-') ||
    credit.name.startsWith('@rollup/rollup-') ||
    credit.name.startsWith('@sentry/cli-') ||
    credit.name.startsWith('@swc/core-') ||
    credit.name === 'fsevents'
  );
}

function ensureOutputDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function parsePnpmLicenseEntry(value: unknown, fallbackLicense: string): PnpmLicenseEntry {
  if (!isRecord(value)) {
    throw new Error('pnpm license entry must be an object');
  }

  const name = getRequiredString(value, 'name');
  const versions = getRequiredStringArray(value, 'versions');
  const paths = getOptionalStringArray(value, 'paths') ?? [];
  const license = getOptionalString(value, 'license') ?? fallbackLicense;

  return {
    name,
    versions,
    paths,
    license,
    ...(getOptionalString(value, 'author') ? { author: getOptionalString(value, 'author') } : {}),
    ...(getOptionalString(value, 'homepage')
      ? { homepage: getOptionalString(value, 'homepage') }
      : {}),
  };
}

function resolveGenerationContext(): LicenseGenerationContext {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const packageDir = resolveProductPackageDir(workspaceRoot, process.cwd());
  const packageName = readPackageName(packageDir);

  return {
    packageDir,
    packageName,
    workspaceRoot,
  };
}

function findWorkspaceRoot(startDir: string): string {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return resolve(startDir);
    }

    currentDir = parentDir;
  }
}

function resolveProductPackageDir(workspaceRoot: string, cwd: string): string {
  const cwdPackageName = readPackageNameIfExists(cwd);
  if (cwdPackageName === PRODUCT_PACKAGE_NAME) {
    return resolve(cwd);
  }

  const packageDir = join(workspaceRoot, 'apps', 'product');
  if (readPackageNameIfExists(packageDir) === PRODUCT_PACKAGE_NAME) {
    return packageDir;
  }

  throw new Error(`Could not find ${PRODUCT_PACKAGE_NAME} package directory`);
}

function readPackageName(packageDir: string): string {
  const packageName = readPackageNameIfExists(packageDir);
  if (!packageName) {
    throw new Error(`package.json name is missing in ${packageDir}`);
  }

  return packageName;
}

function readPackageNameIfExists(packageDir: string): string | undefined {
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return undefined;
  }

  const parsed = readJsonFile(packageJsonPath);
  if (!isRecord(parsed)) {
    return undefined;
  }

  return getOptionalString(parsed, 'name');
}

function findPackagePathForVersion(
  entry: Pick<PnpmLicenseEntry, 'paths' | 'versions'>,
  version: string,
): string | undefined {
  if (entry.paths.length === 0) {
    return undefined;
  }

  const exactPath = entry.paths.find((packagePath) => {
    const metadata = readPackageMetadata(packagePath);
    return metadata.version === version;
  });

  return exactPath ?? entry.paths[0];
}

function readPackageMetadata(packageDir: string): PackageMetadata & { version?: string } {
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {};
  }

  const parsed = readJsonFile(packageJsonPath);
  if (!isRecord(parsed)) {
    return {};
  }

  return {
    ...(getOptionalString(parsed, 'version')
      ? { version: getOptionalString(parsed, 'version') }
      : {}),
    ...(normalizeRepository(parsed.repository)
      ? { repository: normalizeRepository(parsed.repository) }
      : {}),
    ...(normalizeAuthor(parsed.author) ? { author: normalizeAuthor(parsed.author) } : {}),
    ...(getOptionalString(parsed, 'homepage')
      ? { homepage: getOptionalString(parsed, 'homepage') }
      : {}),
    ...(getOptionalString(parsed, 'copyright')
      ? { copyright: getOptionalString(parsed, 'copyright') }
      : {}),
  };
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

function findNoticeFile(packagePath: string): string {
  if (!existsSync(packagePath)) {
    return join(packagePath, 'NOTICE');
  }

  const noticeFileName = readdirSync(packagePath).find((fileName) =>
    /^notice(\..*)?$/i.test(fileName),
  );

  return join(packagePath, noticeFileName ?? 'NOTICE');
}

function normalizeRepository(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return stripGitProtocol(value);
  }

  if (isRecord(value)) {
    const url = getOptionalString(value, 'url');
    return url ? stripGitProtocol(url) : undefined;
  }

  return undefined;
}

function stripGitProtocol(value: string): string {
  return value.startsWith('git+') ? value.slice('git+'.length) : value;
}

function normalizeAuthor(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (isRecord(value)) {
    return getOptionalString(value, 'name');
  }

  return undefined;
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = getOptionalString(record, key);
  if (!value) {
    throw new Error(`Expected pnpm license entry to include string field: ${key}`);
  }

  return value;
}

function getOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRequiredStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = getOptionalStringArray(record, key);
  if (!value || value.length === 0) {
    throw new Error(`Expected pnpm license entry to include string array field: ${key}`);
  }

  return value;
}

function getOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function printHelp(): void {
  console.log(`Usage: pnpm generate-licenses [--check]

Options:
  --check  Verify generated license files are up to date without writing files.
`);
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? resolve(entryPoint) === fileURLToPath(import.meta.url) : false;
}

if (isMainModule()) {
  try {
    generateLicenses();
  } catch (error) {
    console.error('\n❌ Error generating licenses:', error);
    process.exit(1);
  }
}
