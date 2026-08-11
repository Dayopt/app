import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { envSchema, forbiddenFields, productionEnvSchema } from '../env/schema';

// Dayopt-Staging には常設 staging が無く、置けば production の複製になる 4 field。
const SUPABASE_CONNECTION_FIELDS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
] as const;

const opEnvExample = readFileSync(
  fileURLToPath(new URL('../../.op-env.local.example', import.meta.url)),
  'utf8',
);

const setup1PasswordScript = readFileSync(
  fileURLToPath(new URL('../setup-1password.sh', import.meta.url)),
  'utf8',
);

const devWithOpScript = readFileSync(
  fileURLToPath(new URL('../dev-with-op.sh', import.meta.url)),
  'utf8',
);

const adminEnvExample = readFileSync(
  fileURLToPath(new URL('../../.op-env.admin.example', import.meta.url)),
  'utf8',
);

const gitignore = readFileSync(fileURLToPath(new URL('../../.gitignore', import.meta.url)), 'utf8');

/** setup-1password.sh から Staging の supabase item を作る 1 コマンドだけを切り出す。 */
function stagingSupabaseItemBlock(): string {
  const start = setup1PasswordScript.indexOf('--vault=Dayopt-Staging --title=supabase');
  expect(start).toBeGreaterThan(-1);
  const end = setup1PasswordScript.indexOf('\n\n', start);
  expect(end).toBeGreaterThan(start);
  return setup1PasswordScript.slice(start, end);
}

describe('Dayopt-Staging/supabase の接続情報境界', () => {
  it('staging schema に Supabase の接続 field を置かない', () => {
    for (const field of SUPABASE_CONNECTION_FIELDS) {
      const matches = envSchema.filter(
        (entry) => entry.item === 'supabase' && entry.field === field,
      );
      expect(matches, field).toHaveLength(0);
    }
  });

  it('production schema には同じ接続 field を残す', () => {
    for (const field of SUPABASE_CONNECTION_FIELDS) {
      const matches = productionEnvSchema.filter(
        (entry) => entry.vault === 'Dayopt-Production' && entry.item === 'supabase',
      );
      expect(
        matches.map((entry) => entry.field),
        field,
      ).toContain(field);
    }
  });

  it('local injection 参照から Staging の Supabase 接続情報を外す', () => {
    for (const field of SUPABASE_CONNECTION_FIELDS) {
      expect(opEnvExample, field).not.toContain(`op://Dayopt-Staging/supabase/${field}`);
    }
  });

  it('1Password bootstrap が Staging の supabase item に接続 field を作らない', () => {
    const block = stagingSupabaseItemBlock();
    // 切り出しが空振りすると not.toContain が素通りするため、残す field で掴めていることを先に示す
    expect(block).toContain("'SUPABASE_ACCESS_TOKEN[concealed]='");
    expect(block).not.toContain('Dayopt-Production');
    for (const field of SUPABASE_CONNECTION_FIELDS) {
      expect(block, field).not.toContain(field);
    }
  });

  it('dev script に 1Password 参照で Supabase へ繋ぐ経路が残っていない', () => {
    expect(devWithOpScript).not.toContain('SUPABASE_TARGET" == "op"');
    expect(devWithOpScript).toContain('DAYOPT_SUPABASE_TARGET は廃止されました');
  });

  it('禁止 field の実在検査が接続 4 field を網羅する', () => {
    const covered = forbiddenFields
      .filter((entry) => entry.vault === 'Dayopt-Staging' && entry.item === 'supabase')
      .map((entry) => entry.field);
    expect(covered.sort()).toEqual([...SUPABASE_CONNECTION_FIELDS].sort());
  });

  it('admin script 用の env 参照は Production を指し、Staging を経由しない', () => {
    for (const field of SUPABASE_CONNECTION_FIELDS) {
      expect(adminEnvExample, field).not.toContain(`op://Dayopt-Staging/supabase/${field}`);
    }
    // 管理者運用は production 相手なので、参照先が Production であること自体を固定する
    expect(adminEnvExample).toContain(
      'SUPABASE_SERVICE_ROLE_KEY=op://Dayopt-Production/supabase/SUPABASE_SERVICE_ROLE_KEY',
    );
    // .op-env.admin は各自が作る実行用ファイルなので commit させない
    expect(gitignore).toMatch(/^\.op-env\.admin$/mu);
  });
});
