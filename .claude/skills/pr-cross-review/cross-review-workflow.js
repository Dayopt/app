// pr-cross-review skill が使う Workflow script（#2348）。
//
// risk-reviewer / behavior-verifier / architecture-guard を agentType + schema で
// 並列起動し、StructuredOutput を機構的に強制する。素の Agent tool では出力の
// 最終 text 書き出しを agent 自身の判断に依存しており、書き出さず停止する事象が
// #2227 の prompt 契約適用後も 1 日 5 回再発した（issue #2348 参照）。
//
// Workflow script は import() が使えない（実測: SyntaxError）ため、schema と
// prompt builder はこのファイルへ自己完結で持つ。SCHEMA_CONTRACT マーカーで
// 挟んだブロックは phase()/agent()/parallel() を一切呼ばない純粋な定義のみで、
// scripts/__tests__/cross-review-workflow-schema.test.ts がこのブロックだけを
// 抽出評価し、role ごとの required key 集合・severity enum を固定する。

export const meta = {
  name: 'pr-cross-review-findings',
  description:
    '選定した read-only reviewer subagent（risk-reviewer / behavior-verifier / architecture-guard）を並列実行し、StructuredOutput で findings JSON を強制取得する（#2348）',
  phases: [{ title: 'Review' }],
};

// === SCHEMA_CONTRACT_START ===
const SCHEMAS = {
  'behavior-verifier': {
    type: 'object',
    additionalProperties: false,
    required: [
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
    properties: {
      role: { type: 'string', enum: ['behavior-verifier'] },
      scopeChecked: { type: 'array', items: { type: 'string' }, minItems: 1 },
      facts: { type: 'array', items: { type: 'string' } },
      expectedTransitions: { type: 'array', items: { type: 'string' } },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'target', 'scenario', 'recommendationToMain'],
          properties: {
            severity: { type: 'string', enum: ['blocker', 'warning'] },
            target: { type: 'string' },
            scenario: { type: 'string' },
            recommendationToMain: { type: 'string' },
          },
        },
      },
      counterevidence: { type: 'array', items: { type: 'string' } },
      unknowns: { type: 'array', items: { type: 'string' } },
      coverage: { type: 'string', enum: ['complete', 'partial'] },
      recommendation: { type: 'string', enum: ['proceed', 'revise', 'halt'] },
      recommendationReason: { type: 'string' },
    },
  },
  'architecture-guard': {
    type: 'object',
    additionalProperties: false,
    required: [
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
    properties: {
      role: { type: 'string', enum: ['architecture-guard'] },
      scopeChecked: { type: 'array', items: { type: 'string' }, minItems: 1 },
      facts: { type: 'array', items: { type: 'string' } },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'target', 'scenario', 'recommendationToMain'],
          properties: {
            severity: { type: 'string', enum: ['blocker', 'warning'] },
            target: { type: 'string' },
            scenario: { type: 'string' },
            recommendationToMain: { type: 'string' },
          },
        },
      },
      counterevidence: { type: 'array', items: { type: 'string' } },
      unknowns: { type: 'array', items: { type: 'string' } },
      coverage: { type: 'string', enum: ['complete', 'partial'] },
      recommendation: { type: 'string', enum: ['proceed', 'revise', 'halt'] },
      recommendationReason: { type: 'string' },
    },
  },
  'risk-reviewer': {
    type: 'object',
    additionalProperties: false,
    required: [
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
    properties: {
      role: { type: 'string', enum: ['risk-reviewer'] },
      scopeChecked: { type: 'array', items: { type: 'string' }, minItems: 1 },
      facts: { type: 'array', items: { type: 'string' } },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'target', 'scenario', 'recommendationToMain'],
          properties: {
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            target: { type: 'string' },
            scenario: { type: 'string' },
            recommendationToMain: { type: 'string' },
          },
        },
      },
      counterevidence: { type: 'array', items: { type: 'string' } },
      unknowns: { type: 'array', items: { type: 'string' } },
      coverage: { type: 'string', enum: ['complete', 'partial'] },
      authority: { type: 'string', enum: ['AUTONOMOUS', 'CHECKPOINT', 'EXPLICIT AUTHORITY'] },
      recommendation: { type: 'string', enum: ['proceed', 'revise', 'halt'] },
      recommendationReason: { type: 'string' },
    },
  },
};
// === SCHEMA_CONTRACT_END ===

function buildReviewPrompt(diffPath, extraContext) {
  const base = `対象 diff: ${diffPath}（絶対パス、Read で読むこと）。反証観点で確認する: 配線漏れ（workflow ↔ script の env 受け渡し等）、定数間の不等式（timeout / 予算）、直前の修正コミットが新たに開けた穴。`;
  return extraContext ? base + '\n\n' + extraContext : base;
}

const KNOWN_ROLES = new Set(Object.keys(SCHEMAS));

phase('Review');
const reviewers = args.reviewers ?? [];
const results = await parallel(
  reviewers.map((role) => () => {
    if (!KNOWN_ROLES.has(role)) {
      return Promise.resolve({
        role,
        status: 'error',
        result: null,
        error: `unknown role: ${role}`,
      });
    }
    return agent(buildReviewPrompt(args.diffPath, args.extraContext), {
      agentType: role,
      schema: SCHEMAS[role],
      label: role,
      phase: 'Review',
    })
      .then((result) => ({ role, status: result ? 'ok' : 'empty', result }))
      .catch((err) => ({
        role,
        status: 'error',
        result: null,
        error: String((err && err.message) || err),
      }));
  }),
);

return results;
