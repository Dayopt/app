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
 * 1. public/oss-credits.json - Web表示用JSON
 * 2. public/THIRD_PARTY_NOTICES.txt - Apache-2.0 NOTICEファイル集約
 *
 * pnpm workspaceのtransitive production依存を漏れなく収集するため、
 * license-checkerのnode_modules探索ではなく`pnpm licenses list`を使う
 * （apps/product用 scripts/generate-licenses.ts と同じ方式。Issue #1436）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WEB_PACKAGE_NAME = '@dayopt/web';

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

/**
 * メイン処理
 */
function generateLicenses(): void {
  console.log('📄 License Information Generator');
  console.log('='.repeat(50));

  try {
    const workspaceRoot = findWorkspaceRoot(process.cwd());

    // 1. pnpmでproduction dependency treeのライセンス情報を収集
    console.log('\n📦 Collecting dependency licenses...');
    const packages = collectLicenses(workspaceRoot);
    console.log(`   ✅ Found ${Object.keys(packages).length} packages`);

    // 2. Apache-2.0のNOTICEファイルを抽出
    console.log('\n📋 Extracting Apache-2.0 NOTICE files...');
    const notices = extractNotices(packages);
    console.log(`   ✅ Found ${notices.length} NOTICE files`);

    // 3. JSON形式で公開用データを生成
    console.log('\n🔧 Generating oss-credits.json...');
    const credits = generateCredits(packages);
    const outputDir = join(process.cwd(), 'public');
    const jsonPath = join(outputDir, 'oss-credits.json');

    // ディレクトリが存在しない場合は作成
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(jsonPath, `${JSON.stringify(credits, null, 2)}\n`, 'utf-8');
    console.log(`   ✅ Created: ${jsonPath}`);

    // 4. THIRD_PARTY_NOTICES.txt を生成
    console.log('\n📝 Generating THIRD_PARTY_NOTICES.txt...');
    const noticesPath = join(outputDir, 'THIRD_PARTY_NOTICES.txt');
    const noticesContent = generateNoticesFile(notices);
    writeFileSync(noticesPath, noticesContent, 'utf-8');
    console.log(`   ✅ Created: ${noticesPath}`);

    // 5. 統計情報を表示
    console.log('\n📊 License Statistics:');
    const licenseStats = calculateLicenseStats(packages);
    Object.entries(licenseStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([license, count]) => {
        console.log(`   ${license}: ${count} packages`);
      });

    console.log('\n✅ License information generated successfully!');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n❌ Error generating licenses:', error);
    process.exit(1);
  }
}

/**
 * pnpm licenses listで依存関係のライセンス情報を収集（transitive依存を含む）
 */
function collectLicenses(workspaceRoot: string): Record<string, LicenseInfo> {
  const output = execFileSync(
    'pnpm',
    ['--filter', `${WEB_PACKAGE_NAME}...`, 'licenses', 'list', '--prod', '--json', '--long'],
    {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return parsePnpmLicenses(output);
}

function parsePnpmLicenses(raw: string): Record<string, LicenseInfo> {
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
function generateCredits(packages: Record<string, LicenseInfo>): CreditInfo[] {
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
function generateNoticesFile(notices: string[]): string {
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

Generated: ${new Date().toISOString()}
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

// 実行
generateLicenses();
