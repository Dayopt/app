import { describe, expect, it } from 'vitest';

import {
  assertServiceRoleSuiteRunnable,
  resolveServiceRoleTarget,
} from './service-role-target-guard';

const LOCAL_URL = 'http://127.0.0.1:54321';
const PRODUCTION_URL = 'https://yvglwblxrnrenfifsnje.supabase.co';
const PREVIEW_URL = 'https://abcdefghijklmnop.supabase.co';
const KEY = 'service-role-key';

/** repo の ProcessEnv 型は NODE_ENV を必須にしているため、最小の env をここで組む。 */
function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...overrides };
}

describe('resolveServiceRoleTarget', () => {
  it('ローカル stack は既定で安全', () => {
    expect(resolveServiceRoleTarget(LOCAL_URL, KEY, testEnv())).toEqual({ safe: true });
  });

  it('env が欠けていれば安全でない', () => {
    expect(resolveServiceRoleTarget(undefined, KEY, testEnv())).toMatchObject({ safe: false });
    expect(resolveServiceRoleTarget(LOCAL_URL, undefined, testEnv())).toMatchObject({
      safe: false,
    });
    // supabase status | jq が空文字を返した時の形。CI で実際に起きうる。
    expect(resolveServiceRoleTarget(LOCAL_URL, '', testEnv())).toMatchObject({ safe: false });
  });

  it('非ローカルは opt-in があれば安全', () => {
    expect(resolveServiceRoleTarget(PREVIEW_URL, KEY, testEnv())).toMatchObject({ safe: false });
    expect(
      resolveServiceRoleTarget(PREVIEW_URL, KEY, testEnv({ E2E_ALLOW_NONLOCAL_SUPABASE: '1' })),
    ).toEqual({ safe: true });
  });

  it('Production project は opt-in があっても安全でない', () => {
    expect(
      resolveServiceRoleTarget(PRODUCTION_URL, KEY, testEnv({ E2E_ALLOW_NONLOCAL_SUPABASE: '1' })),
    ).toMatchObject({ safe: false });
  });
});

describe('assertServiceRoleSuiteRunnable', () => {
  it('safe なら何もしない', () => {
    expect(() =>
      assertServiceRoleSuiteRunnable(
        { safe: true },
        'suite',
        testEnv({ E2E_REQUIRE_SERVICE_ROLE_SUITES: '1' }),
      ),
    ).not.toThrow();
  });

  it('unsafe でも要求フラグが無ければ throw しない（ローカルは従来どおり skip）', () => {
    expect(() =>
      assertServiceRoleSuiteRunnable({ safe: false, reason: 'env 未設定' }, 'suite', testEnv()),
    ).not.toThrow();
  });

  // これが無いと、env が壊れて suite が全部 skip されても CI は「0 failed」で緑になる。
  it('要求フラグ付きで unsafe なら suite 名と理由を添えて throw する', () => {
    expect(() =>
      assertServiceRoleSuiteRunnable(
        { safe: false, reason: 'env 未設定' },
        'Critical Path',
        testEnv({ E2E_REQUIRE_SERVICE_ROLE_SUITES: '1' }),
      ),
    ).toThrow(/Critical Path.*env 未設定/);
  });
});
