'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale, useTranslations } from 'next-intl';

import type { Tag } from '@/features/tags';
import {
  InlineTagCreateRow,
  InlineTagNameEdit,
  TagDeleteStrategyDialog,
  TagIcon,
  buildColonTagName,
  getTagDisplayLabel,
  parseColonTag,
  useCreateTag,
  useDeleteGroup,
  useMergeTag,
  useRenameGroup,
  useReorderTags,
  useUngroupTags,
  useUpdateTag,
} from '@/features/tags';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuTrigger } from '@/lib/components/ui/dropdown-menu';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { useCalendarFilterStore } from '@/lib/stores/useCalendarFilterStore';
import type { TagColorName } from '@/lib/tag-colors';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';

import { FilterItemMenu, type GroupOption } from './FilterItem/FilterItemMenu';
import { useFilterItemEdit } from './FilterItem/useFilterItemEdit';
import { GroupHeader } from './GroupHeader';
import { TagEntryCreatePopover } from './TagEntryCreatePopover';

/**
 * dnd-kit Multiple Containers ベースの DnD 実装。
 *
 * - __root__ コンテナ: chunks (solo tag / group block) の dndId 配列
 *   - solo chunk → その tag.id
 *   - group chunk → absorbed parent の tag.id、または virtual group の synthetic id (`$vgroup:<prefix>`)
 * - group:<prefix> コンテナ: その group の子タグ id 配列
 *
 * drag within container (arrayMove) → 同一コンテナで reorder。
 * cross-container drop → noop（階層変更は ⋯ メニュー）。
 */
const ROOT = '__root__';
const VGROUP_PREFIX = '$vgroup:';
const groupKey = (prefix: string) => `group:${prefix}`;

type ContainerId = string;
type ContainersState = Record<ContainerId, string[]>;

type Chunk =
  | { kind: 'solo'; dndId: string; tag: Tag }
  | {
      kind: 'group';
      dndId: string;
      prefix: string;
      absorbedParent?: Tag;
      children: Tag[];
    };

interface DerivedDnd {
  chunks: Chunk[];
  containers: ContainersState;
  chunkByDndId: Map<string, Chunk>;
}

/** tags → chunks + containers */
function deriveDnd(tags: Tag[]): DerivedDnd {
  const parsed = tags
    .filter((t) => t.is_active !== false)
    .map((tag) => ({ tag, ...parseColonTag(tag.name) }));

  const groups = new Map<string, Tag[]>();
  for (const item of parsed) {
    if (item.suffix !== null) {
      const arr = groups.get(item.prefix) ?? [];
      arr.push(item.tag);
      groups.set(item.prefix, arr);
    }
  }
  for (const [, members] of groups) {
    members.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const absorbedParentByPrefix = new Map<string, Tag>();
  const absorbedIds = new Set<string>();
  for (const item of parsed) {
    if (item.suffix === null && groups.has(item.tag.name)) {
      absorbedParentByPrefix.set(item.tag.name, item.tag);
      absorbedIds.add(item.tag.id);
    }
  }

  const sortedParsed = parsed
    .slice()
    .sort((a, b) => (a.tag.sort_order ?? 0) - (b.tag.sort_order ?? 0));

  const chunks: Chunk[] = [];
  const processed = new Set<string>();
  const seenPrefixes = new Set<string>();

  for (const item of sortedParsed) {
    if (processed.has(item.tag.id)) continue;

    if (absorbedIds.has(item.tag.id)) {
      const prefix = item.tag.name;
      if (seenPrefixes.has(prefix)) {
        processed.add(item.tag.id);
        continue;
      }
      seenPrefixes.add(prefix);
      processed.add(item.tag.id);
      const members = groups.get(prefix) ?? [];
      for (const m of members) processed.add(m.id);
      chunks.push({
        kind: 'group',
        dndId: item.tag.id,
        prefix,
        absorbedParent: item.tag,
        children: members,
      });
      continue;
    }

    if (item.suffix !== null && groups.has(item.prefix)) {
      if (seenPrefixes.has(item.prefix)) {
        processed.add(item.tag.id);
        continue;
      }
      seenPrefixes.add(item.prefix);
      const members = groups.get(item.prefix) ?? [];
      for (const m of members) processed.add(m.id);
      chunks.push({
        kind: 'group',
        dndId: `${VGROUP_PREFIX}${item.prefix}`,
        prefix: item.prefix,
        children: members,
      });
      continue;
    }

    chunks.push({ kind: 'solo', dndId: item.tag.id, tag: item.tag });
    processed.add(item.tag.id);
  }

  const rootItems = chunks.map((c) => c.dndId);
  const containers: ContainersState = { [ROOT]: rootItems };
  for (const chunk of chunks) {
    if (chunk.kind === 'group') {
      containers[groupKey(chunk.prefix)] = chunk.children.map((c) => c.id);
    }
  }

  const chunkByDndId = new Map<string, Chunk>();
  for (const chunk of chunks) chunkByDndId.set(chunk.dndId, chunk);

  return { chunks, containers, chunkByDndId };
}

/** containers + chunks → reorder mutation updates */
function flattenToSortOrder(
  containers: ContainersState,
  chunkByDndId: Map<string, Chunk>,
): { id: string; sort_order: number }[] {
  const updates: { id: string; sort_order: number }[] = [];
  const rootOrder = containers[ROOT] ?? [];
  let i = 0;
  for (const dndId of rootOrder) {
    const chunk = chunkByDndId.get(dndId);
    if (!chunk) continue;
    if (chunk.kind === 'solo') {
      updates.push({ id: chunk.tag.id, sort_order: i++ });
      continue;
    }
    if (chunk.absorbedParent) {
      updates.push({ id: chunk.absorbedParent.id, sort_order: i++ });
    }
    const groupItems = containers[groupKey(chunk.prefix)] ?? [];
    for (const childId of groupItems) {
      updates.push({ id: childId, sort_order: i++ });
    }
  }
  return updates;
}

interface TagFlatListProps {
  tags: Tag[];
  visibleTagIds: Set<string>;
  tagCounts: Record<string, number>;
  onToggleTag: (tagId: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  onShowOnlyTag: (tagId: string) => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';
  /** モバイル時: DnD無効・メニュー簡略化 */
  isMobile?: boolean;
}

/**
 * タグフラットリスト（DnD並び替え付き）
 *
 * dnd-kit Multiple Containers パターン。
 * - root chunk (solo + group block) を __root__ SortableContext で並び替え
 * - group 内の子タグは nested SortableContext で並び替え
 * - cross-container drop は noop
 */
export function TagFlatList({
  tags,
  visibleTagIds,
  tagCounts,
  onToggleTag,
  onDeleteTag,
  onShowOnlyTag: _onShowOnlyTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  getGroupVisibility,
  isMobile,
}: TagFlatListProps) {
  // グループ折りたたみ状態
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // エントリ作成ポップアップの開閉（parent 集約 = 1 タグのみ開く）
  const [openPopoverTagId, setOpenPopoverTagId] = useState<string | null>(null);

  const toggleGroupCollapse = useCallback((prefix: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }, []);

  // グループ候補: ルート直下のフラットタグのみ（子タグは出さない）
  const groupOptions = useMemo<GroupOption[]>(() => {
    return tags
      .filter((tag) => parseColonTag(tag.name).suffix === null && tag.is_active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((tag) => ({ name: tag.name, color: tag.color, icon: tag.icon }));
  }, [tags]);

  // derive chunks + containers (server-derived)
  const serverDerived = useMemo(() => deriveDnd(tags), [tags]);

  // ローカル overlay: drag 中は setLocalContainers で state を上書き、
  // mutation onSettled でサーバーに戻す。
  const [localContainers, setLocalContainers] = useState<ContainersState | null>(null);
  const containers = localContainers ?? serverDerived.containers;

  const reorderMutation = useReorderTags();

  // DnD 状態
  const [activeId, setActiveId] = useState<string | null>(null);

  // sensors: PC は pointer + keyboard、モバイルは drag 無効（distance: Infinity）
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: isMobile ? Number.POSITIVE_INFINITY : 8 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(...(isMobile ? [pointerSensor] : [pointerSensor, keyboardSensor]));

  const findContainer = useCallback(
    (id: string): ContainerId | null => {
      if (id in containers) return id;
      for (const cid of Object.keys(containers)) {
        if ((containers[cid] ?? []).includes(id)) return cid;
      }
      return null;
    },
    [containers],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
      setOpenPopoverTagId(null);
      if (!localContainers) setLocalContainers(serverDerived.containers);
    },
    [localContainers, serverDerived.containers],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const activeContainer = findContainer(active.id as string);
      const overContainer = findContainer(over.id as string);
      if (!activeContainer || !overContainer) return;
      // cross-container drop は noop（階層変更は別経路）
      if (activeContainer !== overContainer) return;

      const current = containers[activeContainer] ?? [];
      const oldIndex = current.indexOf(active.id as string);
      const newIndex = current.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const nextContainers: ContainersState = {
        ...containers,
        [activeContainer]: arrayMove(current, oldIndex, newIndex),
      };
      setLocalContainers(nextContainers);

      const updates = flattenToSortOrder(nextContainers, serverDerived.chunkByDndId);
      reorderMutation.mutate(
        { updates },
        {
          onSettled: () => setLocalContainers(null),
        },
      );
    },
    [containers, findContainer, reorderMutation, serverDerived.chunkByDndId],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleRequestOpenPopover = useCallback((tagId: string) => {
    setOpenPopoverTagId(tagId);
  }, []);

  // ローカル containers をベースに chunks を再構築（drag 中の即時反映）
  const chunks = useMemo(() => {
    if (!localContainers) return serverDerived.chunks;
    const newRoot = localContainers[ROOT] ?? [];
    const result: Chunk[] = [];
    for (const dndId of newRoot) {
      const chunk = serverDerived.chunkByDndId.get(dndId);
      if (!chunk) continue;
      if (chunk.kind === 'solo') {
        result.push(chunk);
      } else {
        const childIds = localContainers[groupKey(chunk.prefix)] ?? [];
        const byId = new Map(chunk.children.map((c) => [c.id, c]));
        const reorderedChildren: Tag[] = [];
        for (const cid of childIds) {
          const t = byId.get(cid);
          if (t) reorderedChildren.push(t);
        }
        result.push({ ...chunk, children: reorderedChildren });
      }
    }
    return result;
  }, [localContainers, serverDerived]);

  // 衝突チェック (キャッシュから判定)
  const getUngroupConflicts = useCallback(
    (prefix: string): string[] => {
      const prefixPattern = `${prefix}:`;
      const existingNames = new Set(tags.map((t) => t.name));
      return tags
        .filter((t) => t.name.startsWith(prefixPattern))
        .map((t) => t.name.slice(prefixPattern.length))
        .filter((suffix) => existingNames.has(suffix));
    },
    [tags],
  );

  const findTagByName = useCallback(
    (name: string): Tag | undefined => tags.find((t) => t.name === name),
    [tags],
  );

  const activeTag: Tag | null = useMemo(() => {
    if (!activeId) return null;
    // solo / child 両方の可能性
    const chunk = serverDerived.chunkByDndId.get(activeId);
    if (chunk) {
      if (chunk.kind === 'solo') return chunk.tag;
      if (chunk.kind === 'group') {
        // absorbed parent のドラッグ
        if (chunk.absorbedParent) return chunk.absorbedParent;
        // virtual group: 最初の child を表示
        return chunk.children[0] ?? null;
      }
    }
    // child row のドラッグ: tags から検索
    return tags.find((t) => t.id === activeId) ?? null;
  }, [activeId, serverDerived.chunkByDndId, tags]);

  // モバイル: DnDなしの素のリスト描画
  if (isMobile) {
    return (
      <div role="list">
        {chunks.map((chunk) =>
          chunk.kind === 'solo' ? (
            <SortableTagItem
              key={chunk.dndId}
              tag={chunk.tag}
              allTags={tags}
              checked={visibleTagIds.has(chunk.tag.id)}
              groupOptions={groupOptions}
              isGrouped={false}
              isMobile
              onToggle={() => onToggleTag(chunk.tag.id)}
              onDeleteTag={() => onDeleteTag(chunk.tag.id, chunk.tag.name)}
              findTagByName={findTagByName}
              openPopoverTagId={openPopoverTagId}
              onOpenPopover={setOpenPopoverTagId}
              onRequestOpenPopover={handleRequestOpenPopover}
            />
          ) : (
            <SortableGroupBlock
              key={chunk.dndId}
              chunk={chunk}
              allTags={tags}
              tagCounts={tagCounts}
              visibleTagIds={visibleTagIds}
              groupOptions={groupOptions}
              collapsed={collapsedGroups.has(chunk.prefix)}
              isMobile
              onToggleTag={onToggleTag}
              onDeleteTag={onDeleteTag}
              onToggleGroupTags={onToggleGroupTags}
              onShowOnlyGroupTags={onShowOnlyGroupTags}
              getGroupVisibility={getGroupVisibility}
              onToggleCollapse={() => toggleGroupCollapse(chunk.prefix)}
              getUngroupConflicts={getUngroupConflicts}
              findTagByName={findTagByName}
              openPopoverTagId={openPopoverTagId}
              onOpenPopover={setOpenPopoverTagId}
              onRequestOpenPopover={handleRequestOpenPopover}
            />
          ),
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={containers[ROOT] ?? []} strategy={verticalListSortingStrategy}>
        <div role="list">
          {chunks.map((chunk) =>
            chunk.kind === 'solo' ? (
              <SortableTagItem
                key={chunk.dndId}
                tag={chunk.tag}
                allTags={tags}
                checked={visibleTagIds.has(chunk.tag.id)}
                groupOptions={groupOptions}
                isGrouped={false}
                isMobile={false}
                onToggle={() => onToggleTag(chunk.tag.id)}
                onDeleteTag={() => onDeleteTag(chunk.tag.id, chunk.tag.name)}
                findTagByName={findTagByName}
                openPopoverTagId={openPopoverTagId}
                onOpenPopover={setOpenPopoverTagId}
                onRequestOpenPopover={handleRequestOpenPopover}
              />
            ) : (
              <SortableGroupBlock
                key={chunk.dndId}
                chunk={chunk}
                allTags={tags}
                tagCounts={tagCounts}
                visibleTagIds={visibleTagIds}
                groupOptions={groupOptions}
                collapsed={collapsedGroups.has(chunk.prefix)}
                isMobile={false}
                onToggleTag={onToggleTag}
                onDeleteTag={onDeleteTag}
                onToggleGroupTags={onToggleGroupTags}
                onShowOnlyGroupTags={onShowOnlyGroupTags}
                getGroupVisibility={getGroupVisibility}
                onToggleCollapse={() => toggleGroupCollapse(chunk.prefix)}
                getUngroupConflicts={getUngroupConflicts}
                findTagByName={findTagByName}
                openPopoverTagId={openPopoverTagId}
                onOpenPopover={setOpenPopoverTagId}
                onRequestOpenPopover={handleRequestOpenPopover}
              />
            ),
          )}
        </div>
      </SortableContext>
      <DragOverlay>{activeTag ? <TagOverlayCard tag={activeTag} /> : null}</DragOverlay>
    </DndContext>
  );
}

/* ============================================================================
 * SortableGroupBlock — グループ全体（header + 子タグ）
 * ========================================================================== */

interface SortableGroupBlockProps {
  chunk: Extract<Chunk, { kind: 'group' }>;
  allTags: Tag[];
  tagCounts: Record<string, number>;
  visibleTagIds: Set<string>;
  groupOptions: GroupOption[];
  collapsed: boolean;
  isMobile: boolean;
  onToggleTag: (tagId: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';
  onToggleCollapse: () => void;
  getUngroupConflicts: (prefix: string) => string[];
  findTagByName: (name: string) => Tag | undefined;
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
  onRequestOpenPopover: (tagId: string) => void;
}

function SortableGroupBlock({
  chunk,
  allTags,
  tagCounts,
  visibleTagIds,
  groupOptions,
  collapsed,
  isMobile,
  onToggleTag,
  onDeleteTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  getGroupVisibility,
  onToggleCollapse,
  getUngroupConflicts,
  findTagByName,
  openPopoverTagId,
  onOpenPopover,
  onRequestOpenPopover,
}: SortableGroupBlockProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const updateTagMutation = useUpdateTag();
  const createTagMutation = useCreateTag();
  const renameGroupMutation = useRenameGroup();
  const ungroupTagsMutation = useUngroupTags();
  const deleteGroupMutation = useDeleteGroup();

  const { prefix, absorbedParent, children, dndId } = chunk;

  // GroupHeader は __root__ コンテナで drag 可能。
  // absorbed parent の id、もしくは virtual group の synthetic id を使う。
  const headerSortable = useSortable({
    id: dndId,
    disabled: isMobile,
  });

  const {
    displayColor,
    handleColorChange: _unused,
    handleIconChange: __unused,
  } = useFilterItemEdit({
    tagId: absorbedParent?.id ?? children[0]?.id ?? '',
    initialColor: absorbedParent?.color ?? children[0]?.color ?? undefined,
  });
  void _unused;
  void __unused;

  // group 単位の state
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [isCreatingInGroup, setIsCreatingInGroup] = useState(false);
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false);
  const [ungroupConflicts, setUngroupConflicts] = useState<string[] | null>(null);

  const groupTagIds = useMemo(() => {
    const ids = children.map((c) => c.id);
    if (absorbedParent) ids.unshift(absorbedParent.id);
    return ids;
  }, [children, absorbedParent]);

  const groupCount = useMemo(
    () => groupTagIds.reduce((sum, id) => sum + (tagCounts[id] ?? 0), 0),
    [groupTagIds, tagCounts],
  );

  const groupVisibility = getGroupVisibility(groupTagIds);

  // リネーム: 重複チェック対象
  const groupRenameExistingNames = useMemo(() => {
    const otherGroupPrefixes = new Set<string>();
    const rootNames = new Set<string>();
    for (const tag of allTags) {
      const { prefix: p, suffix: s } = parseColonTag(tag.name);
      if (s !== null) {
        if (p !== prefix) otherGroupPrefixes.add(p);
      } else {
        rootNames.add(tag.name);
      }
    }
    return [...otherGroupPrefixes, ...rootNames];
  }, [allTags, prefix]);

  const handleSaveGroupRename = useCallback(
    async (newPrefix: string) => {
      renameGroupMutation.mutate({ oldPrefix: prefix, newPrefix });
    },
    [prefix, renameGroupMutation],
  );

  const handleUngroupTags = useCallback(() => {
    const conflicts = getUngroupConflicts(prefix);
    if (conflicts.length > 0) {
      setUngroupConflicts(conflicts);
    } else {
      ungroupTagsMutation.mutate({ prefix });
    }
  }, [prefix, ungroupTagsMutation, getUngroupConflicts]);

  const handleConfirmUngroupWithMerge = useCallback(async () => {
    try {
      await ungroupTagsMutation.mutateAsync({ prefix, mergeConflicts: true });
    } finally {
      setUngroupConflicts(null);
    }
  }, [prefix, ungroupTagsMutation]);

  const handleDeleteGroup = useCallback(() => {
    if (groupCount === 0) {
      deleteGroupMutation.mutate({ prefix });
    } else {
      setShowDeleteGroupDialog(true);
    }
  }, [prefix, groupCount, deleteGroupMutation]);

  const handleConfirmDeleteGroup = useCallback(
    async (strategy: 'delete_entries' | 'reassign', targetTagId?: string) => {
      try {
        await deleteGroupMutation.mutateAsync({ prefix, strategy, targetTagId });
      } finally {
        setShowDeleteGroupDialog(false);
      }
    },
    [prefix, deleteGroupMutation],
  );

  const availableTagsForGroupReassign = useMemo(() => {
    const groupIdSet = new Set(groupTagIds);
    return allTags.filter((tag) => !groupIdSet.has(tag.id));
  }, [allTags, groupTagIds]);

  const handleGroupColorChange = useCallback(
    (color: TagColorName) => {
      for (const id of groupTagIds) {
        updateTagMutation.mutate({ id, color });
      }
    },
    [groupTagIds, updateTagMutation],
  );

  const handleParentIconChange = useCallback(
    (icon: string | null) => {
      if (!absorbedParent) return;
      updateTagMutation.mutate({ id: absorbedParent.id, icon });
    },
    [absorbedParent, updateTagMutation],
  );

  const navigateToTagStats = useCallback(
    (tagId: string) => {
      router.push(`/${locale}/stats/tags/${tagId}`);
    },
    [router, locale],
  );

  const headerIcon = absorbedParent?.icon ?? children[0]?.icon ?? null;

  const style = isMobile
    ? undefined
    : {
        transform: CSS.Translate.toString(headerSortable.transform),
        transition: headerSortable.transition,
      };

  const isHeaderDragging = headerSortable.isDragging;
  const isGroupRowPopoverOpen = absorbedParent != null && openPopoverTagId === absorbedParent.id;

  return (
    <>
      <div
        ref={headerSortable.setNodeRef}
        style={style}
        className={cn(!isMobile && isHeaderDragging && 'z-10 cursor-grabbing opacity-50')}
        {...(isMobile ? {} : { ...headerSortable.attributes, ...headerSortable.listeners })}
        draggable={false}
        role="listitem"
      >
        <div className="relative">
          <GroupHeader
            label={prefix}
            checked={groupVisibility === 'all'}
            indeterminate={groupVisibility === 'some'}
            collapsed={collapsed}
            displayColor={displayColor}
            isMobile={isMobile}
            onCheckedChange={() => onToggleGroupTags(groupTagIds)}
            onToggleCollapse={onToggleCollapse}
            onShowOnlyGroup={() => onShowOnlyGroupTags(groupTagIds)}
            onColorChange={handleGroupColorChange}
            onIconChange={absorbedParent ? handleParentIconChange : undefined}
            currentIcon={headerIcon}
            onAddTagToGroup={() => setIsCreatingInGroup(true)}
            onRenameGroup={() => setIsEditingGroupName(true)}
            onUngroupTags={handleUngroupTags}
            onViewStats={() => navigateToTagStats(absorbedParent?.id ?? children[0]?.id ?? '')}
            onDeleteGroup={handleDeleteGroup}
            onRowClick={absorbedParent ? () => onRequestOpenPopover(absorbedParent.id) : undefined}
            highlighted={isGroupRowPopoverOpen}
            renameEditing={isEditingGroupName}
            onSaveRename={handleSaveGroupRename}
            onDoneRenameEditing={() => setIsEditingGroupName(false)}
            renameExistingNames={groupRenameExistingNames}
          />
          {isGroupRowPopoverOpen && absorbedParent ? (
            <TagEntryCreatePopover
              open
              onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? absorbedParent.id : null)}
              tag={{
                id: absorbedParent.id,
                name: absorbedParent.name,
                color: displayColor,
                icon: absorbedParent.icon ?? headerIcon,
              }}
              defaultDurationMinutes={30}
              isMobile={isMobile}
            />
          ) : null}
        </div>
      </div>

      {/* グループ内へのインライン作成フォーム */}
      {isCreatingInGroup && (
        <div className="pr-2 pl-4">
          <InlineTagCreateRow
            variant="row"
            defaultGroup={prefix}
            defaultColor={resolveTagColor(displayColor)}
            existingTags={allTags}
            onSubmit={(name, color) => {
              createTagMutation.mutate({ name, color });
              setIsCreatingInGroup(false);
            }}
            onCancel={() => setIsCreatingInGroup(false)}
          />
        </div>
      )}

      {/* 子タグ: nested SortableContext */}
      {!collapsed && (
        <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <SortableTagItem
              key={child.id}
              tag={child}
              allTags={allTags}
              checked={visibleTagIds.has(child.id)}
              groupOptions={groupOptions}
              isGrouped
              groupPrefix={prefix}
              isMobile={isMobile}
              onToggle={() => onToggleTag(child.id)}
              onDeleteTag={() => onDeleteTag(child.id, child.name)}
              findTagByName={findTagByName}
              openPopoverTagId={openPopoverTagId}
              onOpenPopover={onOpenPopover}
              onRequestOpenPopover={onRequestOpenPopover}
            />
          ))}
        </SortableContext>
      )}

      <TagDeleteStrategyDialog
        open={showDeleteGroupDialog}
        onClose={() => setShowDeleteGroupDialog(false)}
        onConfirm={handleConfirmDeleteGroup}
        tagName={prefix}
        entryCount={groupCount}
        availableTags={availableTagsForGroupReassign}
      />

      <ConfirmDialog
        open={ungroupConflicts !== null}
        onClose={() => setUngroupConflicts(null)}
        onConfirm={handleConfirmUngroupWithMerge}
        title={t('calendar.filter.ungroupConflict.title')}
        description={t('calendar.filter.ungroupConflict.description', {
          names: ungroupConflicts?.join(', ') ?? '',
        })}
        variant="warning"
      />
    </>
  );
}

/* ============================================================================
 * SortableTagItem — 1 タグ行（solo or group child）
 * ========================================================================== */

interface SortableTagItemProps {
  tag: Tag;
  allTags: Tag[];
  checked: boolean;
  groupOptions: GroupOption[];
  isGrouped: boolean;
  /** isGrouped=true のとき必須 */
  groupPrefix?: string;
  isMobile: boolean;
  onToggle: () => void;
  onDeleteTag: () => void;
  findTagByName: (name: string) => Tag | undefined;
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
  onRequestOpenPopover: (tagId: string) => void;
}

function SortableTagItem({
  tag,
  allTags,
  checked,
  groupOptions,
  isGrouped,
  groupPrefix,
  isMobile,
  onToggle,
  onDeleteTag,
  findTagByName,
  openPopoverTagId,
  onOpenPopover,
  onRequestOpenPopover,
}: SortableTagItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
    disabled: isMobile,
  });
  const updateTagMutation = useUpdateTag();
  const mergeTagMutation = useMergeTag();
  const { showOnlyTag } = useCalendarFilterStore();
  const { openTagMergeModal } = useTagModalNavigation();

  const navigateToTagStats = useCallback(
    (tagId: string) => {
      router.push(`/${locale}/stats/tags/${tagId}`);
    },
    [router, locale],
  );

  const { displayColor, handleColorChange, handleIconChange } = useFilterItemEdit({
    tagId: tag.id,
    initialColor: tag.color ?? undefined,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupChangeConflict, setGroupChangeConflict] = useState<{
    targetTagId: string;
    newName: string;
  } | null>(null);

  const { suffix } = useMemo(() => parseColonTag(tag.name), [tag.name]);
  const currentGroup = groupPrefix ?? '';

  const tagRenameExistingNames = useMemo(() => {
    if (isGrouped) {
      const prefixPattern = `${currentGroup}:`;
      return allTags
        .filter((other) => other.id !== tag.id && other.name.startsWith(prefixPattern))
        .map((other) => other.name.slice(prefixPattern.length));
    }
    return allTags
      .filter((other) => other.id !== tag.id && parseColonTag(other.name).suffix === null)
      .map((other) => other.name);
  }, [allTags, tag.id, isGrouped, currentGroup]);

  const handleSaveRename = useCallback(
    async (newName: string) => {
      const fullName = isGrouped ? buildColonTagName(currentGroup, newName) : newName;
      updateTagMutation.mutate({ id: tag.id, name: fullName });
    },
    [tag.id, isGrouped, currentGroup, updateTagMutation],
  );

  const handleChangeGroup = useCallback(
    (newGroup: string | null) => {
      const baseName = suffix ?? tag.name;
      const newName = newGroup ? buildColonTagName(newGroup, baseName) : baseName;

      const existingTag = findTagByName(newName);
      if (existingTag && existingTag.id !== tag.id) {
        setGroupChangeConflict({ targetTagId: existingTag.id, newName });
        return;
      }
      updateTagMutation.mutate({ id: tag.id, name: newName });
    },
    [tag.id, tag.name, suffix, updateTagMutation, findTagByName],
  );

  const handleConfirmGroupChangeMerge = useCallback(async () => {
    if (!groupChangeConflict) return;
    try {
      await mergeTagMutation.mutateAsync({
        sourceTagId: tag.id,
        targetTagId: groupChangeConflict.targetTagId,
      });
    } finally {
      setGroupChangeConflict(null);
    }
  }, [tag.id, groupChangeConflict, mergeTagMutation]);

  const displayLabel = getTagDisplayLabel(tag.name, isGrouped);

  const style = isMobile
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
      };

  const isRowPopoverOpen = openPopoverTagId === tag.id;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(!isMobile && isDragging && 'z-10 cursor-grabbing opacity-50')}
        {...(isMobile ? {} : { ...attributes, ...listeners })}
        draggable={false}
        role="listitem"
      >
        <div
          className={cn(
            'group/item relative flex cursor-pointer items-center rounded-lg text-sm',
            isMobile ? 'h-11' : 'h-8',
            !isMobile && isDragging && 'cursor-grabbing',
            'hover:bg-state-hover',
            menuOpen && 'bg-state-selected',
            isRowPopoverOpen && 'bg-state-selected',
            isGrouped && 'pl-4',
            !checked && 'opacity-50',
          )}
          onClick={() => onRequestOpenPopover(tag.id)}
        >
          <span className="ml-2 shrink-0">
            <TagIcon icon={tag.icon} color={displayColor} size="sm" />
          </span>

          {isEditingName ? (
            <span className="ml-2 min-w-0 flex-1">
              <InlineTagNameEdit
                value={displayLabel}
                onSave={handleSaveRename}
                existingNames={tagRenameExistingNames}
                editing={isEditingName}
                onDoneEditing={() => setIsEditingName(false)}
                ariaLabel={displayLabel}
              />
            </span>
          ) : (
            <HoverTooltip
              content={tag.name}
              side="top"
              disabled={menuOpen}
              wrapperClassName="ml-2 min-w-0 flex-1"
            >
              <span className="min-w-0 truncate">{displayLabel}</span>
            </HoverTooltip>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={checked ? t('calendar.filter.hide') : t('calendar.filter.show')}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-['']",
              checked ? 'opacity-0 group-hover/item:opacity-100' : 'opacity-100',
              isMobile && 'opacity-100',
            )}
          >
            {checked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>

          <div className="w-1 shrink-0" />

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('calendar.filter.tagMenu')}
                // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element touch target
                className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover/item:opacity-100 before:absolute before:-inset-2 before:content-[''] [@media(hover:none)]:opacity-100"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <FilterItemMenu
              displayColor={displayColor}
              currentIcon={tag.icon}
              currentGroup={suffix !== null ? currentGroup : null}
              currentTagName={tag.name}
              groupOptions={groupOptions}
              isGrouped={isGrouped}
              isMobile={isMobile}
              onOpenRenameDialog={() => setIsEditingName(true)}
              onColorChange={handleColorChange}
              onIconChange={handleIconChange}
              onChangeGroup={handleChangeGroup}
              onOpenMergeModal={() =>
                openTagMergeModal({ id: tag.id, name: tag.name, color: tag.color ?? null })
              }
              onShowOnlyTag={() => showOnlyTag(tag.id)}
              onViewStats={() => navigateToTagStats(tag.id)}
              onDeleteTag={onDeleteTag}
            />
          </DropdownMenu>

          {isRowPopoverOpen ? (
            <TagEntryCreatePopover
              open
              onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? tag.id : null)}
              tag={{ id: tag.id, name: tag.name, color: displayColor, icon: tag.icon }}
              defaultDurationMinutes={30}
              isMobile={isMobile}
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={groupChangeConflict !== null}
        onClose={() => setGroupChangeConflict(null)}
        onConfirm={handleConfirmGroupChangeMerge}
        title={t('calendar.filter.ungroupConflict.title')}
        description={t('calendar.filter.ungroupConflict.description', {
          names: groupChangeConflict?.newName ?? '',
        })}
        variant="warning"
      />
    </>
  );
}

/* ============================================================================
 * TagOverlayCard — DragOverlay ghost
 * ========================================================================== */

function TagOverlayCard({ tag }: { tag: Tag }) {
  const color = resolveTagColor(tag.color);
  const { suffix } = parseColonTag(tag.name);
  const label = suffix ?? tag.name;
  return (
    <div className="bg-card shadow-card flex cursor-grabbing items-center gap-2 rounded-lg border p-2 text-sm">
      <TagIcon icon={tag.icon} color={color} size="sm" />
      <span className="truncate">{label}</span>
    </div>
  );
}
