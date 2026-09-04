import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * rclone は RCLONE_<FLAG名> 形式の環境変数をすべて自身の CLI フラグとして解釈する
 * （RCLONE_CONFIG_* だけが正当な例外）。workflow の env に RCLONE_VERSION のような
 * 名前を置くと --version フラグとして誤解釈され CRITICAL で落ちる（2026-08-18、
 * #2155 実測）。この契約を YAML の文字列一致で固定し、再発を防ぐ。
 *
 * storage-backup-export.yml は #2483（CI ファイル統合 Phase 1）で nightly.yml へ
 * 吸収された（storage-backup-export job）。ファイル全体を regex 走査するため、
 * 他 job（replica-check 等）が RCLONE_ 始まりの env キーを持たない限り false
 * positive にはならない。
 */
const workflow = readFileSync(join(process.cwd(), '.github/workflows/nightly.yml'), 'utf8');

function findDisallowedRcloneEnvKeys(yamlText: string): string[] {
  const envKeys = [...yamlText.matchAll(/^\s{2,}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]);
  return envKeys.filter((key) => key.startsWith('RCLONE_') && !key.startsWith('RCLONE_CONFIG_'));
}

describe('storage-backup-export workflow contract', () => {
  it('env のキーで RCLONE_ 始まりは RCLONE_CONFIG_ のみを許可する', () => {
    const disallowed = findDisallowedRcloneEnvKeys(workflow);

    expect(disallowed).toEqual([]);
  });

  it('secrets 由来の RCLONE_CONFIG_* キーは実際に存在する（regex が空判定で偽陽性しない保証）', () => {
    const envKeys = [...workflow.matchAll(/^\s{2,}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]);
    const rcloneConfigKeys = envKeys.filter((key) => key.startsWith('RCLONE_CONFIG_'));

    expect(rcloneConfigKeys.length).toBeGreaterThan(0);
  });

  it('RCLONE_VERSION のような RCLONE_CONFIG_ 以外のキーを検知できる（回帰確認）', () => {
    const regressed = [
      'env:',
      '  RCLONE_VERSION: "1.75.0"',
      '  RCLONE_CONFIG_SOURCE_TYPE: s3',
    ].join('\n');

    expect(findDisallowedRcloneEnvKeys(regressed)).toEqual(['RCLONE_VERSION']);
  });
});
