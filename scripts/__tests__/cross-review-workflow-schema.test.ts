import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../lib/review-contract.mjs';

type JsonSchemaObject = {
  required?: string[];
  properties?: Record<string, { enum?: string[]; items?: { enum?: string[] } }>;
};

describe('review-contract.mjs の SCHEMA_CONTRACT', () => {
  const schemas: Record<string, unknown> = SCHEMAS;

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
