export type TagId = string;
export type TagColor = string;

export type Tag = Readonly<{
  id: TagId;
  name: string;
  color?: TagColor | null;
  icon?: string | null;
  parentId?: TagId | null;
}>;

export type TagTreeNode = Readonly<{
  tag: Tag;
  children: readonly TagTreeNode[];
}>;

export function isRootTag(tag: Pick<Tag, 'parentId'>): boolean {
  return tag.parentId == null;
}

export function createTagPath(parentName: string | null | undefined, name: string): string {
  const normalizedName = name.trim();
  const normalizedParentName = parentName?.trim();

  return normalizedParentName ? `${normalizedParentName}:${normalizedName}` : normalizedName;
}
