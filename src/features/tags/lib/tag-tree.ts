import type { Tag, TagTreeNode } from '../types';

function compareTags(a: Tag, b: Tag): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
}

export function buildTagTree(tags: Tag[]): TagTreeNode[] {
  const activeTags = tags.filter((tag) => tag.is_active !== false);
  const activeIds = new Set(activeTags.map((tag) => tag.id));
  const childrenByParent = new Map<string, Tag[]>();
  const roots: Tag[] = [];

  for (const tag of activeTags) {
    if (tag.parent_id && activeIds.has(tag.parent_id)) {
      const children = childrenByParent.get(tag.parent_id) ?? [];
      children.push(tag);
      childrenByParent.set(tag.parent_id, children);
      continue;
    }
    roots.push(tag);
  }

  roots.sort(compareTags);

  return roots.map((root) => ({
    tag: root,
    children: (childrenByParent.get(root.id) ?? []).slice().sort(compareTags),
  }));
}

export function flattenTagTree(nodes: TagTreeNode[]): Tag[] {
  const result: Tag[] = [];
  for (const node of nodes) {
    result.push(node.tag);
    result.push(...node.children);
  }
  return result;
}

export interface TagHierarchyUpdate {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

export function buildTagHierarchyUpdates(nodes: TagTreeNode[]): TagHierarchyUpdate[] {
  const updates: TagHierarchyUpdate[] = [];

  nodes.forEach((node, rootIndex) => {
    updates.push({
      id: node.tag.id,
      parent_id: null,
      sort_order: rootIndex,
    });

    node.children.forEach((child, childIndex) => {
      updates.push({
        id: child.id,
        parent_id: node.tag.id,
        sort_order: childIndex,
      });
    });
  });

  return updates;
}
