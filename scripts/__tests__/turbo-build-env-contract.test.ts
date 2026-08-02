/**
 * turbo.json の build env 宣言と production build gate の契約を固定する。
 *
 * Vercel は turborepo 検出時に `turbo run build` で build する（#1701 の
 * Root Directory flip 以降）。Turborepo 2.x の strict env mode は、
 * `tasks.build.env` に宣言しない env を build process から剥がすため、
 * gate が要求する env の宣言漏れはそのまま production release の停止になる。
 *
 * - NEXT_PUBLIC_* は Next.js の framework inference で自動的に通るため宣言不要
 * - それ以外の gate 必須 env は、exact 名または prefix wildcard（`XXX_*`）で
 *   turbo.json に必ず載せる
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV } from '../../apps/product/production-build-gate.mjs';
import { REQUIRED_WEB_OPERATIONAL_BUILD_ENV } from '../../apps/web/production-build-gate.mjs';
import { REQUIRED_SENTRY_BUILD_ENV } from '../../packages/observability/build-gate.mjs';

const BUILD_GATE_PATHS = [
  '../../packages/observability/build-gate.mjs',
  '../../apps/product/production-build-gate.mjs',
  '../../apps/web/production-build-gate.mjs',
] as const;

const turboConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../turbo.json', import.meta.url)), 'utf8'),
) as { tasks?: { build?: { env?: string[] } } };

const buildEnvDeclarations = turboConfig.tasks?.build?.env ?? [];

function isCoveredByBuildEnv(envName: string): boolean {
  // Next.js package の build では turbo の framework inference が通す。
  if (envName.startsWith('NEXT_PUBLIC_')) return true;

  return buildEnvDeclarations.some((declared) =>
    declared.endsWith('*') ? envName.startsWith(declared.slice(0, -1)) : envName === declared,
  );
}

describe('turbo build env contract', () => {
  it('build env宣言はexact名かprefix wildcardだけで構成する', () => {
    expect(buildEnvDeclarations.length).toBeGreaterThan(0);
    for (const declared of buildEnvDeclarations) {
      // negation（`!XXX`）や中間 wildcard を混ぜると下の coverage 判定が
      // 成立しなくなるため、宣言の形式ごと契約に含める。
      expect(declared, declared).toMatch(/^[A-Z][A-Z0-9_]*\*?$/);
    }
  });

  it.each([
    { gate: 'Sentry production gate', requiredEnvNames: REQUIRED_SENTRY_BUILD_ENV },
    {
      gate: 'Product operational gate',
      requiredEnvNames: REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV,
    },
    { gate: 'Web operational gate', requiredEnvNames: REQUIRED_WEB_OPERATIONAL_BUILD_ENV },
  ])('$gateの必須envをturbo.jsonのbuild envがカバーする', ({ requiredEnvNames }) => {
    const uncovered = requiredEnvNames.filter((envName: string) => !isCoveredByBuildEnv(envName));
    expect(uncovered).toEqual([]);
  });

  it('gate実装が読むenvプロパティをturbo.jsonのbuild envがカバーする', () => {
    // gate は VERCEL_ENV などを配列外で直接参照する。ソースを走査して
    // `env.XXX` の形の参照をすべて拾い、宣言漏れを検出する。
    for (const gatePath of BUILD_GATE_PATHS) {
      const source = readFileSync(fileURLToPath(new URL(gatePath, import.meta.url)), 'utf8');
      const referencedEnvNames = [...source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/gu)].map(
        (match) => match[1]!,
      );
      expect(referencedEnvNames.length, gatePath).toBeGreaterThan(0);

      const uncovered = referencedEnvNames.filter((envName) => !isCoveredByBuildEnv(envName));
      expect(uncovered, gatePath).toEqual([]);
    }
  });
});
