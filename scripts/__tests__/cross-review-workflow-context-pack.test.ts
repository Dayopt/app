import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `.claude/skills/pr-cross-review/cross-review-workflow.js` の
 * `buildContextPackSection`（ctx pack を role prompt へ prepend する部分）の契約テスト。
 *
 * Workflow script は `import()` が使えず typecheck / import による検証もできない
 * （`cross-review-workflow-schema.test.ts` と同じ制約）ため、
 * `CONTEXT_PACK_CONTRACT_START`/`END` マーカーで挟んだ純粋関数ブロックだけを
 * ファイルから抽出して安全に評価する。
 */

const WORKFLOW_SCRIPT_PATH = join(
  import.meta.dirname,
  '../../.claude/skills/pr-cross-review/cross-review-workflow.js',
);

function extractBuildContextPackSection(): (ctxMarkdown: unknown) => string {
  const source = readFileSync(WORKFLOW_SCRIPT_PATH, 'utf8');
  const startMarker = '// === CONTEXT_PACK_CONTRACT_START ===';
  const endMarker = '// === CONTEXT_PACK_CONTRACT_END ===';
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(
      `cross-review-workflow.js から CONTEXT_PACK_CONTRACT マーカーを抽出できませんでした（start: ${startIndex}, end: ${endIndex}）。ファイル構造が変わっていないか確認してください。`,
    );
  }

  const block = source.slice(startIndex + startMarker.length, endIndex);
  const evaluate = new Function(`'use strict'; ${block} return buildContextPackSection;`);
  return evaluate() as (ctxMarkdown: unknown) => string;
}

describe('cross-review-workflow.js の buildContextPackSection', () => {
  const buildContextPackSection = extractBuildContextPackSection();

  it('見出し・本文・指示文を含める', () => {
    const result = buildContextPackSection('## 受け入れ条件\n- 何か');
    expect(result).toContain('## 意図と文脈（context pack、L0 が生成）');
    expect(result).toContain('## 受け入れ条件\n- 何か');
    expect(result).toContain(
      'diff が上の受け入れ条件 / DoD / 次の一手と食い違う点は、コードの欠陥と同じ重さで指摘する。',
    );
  });

  it('未取得・空文字・非文字列は「未取得」にフォールバックする（fail-open）', () => {
    expect(buildContextPackSection('未取得')).toContain('未取得');
    expect(buildContextPackSection('')).toContain('未取得');
    expect(buildContextPackSection('   ')).toContain('未取得');
    expect(buildContextPackSection(undefined)).toContain('未取得');
    expect(buildContextPackSection(null)).toContain('未取得');
  });

  it('150 行を超える入力は切り詰めて省略注記を付ける', () => {
    const longMarkdown = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const result = buildContextPackSection(longMarkdown);
    expect(result).toContain('line 0');
    expect(result).toContain('line 149');
    expect(result).not.toContain('line 150');
    expect(result).toContain('…（150 行超は省略）');
  });

  it('150 行以下の入力は省略注記を付けない', () => {
    const shortMarkdown = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const result = buildContextPackSection(shortMarkdown);
    expect(result).not.toContain('省略');
  });
});
