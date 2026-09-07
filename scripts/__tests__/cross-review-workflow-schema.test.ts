import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `.agents/skills/pr-cross-review/cross-review-workflow.js` の schema 契約テスト（#2348）。
 *
 * Workflow script は `import()` が使えない（実測: SyntaxError）ため、schema は
 * そのファイルへ自己完結で持つほかない。typecheck / import による検証ができない
 * 代わりに、`SCHEMA_CONTRACT_START`/`END` マーカーで挟んだ純粋定義ブロック
 * （`phase()`/`agent()`/`parallel()` を呼ばない）だけをファイルから抽出し、
 * 安全に評価して role ごとの required key 集合・severity enum を固定する。
 */

const WORKFLOW_SCRIPT_PATH = join(
  import.meta.dirname,
  '../../.agents/skills/pr-cross-review/cross-review-workflow.js',
);

function extractSchemas(): Record<string, unknown> {
  const source = readFileSync(WORKFLOW_SCRIPT_PATH, 'utf8');
  const startMarker = '// === SCHEMA_CONTRACT_START ===';
  const endMarker = '// === SCHEMA_CONTRACT_END ===';
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(
      `cross-review-workflow.js から SCHEMA_CONTRACT マーカーを抽出できませんでした（start: ${startIndex}, end: ${endIndex}）。ファイル構造が変わっていないか確認してください。`,
    );
  }

  const block = source.slice(startIndex + startMarker.length, endIndex);
  const evaluate = new Function(`'use strict'; ${block} return SCHEMAS;`);
  return evaluate() as Record<string, unknown>;
}

type JsonSchemaObject = {
  required?: string[];
  properties?: Record<string, { enum?: string[]; items?: { enum?: string[] } }>;
};

describe('cross-review-workflow.js の SCHEMA_CONTRACT', () => {
  const schemas = extractSchemas();

  it('3 role すべてが定義されている', () => {
    expect(Object.keys(schemas).sort()).toEqual(
      ['architecture-guard', 'behavior-verifier', 'risk-reviewer'].sort(),
    );
  });

  it.each([
    [
      'behavior-verifier',
      [
        'role',
        'scopeChecked',
        'facts',
        'expectedTransitions',
        'findings',
        'counterevidence',
        'unknowns',
        'coverage',
        'recommendation',
        'recommendationReason',
      ],
    ],
    [
      'architecture-guard',
      [
        'role',
        'scopeChecked',
        'facts',
        'findings',
        'counterevidence',
        'unknowns',
        'coverage',
        'recommendation',
        'recommendationReason',
      ],
    ],
    [
      'risk-reviewer',
      [
        'role',
        'scopeChecked',
        'facts',
        'findings',
        'counterevidence',
        'unknowns',
        'coverage',
        'authority',
        'recommendation',
        'recommendationReason',
      ],
    ],
  ])('%s の required key 集合が固定されている', (role, expectedRequired) => {
    const schema = schemas[role] as JsonSchemaObject;
    expect(schema.required?.slice().sort()).toEqual([...expectedRequired].sort());
  });

  it('全 role で counterevidence / unknowns が required に含まれる（反証可能性の担保）', () => {
    for (const role of Object.keys(schemas)) {
      const schema = schemas[role] as JsonSchemaObject;
      expect(schema.required, `${role} の required`).toContain('counterevidence');
      expect(schema.required, `${role} の required`).toContain('unknowns');
    }
  });

  it('全 role で coverage が required に含まれ complete/partial の enum を強制する（#2417、早期切り上げの自己申告）', () => {
    for (const role of Object.keys(schemas)) {
      const schema = schemas[role] as JsonSchemaObject;
      expect(schema.required, `${role} の required`).toContain('coverage');
      expect(schema.properties?.coverage?.enum, `${role} の coverage enum`).toEqual([
        'complete',
        'partial',
      ]);
    }
  });

  it('risk-reviewer だけ authority を required に持ち、AUTONOMOUS/CHECKPOINT/EXPLICIT AUTHORITY の enum を強制する', () => {
    const riskReviewer = schemas['risk-reviewer'] as JsonSchemaObject;
    expect(riskReviewer.required).toContain('authority');
    expect(riskReviewer.properties?.authority?.enum).toEqual([
      'AUTONOMOUS',
      'CHECKPOINT',
      'EXPLICIT AUTHORITY',
    ]);

    for (const role of ['behavior-verifier', 'architecture-guard']) {
      const schema = schemas[role] as JsonSchemaObject;
      expect(schema.required, `${role} の required`).not.toContain('authority');
    }
  });

  it('severity enum が各 role の text Output format 語彙と一致する', () => {
    const behaviorVerifier = schemas['behavior-verifier'] as JsonSchemaObject;
    const architectureGuard = schemas['architecture-guard'] as JsonSchemaObject;
    const riskReviewer = schemas['risk-reviewer'] as JsonSchemaObject;

    expect(behaviorVerifier.properties?.findings?.items?.enum).toBeUndefined(); // findings は array of object なので直接 enum は持たない（構造確認のみ）
    expect(
      (
        behaviorVerifier.properties?.findings as {
          items?: { properties?: { severity?: { enum?: string[] } } };
        }
      )?.items?.properties?.severity?.enum,
    ).toEqual(['blocker', 'warning']);
    expect(
      (
        architectureGuard.properties?.findings as {
          items?: { properties?: { severity?: { enum?: string[] } } };
        }
      )?.items?.properties?.severity?.enum,
    ).toEqual(['blocker', 'warning']);
    expect(
      (
        riskReviewer.properties?.findings as {
          items?: { properties?: { severity?: { enum?: string[] } } };
        }
      )?.items?.properties?.severity?.enum,
    ).toEqual(['critical', 'high', 'medium', 'low']);
  });
});
