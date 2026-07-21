export type LegalContentTree = {
  readonly [key: string]: string | LegalContentTree;
};

export function readLegalTree(tree: LegalContentTree, ...path: string[]): LegalContentTree {
  let current: string | LegalContentTree = tree;

  for (const segment of path) {
    if (typeof current === 'string' || current[segment] === undefined) {
      throw new Error(`[Legal] Missing content object: ${path.join('.')}`);
    }
    current = current[segment];
  }

  if (typeof current === 'string') {
    throw new Error(`[Legal] Expected content object: ${path.join('.')}`);
  }

  return current;
}

export function readLegalText(tree: LegalContentTree, ...path: string[]): string {
  let current: string | LegalContentTree = tree;

  for (const segment of path) {
    if (typeof current === 'string' || current[segment] === undefined) {
      throw new Error(`[Legal] Missing content text: ${path.join('.')}`);
    }
    current = current[segment];
  }

  if (typeof current !== 'string') {
    throw new Error(`[Legal] Expected content text: ${path.join('.')}`);
  }

  return current;
}
