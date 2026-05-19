#!/usr/bin/env tsx
/**
 * License Risk Checker
 *
 * 依存関係のライセンスリスクを検出
 *
 * 検出項目:
 * 1. 禁止ライセンス（GPL/AGPL/LGPL等）
 * 2. Dual License のリスクパターン（例: MIT OR GPL）
 * 3. MIT* ワイルドカードの詳細
 * 4. ライセンス情報が不明なパッケージ
 *
 * 実行方法:
 * ```bash
 * pnpm license:check-risks
 * ```
 */

// @ts-expect-error - license-checker has incomplete type definitions
import licenseChecker from 'license-checker';
import { readFileSync } from 'node:fs';

interface LicenseInfo {
  licenses: string;
  repository?: string;
  licenseFile?: string;
  publisher?: string;
}

/**
 * 禁止ライセンスのパターン
 */
const PROHIBITED_PATTERNS = [
  /GPL-[0-9.]+/i,
  /AGPL-[0-9.]+/i,
  /LGPL-[0-9.]+/i,
  /EUPL-[0-9.]+/i,
  /CDDL-[0-9.]+/i,
  /EPL-[0-9.]+/i,
];

/**
 * リスクのある Dual License パターン
 */
const RISKY_DUAL_LICENSE_PATTERNS = [
  /\(.*GPL.*\)/i, // (MIT OR GPL), (Apache-2.0 OR GPL) 等
  /\(.*AGPL.*\)/i,
  /\(.*LGPL.*\)/i,
];

/**
 * MIT バリアントのパターン（SPDX非標準）
 */
const MIT_VARIANTS = ['MIT*', 'MIT-0', 'MIT-advertising', 'MIT-CMU', 'MIT-enna', 'MIT-feh'];

/**
 * 非推奨の旧式SPDX識別子（SPDX 3.0以降は非推奨）
 */
const DEPRECATED_SPDX_IDS: Record<string, string> = {
  'GPL-2.0': 'GPL-2.0-only or GPL-2.0-or-later',
  'GPL-3.0': 'GPL-3.0-only or GPL-3.0-or-later',
  'LGPL-2.1': 'LGPL-2.1-only or LGPL-2.1-or-later',
  'LGPL-3.0': 'LGPL-3.0-only or LGPL-3.0-or-later',
  'AGPL-3.0': 'AGPL-3.0-only or AGPL-3.0-or-later',
};

/**
 * メイン処理
 */
async function checkLicenseRisks(): Promise<void> {
  console.log('🔍 License Risk Checker');
  console.log('='.repeat(80));

  try {
    // 1. license-checkerで依存関係を収集
    console.log('\n📦 Collecting dependency licenses...');
    const packages = await collectLicenses();
    console.log(`   ✅ Found ${Object.keys(packages).length} packages`);

    // 3. リスク検出
    console.log('\n🚨 Risk Detection:');
    let riskCount = 0;

    // 3.1. 禁止ライセンスチェック
    console.log('\n   [1] Prohibited Licenses:');
    const prohibitedPackages = findProhibitedLicenses(packages);
    if (prohibitedPackages.length === 0) {
      console.log('      ✅ No prohibited licenses found');
    } else {
      riskCount += prohibitedPackages.length;
      prohibitedPackages.forEach(({ name, license }) => {
        console.log(`      ❌ ${name}: ${license}`);
      });
    }

    // 3.2. Dual License リスクチェック
    console.log('\n   [2] Risky Dual Licenses:');
    const riskyDualLicenses = findRiskyDualLicenses(packages);
    if (riskyDualLicenses.length === 0) {
      console.log('      ✅ No risky dual licenses found');
    } else {
      riskCount += riskyDualLicenses.length;
      riskyDualLicenses.forEach(({ name, license }) => {
        console.log(`      ⚠️  ${name}: ${license}`);
      });
    }

    // 3.3. MIT バリアントチェック
    console.log('\n   [3] MIT Variants:');
    const mitVariants = findMITVariants(packages);
    if (mitVariants.length === 0) {
      console.log('      ✅ No MIT variants found');
    } else {
      mitVariants.forEach(({ name, license, licenseFile }) => {
        console.log(`      ℹ️  ${name}: ${license}`);
        if (licenseFile) {
          const licenseContent = readFileSync(licenseFile, 'utf-8').substring(0, 100);
          console.log(`          License file: ${licenseContent.split('\n')[0]}...`);
        }
      });
    }

    // 3.4. ライセンス不明パッケージ
    console.log('\n   [4] Unknown Licenses:');
    const unknownLicenses = findUnknownLicenses(packages);
    if (unknownLicenses.length === 0) {
      console.log('      ✅ All packages have known licenses');
    } else {
      riskCount += unknownLicenses.length;
      unknownLicenses.forEach(({ name, license }) => {
        console.log(`      ⚠️  ${name}: ${license}`);
      });
    }

    // 3.5. 非推奨のSPDX識別子（SPDX 3.0準拠チェック）
    console.log('\n   [5] Deprecated SPDX Identifiers:');
    const deprecatedSpdxIds = findDeprecatedSpdxIds(packages);
    if (deprecatedSpdxIds.length === 0) {
      console.log('      ✅ All licenses use current SPDX identifiers');
    } else {
      deprecatedSpdxIds.forEach(({ name, license, recommended }) => {
        console.log(`      ℹ️  ${name}: ${license}`);
        console.log(`          Recommended: ${recommended}`);
      });
    }

    // 4. サマリー
    console.log('\n' + '='.repeat(80));
    if (riskCount === 0) {
      console.log('✅ No high-risk licenses detected!');
      console.log(`   Scanned: ${Object.keys(packages).length} packages`);
      console.log('   Status: SAFE');
    } else {
      console.log(`⚠️  Found ${riskCount} potential risks`);
      console.log('   Please review the packages above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error checking licenses:', error);
    process.exit(1);
  }
}

/**
 * license-checkerで依存関係を収集
 */
async function collectLicenses(): Promise<Record<string, LicenseInfo>> {
  return new Promise((resolve, reject) => {
    licenseChecker.init(
      {
        start: process.cwd(),
        production: true,
        json: true,
      },
      (err: Error | null, packages: Record<string, LicenseInfo>) => {
        if (err) {
          reject(err);
        } else {
          resolve(packages);
        }
      },
    );
  });
}

/**
 * 禁止ライセンスを検出
 */
function findProhibitedLicenses(
  packages: Record<string, LicenseInfo>,
): Array<{ name: string; license: string }> {
  return Object.entries(packages)
    .filter(([, info]) => {
      return PROHIBITED_PATTERNS.some((pattern) => pattern.test(info.licenses));
    })
    .map(([name, info]) => ({ name, license: info.licenses }));
}

/**
 * リスクのある Dual License を検出
 */
function findRiskyDualLicenses(
  packages: Record<string, LicenseInfo>,
): Array<{ name: string; license: string }> {
  return Object.entries(packages)
    .filter(([, info]) => {
      return RISKY_DUAL_LICENSE_PATTERNS.some((pattern) => pattern.test(info.licenses));
    })
    .map(([name, info]) => ({ name, license: info.licenses }));
}

/**
 * MIT バリアントを検出
 */
function findMITVariants(
  packages: Record<string, LicenseInfo>,
): Array<{ name: string; license: string; licenseFile?: string }> {
  return Object.entries(packages)
    .filter(([, info]) => {
      return MIT_VARIANTS.some((variant) => info.licenses.includes(variant));
    })
    .map(([name, info]) => ({
      name,
      license: info.licenses,
      ...(info.licenseFile ? { licenseFile: info.licenseFile } : {}),
    }));
}

/**
 * ライセンス不明パッケージを検出
 */
function findUnknownLicenses(
  packages: Record<string, LicenseInfo>,
): Array<{ name: string; license: string }> {
  return Object.entries(packages)
    .filter(([name, info]) => {
      // 自プロジェクト（@dayopt/web）を除外
      if (name.startsWith('@dayopt/web@')) {
        return false;
      }

      const license = info.licenses.toLowerCase();
      return (
        license === 'unknown' ||
        license === 'unlicensed' ||
        license === 'none' ||
        license === 'see license in license'
      );
    })
    .map(([name, info]) => ({ name, license: info.licenses }));
}

/**
 * 非推奨のSPDX識別子を検出（SPDX 3.0準拠チェック）
 */
function findDeprecatedSpdxIds(
  packages: Record<string, LicenseInfo>,
): Array<{ name: string; license: string; recommended: string }> {
  return Object.entries(packages)
    .filter(([, info]) => {
      return Object.keys(DEPRECATED_SPDX_IDS).includes(info.licenses);
    })
    .map(([name, info]) => ({
      name,
      license: info.licenses,
      recommended: DEPRECATED_SPDX_IDS[info.licenses]!,
    }));
}

// 実行
checkLicenseRisks().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
