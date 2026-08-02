import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ZIndex.stories.tsx の手書き配列と tokens/z-index.css の @theme 定義の同期を固定する。
 *
 * story 側は「z-index.css と同期」とコメントしながら手書き配列で、実際に
 * bottom-tab / bottom-strip の 2 層が欠けたままドリフトしていた（2026-07-31 是正）。
 * 手書きをやめて CSS から生成する選択肢もあるが、story は description という
 * CSS に無い情報を持つため、二重管理を許した上でこの test が一致を強制する。
 */

const root = join(__dirname, '..', '..');

function parseCssLayers(): Map<string, number> {
  const css = readFileSync(join(root, 'packages/foundations/src/tokens/z-index.css'), 'utf8');
  const layers = new Map<string, number>();
  for (const m of css.matchAll(/--z-index-([a-z-]+):\s*(\d+);/g)) {
    layers.set(m[1] as string, Number(m[2]));
  }
  return layers;
}

function parseStoryLayers(): Map<string, { value: number; tailwind: string }> {
  const story = readFileSync(
    join(root, 'packages/foundations/src/tokens/ZIndex.stories.tsx'),
    'utf8',
  );
  const layers = new Map<string, { value: number; tailwind: string }>();
  // 配列 entry の形は { name: 'x', value: N, tailwind: 'z-x', ... }（複数行・単一行両対応）
  for (const m of story.matchAll(
    /name:\s*'([a-z-]+)',\s*value:\s*(\d+),\s*tailwind:\s*'(z-[a-z-]+)'/g,
  )) {
    layers.set(m[1] as string, { value: Number(m[2]), tailwind: m[3] as string });
  }
  return layers;
}

describe('z-index token と ZIndex story の同期', () => {
  const css = parseCssLayers();
  const story = parseStoryLayers();

  it('CSS の @theme が層を定義している（parse が壊れていない）', () => {
    expect(css.size).toBeGreaterThanOrEqual(16);
    expect(story.size).toBeGreaterThanOrEqual(16);
  });

  it('CSS の全層が story に存在し、値が一致する', () => {
    for (const [name, value] of css) {
      const entry = story.get(name);
      expect(entry, `story に ${name} が無い`).toBeDefined();
      expect(entry?.value, `${name} の値が不一致`).toBe(value);
    }
  });

  it('story に CSS に無い層が残っていない', () => {
    for (const name of story.keys()) {
      expect(css.has(name), `CSS に ${name} が無い（story の残骸）`).toBe(true);
    }
  });

  it('story の tailwind クラス名が z-{name} 形式で一致する', () => {
    for (const [name, entry] of story) {
      expect(entry.tailwind).toBe(`z-${name}`);
    }
  });
});
