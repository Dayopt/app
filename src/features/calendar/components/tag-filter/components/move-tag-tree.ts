import type { Tag, TagTreeNode } from '@/features/tags';

export const ROOT = '__root__';
// 最終アイテムの下に置く明示的 drop zone。ROOT bbox は items 合計に一致するため、
// この zone がないと cursor が「末尾より下」に届かず、root tag を末尾に置けない
export const END_OF_ROOT = '__root_end__';

export function childContainerId(parentId: string): string {
  return `children:${parentId}`;
}

export type TreeTag =
  | {
      kind: 'root';
      tag: Tag;
      children: Tag[];
    }
  | {
      kind: 'child';
      tag: Tag;
      parentId: string;
    };

function cloneNodes(nodes: TagTreeNode[]): TagTreeNode[] {
  return nodes.map((node) => ({
    tag: { ...node.tag },
    children: node.children.map((child) => ({ ...child })),
  }));
}

function findRootIndex(nodes: TagTreeNode[], tagId: string): number {
  return nodes.findIndex((node) => node.tag.id === tagId);
}

function findChildLocation(
  nodes: TagTreeNode[],
  tagId: string,
): { rootIndex: number; childIndex: number } | null {
  for (let rootIndex = 0; rootIndex < nodes.length; rootIndex += 1) {
    const childIndex = nodes[rootIndex]?.children.findIndex((child) => child.id === tagId) ?? -1;
    if (childIndex >= 0) {
      return { rootIndex, childIndex };
    }
  }
  return null;
}

export function findTreeTag(nodes: TagTreeNode[], tagId: string): TreeTag | null {
  const rootIndex = findRootIndex(nodes, tagId);
  if (rootIndex >= 0) {
    const root = nodes[rootIndex]!;
    return { kind: 'root', tag: root.tag, children: root.children };
  }

  const childLocation = findChildLocation(nodes, tagId);
  if (!childLocation) return null;

  const parent = nodes[childLocation.rootIndex]!;
  const child = parent.children[childLocation.childIndex]!;
  return {
    kind: 'child',
    tag: child,
    parentId: parent.tag.id,
  };
}

function findContainer(nodes: TagTreeNode[], id: string): string | null {
  if (id === ROOT || id === END_OF_ROOT) return ROOT;
  if (id.startsWith('children:')) return id;
  if (findRootIndex(nodes, id) >= 0) return ROOT;

  const childLocation = findChildLocation(nodes, id);
  return childLocation ? childContainerId(nodes[childLocation.rootIndex]!.tag.id) : null;
}

export function canBecomeChild(treeTag: TreeTag): boolean {
  return treeTag.kind === 'child' || treeTag.children.length === 0;
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * drag 結果として tree を再構築する。invalid な move は null を返し呼び出し側で no-op 扱いする。
 *
 * invalid とみなすケース:
 * - active と over が同一（実質ノードが移動しない；source row 上での release）
 * - active が tree 内に存在しない
 * - over の container が解決できない
 * - children を持つ root を別 root の child にしようとした（depth=1 制約）
 * - active 自身を own children container の親として指定した
 */
export function moveTagTree(
  nodes: TagTreeNode[],
  activeId: string,
  overId: string,
): TagTreeNode[] | null {
  // 同一 id への drop は no-op。チェックを最初に置かないと、splice 後 findRootIndex
  // が -1 を返して fallback で末尾に再挿入され、source row release で意図しない並び替えが起きる
  if (activeId === overId) return null;

  const active = findTreeTag(nodes, activeId);
  if (!active) return null;

  const destinationContainer = findContainer(nodes, overId);
  if (!destinationContainer) return null;

  const nextNodes = cloneNodes(nodes);
  const rootIndex = findRootIndex(nextNodes, activeId);
  const childLocation = findChildLocation(nextNodes, activeId);

  let movingRoot: TagTreeNode | null = null;
  let movingChild: Tag | null = null;

  if (rootIndex >= 0) {
    movingRoot = nextNodes[rootIndex]!;
    nextNodes.splice(rootIndex, 1);
  } else if (childLocation) {
    movingChild = nextNodes[childLocation.rootIndex]!.children[childLocation.childIndex]!;
    nextNodes[childLocation.rootIndex]!.children.splice(childLocation.childIndex, 1);
  } else {
    return null;
  }

  if (destinationContainer === ROOT) {
    const isRootContainer = overId === ROOT || overId === END_OF_ROOT;
    const overRootIndex = isRootContainer ? -1 : findRootIndex(nextNodes, overId);
    const rawIndex = isRootContainer || overRootIndex < 0 ? nextNodes.length : overRootIndex;
    const safeIndex = Math.max(0, Math.min(rawIndex, nextNodes.length));

    if (movingRoot) {
      nextNodes.splice(safeIndex, 0, movingRoot);
      return nextNodes;
    }

    if (!movingChild) return null;
    nextNodes.splice(safeIndex, 0, {
      tag: { ...movingChild, parent_id: null },
      children: [],
    });
    return nextNodes;
  }

  const targetParentId = destinationContainer.replace(/^children:/, '');
  if (activeId === targetParentId) return null;

  const targetRootIndex = findRootIndex(nextNodes, targetParentId);
  if (targetRootIndex < 0) return null;

  if (movingRoot && movingRoot.children.length > 0) {
    return null;
  }

  const targetNode = nextNodes[targetRootIndex]!;
  const baseChildren = targetNode.children.slice();
  const rawIndex =
    overId === destinationContainer
      ? baseChildren.length
      : baseChildren.findIndex((child) => child.id === overId);
  const insertIndex = rawIndex >= 0 ? rawIndex : baseChildren.length;

  if (movingRoot) {
    targetNode.children = insertAt(baseChildren, insertIndex, {
      ...movingRoot.tag,
      parent_id: targetParentId,
    });
    return nextNodes;
  }

  if (!movingChild) return null;
  targetNode.children = insertAt(baseChildren, insertIndex, {
    ...movingChild,
    parent_id: targetParentId,
  });
  return nextNodes;
}
