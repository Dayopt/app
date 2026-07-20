#!/usr/bin/env tsx
/**
 * License Information Generator (apps/web)
 *
 * OSS依存関係のライセンス情報を自動生成
 *
 * 実行方法:
 * ```bash
 * pnpm generate-licenses [--check]
 * ```
 *
 * 生成物:
 * 1. public/oss-credits.json - Web表示用JSON
 * 2. public/THIRD_PARTY_NOTICES.txt - Apache-2.0 NOTICEファイル集約
 *
 * 共通ロジックは scripts/lib/license-generator.ts を参照（apps/productと共有）。
 */

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLicenseGeneratorCli } from '../../../scripts/lib/license-generator';

const CONFIG = {
  packageName: '@dayopt/web',
  fallbackPackageDirSegments: ['apps', 'web'],
  resolveOutputDir: (packageDir: string) => join(packageDir, 'public'),
  generatedByLabel: 'apps/web/scripts/generate-licenses.ts',
};

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint ? resolve(entryPoint) === fileURLToPath(import.meta.url) : false;
}

if (isMainModule()) {
  try {
    runLicenseGeneratorCli(CONFIG);
  } catch (error) {
    console.error('\n❌ Error generating licenses:', error);
    process.exit(1);
  }
}
