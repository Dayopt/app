'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import { useVirtualizer } from '@tanstack/react-virtual';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
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

import type { DragEndEvent } from '@dnd-kit/core';

/** 各タグの表示情報（隣接グルーピング判定結果） */
interface TagDisplayInfo {
  tag: Tag;
  prefix: string;
  suffix: string | null;
  /** 隣接する同prefix タグが存在し、グループとして表示するか */
  isGrouped: boolean;
  /** グループの先頭タグか（GroupHeader を描画する位置） */
  isFirstInGroup: boolean;
  /** 同グループに属するタグID一覧 */
  groupTagIds: string[];
  /** グループ全体のカウント合計 */
  groupCount: number;
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
 * 見本準拠: ref + attributes + listeners + style が全て同一要素
 * 隣接する同プレフィックスタグは GroupHeader 付きでグループ表示
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

  // グループ候補: ルート直下のフラットタグのみ（子タグは出さない）。並びはサイドバーと同じ sort_order
  const groupOptions = useMemo<GroupOption[]>(() => {
    return tags
      .filter((tag) => parseColonTag(tag.name).suffix === null && tag.is_active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((tag) => ({ name: tag.name, color: tag.color, icon: tag.icon }));
  }, [tags]);

  // プレフィックスでグルーピング（sort_order は触らず、UI表示時にまとめる）
  // 同プレフィックスのコロンタグは位置に関係なくグループ化
  // フラットタグがグループprefixと一致する場合はグループに吸収（重複表示防止）
  const { sortedTags, tagDisplayInfos } = useMemo(() => {
    const parsed = tags.map((tag) => ({
      tag,
      ...parseColonTag(tag.name),
    }));

    // グループ収集: prefix → メンバー一覧（コロン付きタグのみ）
    const groups = new Map<string, typeof parsed>();
    for (const item of parsed) {
      if (item.suffix !== null) {
        const members = groups.get(item.prefix) ?? [];
        members.push(item);
        groups.set(item.prefix, members);
      }
    }

    // 親タグ吸収: フラットタグ名がグループprefixと一致 → グループに統合
    // 例: フラットタグ "開発" + グループ "開発:API" → "開発" をGroupHeaderに吸収
    const absorbedParents = new Map<string, string>(); // prefix → absorbed tag ID
    for (const item of parsed) {
      if (item.suffix === null && groups.has(item.tag.name)) {
        absorbedParents.set(item.tag.name, item.tag.id);
      }
    }
    const absorbedIds = new Set(absorbedParents.values());

    // コロン記法のタグは1つでもグループとして表示する
    const groupPrefixes = new Set<string>(groups.keys());

    // 表示順を構築: 独立タグは元の位置を維持、グループは最初のメンバーの位置にまとめる
    // 吸収された親タグは個別行としてスキップ（GroupHeaderに統合されるため）
    const sorted: typeof parsed = [];
    const placed = new Set<string>(); // 配置済みタグID

    for (const item of parsed) {
      if (placed.has(item.tag.id)) continue;

      // 吸収された親タグは個別行としてスキップ
      if (absorbedIds.has(item.tag.id)) {
        placed.add(item.tag.id);
        continue;
      }

      if (item.suffix !== null && groupPrefixes.has(item.prefix)) {
        // グループの最初の出現位置にメンバーをまとめて配置
        const members = groups.get(item.prefix)!;
        for (const member of members) {
          if (!placed.has(member.tag.id)) {
            sorted.push(member);
            placed.add(member.tag.id);
          }
        }
      } else {
        sorted.push(item);
        placed.add(item.tag.id);
      }
    }

    // グループ情報を付与
    const infos: TagDisplayInfo[] = sorted.map((item, i) => {
      const isGrouped = item.suffix !== null && groupPrefixes.has(item.prefix);
      const prev = sorted[i - 1] as typeof item | undefined;
      const isFirstInGroup = isGrouped && !(prev?.suffix != null && prev.prefix === item.prefix);

      let groupTagIds: string[] = [];
      let groupCount = 0;
      if (isGrouped) {
        const memberIds = (groups.get(item.prefix) ?? []).map((m) => m.tag.id);
        // 吸収された親タグのIDも含める（フィルター操作で一括制御するため）
        const parentId = absorbedParents.get(item.prefix);
        groupTagIds = parentId ? [parentId, ...memberIds] : memberIds;
        groupCount = groupTagIds.reduce((sum, id) => sum + (tagCounts[id] ?? 0), 0);
      }

      return {
        tag: item.tag,
        prefix: item.prefix,
        suffix: item.suffix,
        isGrouped,
        isFirstInGroup,
        groupTagIds,
        groupCount,
      };
    });

    return { sortedTags: sorted.map((s) => s.tag), tagDisplayInfos: infos };
  }, [tags, tagCounts]);

  const displayIds = useMemo(() => sortedTags.map((t) => t.id), [sortedTags]);

  /**
   * DnD セクション分割: dnd-kit の `over` 判定を同セクション内に限定するため、
   * root (グループ外) と group (プレフィックス別) を別の `SortableContext` に分離する。
   *
   * これにより、子タグを別グループ／ルートへドラッグしても `over` にならず、
   * flat sort_order とグループ contiguous 表示ロジックの矛盾（2+ 子タグでの並び替え異常）が
   * 構造的に起きなくなる。
   */

  /** active/over のセクションキーを割り出す（root or group:<prefix>） */
  const getSectionKeyForTagId = useCallback(
    (tagId: string): string | null => {
      const info = tagDisplayInfos.find((i) => i.tag.id === tagId);
      if (!info) return null;
      return info.isGrouped ? `group:${info.prefix}` : '__root__';
    },
    [tagDisplayInfos],
  );

  /**
   * active と同じセクションの droppable だけを候補にする collision detection。
   *
   * nested SortableContext では `droppable` は DndContext 全体で共有されるため、
   * items 分離だけでは cross-section drop を防げない。DndContext の collisionDetection で
   * `droppableContainers` を filter することで、`over` が別セクションの item にならないようにする。
   */
  const sectionScopedCollisionDetection = useCallback<
    NonNullable<React.ComponentProps<typeof DndContext>['collisionDetection']>
  >(
    (args) => {
      const activeId = args.active.id;
      const activeSection = getSectionKeyForTagId(activeId as string);
      if (activeSection == null) return closestCenter(args);

      const filteredContainers = args.droppableContainers.filter((container) => {
        const section = getSectionKeyForTagId(container.id as string);
        return section === activeSection;
      });

      return closestCenter({ ...args, droppableContainers: filteredContainers });
    },
    [getSectionKeyForTagId],
  );

  const reorderMutation = useReorderTags();

  // DnD 並び替えは一時 pause（親配下 2+ 子タグのケースで破綻するため、ポップアップ実装を
  // 優先する。復活させるときは distance 値を戻す）。コード / reorderMutation / useSortable /
  // sort_order スキーマはすべて残したまま、sensor の activationConstraint で発動のみ止める。
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: Number.POSITIVE_INFINITY },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  // PC でもキーボード drag は pause（keyboardSensor を配列に含めない）
  const sensors = useSensors(...(isMobile ? [] : [pointerSensor]));
  // keyboardSensor は `React hooks rules` 遵守のため呼び出しは残す
  void keyboardSensor;

  // drag 直後の trailing click（ブラウザが pointerup 後に発火する click）を無効化するための
  // タイムスタンプ。useSortable の isDragging は drag 完了時点で false に戻るため
  // SortableTagItem の onClick から参照しても guard にならない。parent でタイムスタンプを持つ。
  const dragEndedAtRef = useRef(0);

  const handleDragStart = useCallback(() => {
    // drag 中はポップアップが開いている状態にしない（誤って開いたままだと re-render が
    // 重なり dnd-kit の計測タイミングと干渉しうる）
    setOpenPopoverTagId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      dragEndedAtRef.current = Date.now();

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // 安全弁: nested SortableContext が正しく効いていれば active と over は必ず同セクション。
      // 万一 collision detection がまたいでしまった場合でも data corruption を避けるため
      // cross-section drop は reject する。
      const activeSection = getSectionKeyForTagId(active.id as string);
      const overSection = getSectionKeyForTagId(over.id as string);
      if (activeSection == null || overSection == null) return;
      if (activeSection !== overSection) return;

      const oldIndex = displayIds.indexOf(active.id as string);
      const newIndex = displayIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(displayIds, oldIndex, newIndex);
      reorderMutation.mutate({
        updates: newOrder.map((id, i) => ({ id, sort_order: i })),
      });
    },
    [displayIds, reorderMutation, getSectionKeyForTagId],
  );

  const handleDragCancel = useCallback(() => {
    dragEndedAtRef.current = Date.now();
  }, []);

  /**
   * 行クリックでポップアップを開く要求。drag 直後 300ms 以内のクリックは
   * trailing click と見做して無視する（dnd-kit の click 抑止は outer listener
   * の要素にしか効かず、nested onClick には効かないため）。
   */
  const handleRequestOpenPopover = useCallback((tagId: string) => {
    if (Date.now() - dragEndedAtRef.current < 300) return;
    setOpenPopoverTagId(tagId);
  }, []);

  // グループ解除時の衝突チェック（キャッシュから判定）
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

  // 名前からタグを検索（個別タグ移動時の衝突チェック用）
  const findTagByName = useCallback(
    (name: string): Tag | undefined => tags.find((t) => t.name === name),
    [tags],
  );

  // 表示対象のアイテム（折りたたみ非表示を除外）のインデックスを事前計算
  const visibleIndices = useMemo(() => {
    return tagDisplayInfos
      .map((info, i) => ({ info, i }))
      .filter(({ info }) => {
        const isHiddenByCollapse =
          info.isGrouped && !info.isFirstInGroup && collapsedGroups.has(info.prefix);
        return !isHiddenByCollapse;
      })
      .map(({ i }) => i);
  }, [tagDisplayInfos, collapsedGroups]);

  // 仮想スクロール: 表示アイテムが多い場合のみ有効化
  const VIRTUALIZATION_THRESHOLD = 30;
  const shouldVirtualize = visibleIndices.length > VIRTUALIZATION_THRESHOLD;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // アイテム高さ推定: GroupHeader付き = 60px, 通常 = 32px
  const TAG_ROW_HEIGHT = 32;
  const GROUP_HEADER_HEIGHT = 28;

  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizerの返り値はこのコンポーネント内でのみ使用し、子へのメモ化伝播は不要
  const virtualizer = useVirtualizer({
    count: visibleIndices.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const realIndex = visibleIndices[index];
      if (realIndex === undefined) return TAG_ROW_HEIGHT;
      const info = tagDisplayInfos[realIndex];
      if (!info) return TAG_ROW_HEIGHT;
      return info.isFirstInGroup ? TAG_ROW_HEIGHT + GROUP_HEADER_HEIGHT : TAG_ROW_HEIGHT;
    },
    overscan: 5,
    enabled: shouldVirtualize,
  });

  const renderItem = (info: TagDisplayInfo) => (
    <SortableTagItem
      key={info.tag.id}
      tag={info.tag}
      allTags={tags}
      checked={visibleTagIds.has(info.tag.id)}
      groupOptions={groupOptions}
      isGrouped={info.isGrouped}
      isFirstInGroup={info.isFirstInGroup}
      groupTagIds={info.groupTagIds}
      groupCount={info.groupCount}
      groupVisibility={info.isGrouped ? getGroupVisibility(info.groupTagIds) : 'none'}
      collapsed={collapsedGroups.has(info.prefix)}
      isMobile={isMobile ?? false}
      onToggle={() => onToggleTag(info.tag.id)}
      onDeleteTag={() => onDeleteTag(info.tag.id, info.tag.name)}
      onToggleGroupTags={onToggleGroupTags}
      onShowOnlyGroupTags={onShowOnlyGroupTags}
      onToggleCollapse={() => toggleGroupCollapse(info.prefix)}
      getUngroupConflicts={getUngroupConflicts}
      findTagByName={findTagByName}
      openPopoverTagId={openPopoverTagId}
      onOpenPopover={setOpenPopoverTagId}
      onRequestOpenPopover={handleRequestOpenPopover}
    />
  );

  // モバイル: DnDなしの素のリスト描画
  if (isMobile) {
    return <div role="list">{tagDisplayInfos.map((info) => renderItem(info))}</div>;
  }

  /**
   * 単一 SortableContext + custom collisionDetection で セクション（root / group 別）を分離。
   *
   * 設計メモ: nested SortableContext は dnd-kit 仕様上 `droppable` 判定を
   * 分離しない（SortableContext は items/strategy の provider のみ、droppable は
   * DndContext 全体で共有される）。そのため、nested を使うと見た目は整うものの
   * 実際の drag 検出には効かず、handleDragEnd の後段 guard に頼るだけになる。
   *
   * 本実装では **custom collisionDetection** で active と同セクションの droppable
   * のみを候補にする → 他セクションは `over` にならず、drag 中の視覚フィードバックも
   * 同セクション内だけに限定される。handleDragEnd の cross-section guard は安全弁。
   */

  // 仮想化が不要な場合
  if (!shouldVirtualize) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={sectionScopedCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={displayIds} strategy={verticalListSortingStrategy}>
          <div role="list">{tagDisplayInfos.map((info) => renderItem(info))}</div>
        </SortableContext>
      </DndContext>
    );
  }

  // 仮想化モード: 表示範囲のアイテムのみレンダリング。
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sectionScopedCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={displayIds} strategy={verticalListSortingStrategy}>
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto"
          role="list"
          style={{ maxHeight: '50vh' }}
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const realIndex = visibleIndices[virtualRow.index];
              if (realIndex === undefined) return null;
              const info = tagDisplayInfos[realIndex];
              if (!info) return null;
              return (
                <div
                  key={info.tag.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderItem(info)}
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTagItem({
  tag,
  allTags,
  checked,
  groupOptions,
  isGrouped,
  isFirstInGroup,
  groupTagIds,
  groupCount,
  groupVisibility,
  collapsed,
  isMobile,
  onToggle,
  onDeleteTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  onToggleCollapse,
  getUngroupConflicts,
  findTagByName,
  openPopoverTagId,
  onOpenPopover,
  onRequestOpenPopover,
}: {
  tag: Tag;
  allTags: Tag[];
  checked: boolean;
  groupOptions: GroupOption[];
  isGrouped: boolean;
  isFirstInGroup: boolean;
  groupTagIds: string[];
  groupCount: number;
  groupVisibility: 'all' | 'none' | 'some';
  collapsed: boolean;
  isMobile?: boolean;
  onToggle: () => void;
  onDeleteTag: () => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  onToggleCollapse: () => void;
  getUngroupConflicts: (prefix: string) => string[];
  findTagByName: (name: string) => Tag | undefined;
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
  /** 行クリックで popover を開く要求（drag 直後 300ms は parent 側で弾く） */
  onRequestOpenPopover: (tagId: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });
  const updateTagMutation = useUpdateTag();
  const createTagMutation = useCreateTag();
  const mergeTagMutation = useMergeTag();
  const renameGroupMutation = useRenameGroup();
  const ungroupTagsMutation = useUngroupTags();
  const deleteGroupMutation = useDeleteGroup();
  const { showOnlyTag } = useCalendarFilterStore();
  const { openTagMergeModal } = useTagModalNavigation();
  const router = useRouter();

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
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [isCreatingInGroup, setIsCreatingInGroup] = useState(false);
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false);
  const [ungroupConflicts, setUngroupConflicts] = useState<string[] | null>(null);
  const [groupChangeConflict, setGroupChangeConflict] = useState<{
    targetTagId: string;
    newName: string;
  } | null>(null);

  // コロン記法のプレフィックス（グループ名）
  const { prefix: currentGroup, suffix } = useMemo(() => parseColonTag(tag.name), [tag.name]);

  // インライン編集用: 重複チェック対象の既存名一覧
  const tagRenameExistingNames = useMemo(() => {
    if (isGrouped) {
      // 同グループ内の他タグの suffix 部分
      const prefixPattern = `${currentGroup}:`;
      return allTags
        .filter((t) => t.id !== tag.id && t.name.startsWith(prefixPattern))
        .map((t) => t.name.slice(prefixPattern.length));
    }
    // ルート直下の他タグ名
    return allTags
      .filter((t) => t.id !== tag.id && parseColonTag(t.name).suffix === null)
      .map((t) => t.name);
  }, [allTags, tag.id, isGrouped, currentGroup]);

  // グループ名 rename 用の重複チェック対象（他のグループ prefix + ルート直下のタグ名）
  const groupRenameExistingNames = useMemo(() => {
    const otherGroupPrefixes = new Set<string>();
    const rootNames = new Set<string>();
    for (const t of allTags) {
      const { prefix: p, suffix: s } = parseColonTag(t.name);
      if (s !== null) {
        if (p !== currentGroup) otherGroupPrefixes.add(p);
      } else {
        rootNames.add(t.name);
      }
    }
    return [...otherGroupPrefixes, ...rootNames];
  }, [allTags, currentGroup]);

  const handleSaveRename = useCallback(
    async (newName: string) => {
      // グループ内タグはプレフィックスを再付与
      const fullName = isGrouped ? buildColonTagName(currentGroup, newName) : newName;
      updateTagMutation.mutate({ id: tag.id, name: fullName });
    },
    [tag.id, isGrouped, currentGroup, updateTagMutation],
  );

  const handleChangeGroup = useCallback(
    (newGroup: string | null) => {
      const baseName = suffix ?? tag.name;
      const newName = newGroup ? buildColonTagName(newGroup, baseName) : baseName;

      // 衝突チェック: 移動先の名前が既存タグと重複するか
      const existingTag = findTagByName(newName);
      if (existingTag && existingTag.id !== tag.id) {
        setGroupChangeConflict({ targetTagId: existingTag.id, newName });
        return;
      }

      // 衝突なし → 通常のリネーム（色は継承しない。各タグが独立した色を保持）
      updateTagMutation.mutate({
        id: tag.id,
        name: newName,
      });
    },
    [tag.id, tag.name, suffix, updateTagMutation, findTagByName],
  );

  // グループリネームハンドラー
  const handleSaveGroupRename = useCallback(
    async (newPrefix: string) => {
      renameGroupMutation.mutate({ oldPrefix: currentGroup, newPrefix });
    },
    [currentGroup, renameGroupMutation],
  );

  // グループ解除ハンドラー（衝突チェック付き）
  const handleUngroupTags = useCallback(() => {
    const conflicts = getUngroupConflicts(currentGroup);
    if (conflicts.length > 0) {
      setUngroupConflicts(conflicts);
    } else {
      ungroupTagsMutation.mutate({ prefix: currentGroup });
    }
  }, [currentGroup, ungroupTagsMutation, getUngroupConflicts]);

  // 衝突確認後のマージ付きグループ解除
  const handleConfirmUngroupWithMerge = useCallback(async () => {
    try {
      await ungroupTagsMutation.mutateAsync({ prefix: currentGroup, mergeConflicts: true });
    } finally {
      setUngroupConflicts(null);
    }
  }, [currentGroup, ungroupTagsMutation]);

  // グループ変更時の衝突確認 → マージ
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

  // グループ削除ハンドラー: エントリ0件なら即削除、1件以上ならダイアログ表示
  const handleDeleteGroup = useCallback(() => {
    if (groupCount === 0) {
      deleteGroupMutation.mutate({ prefix: currentGroup });
    } else {
      setShowDeleteGroupDialog(true);
    }
  }, [currentGroup, groupCount, deleteGroupMutation]);

  // グループ削除確認後のハンドラー（ストラテジー付き）
  const handleConfirmDeleteGroup = useCallback(
    async (strategy: 'delete_entries' | 'reassign', targetTagId?: string) => {
      try {
        await deleteGroupMutation.mutateAsync({ prefix: currentGroup, strategy, targetTagId });
      } finally {
        setShowDeleteGroupDialog(false);
      }
    },
    [currentGroup, deleteGroupMutation],
  );

  // グループ削除ダイアログ用: グループ外のタグ一覧
  const availableTagsForGroupReassign = useMemo(() => {
    const groupIdSet = new Set(groupTagIds);
    return allTags.filter((t) => !groupIdSet.has(t.id));
  }, [allTags, groupTagIds]);

  // グループ色変更ハンドラー（グループ内全タグの色を一括更新）
  const handleGroupColorChange = useCallback(
    (color: TagColorName) => {
      for (const id of groupTagIds) {
        updateTagMutation.mutate({ id, color });
      }
    },
    [groupTagIds, updateTagMutation],
  );

  // グループ親タグのアイコン変更（吸収された親タグのIDで更新）
  const parentTag = findTagByName(currentGroup);
  const handleParentIconChange = useCallback(
    (icon: string | null) => {
      const targetId = parentTag?.id;
      if (!targetId) return;
      updateTagMutation.mutate({ id: targetId, icon });
    },
    [parentTag?.id, updateTagMutation],
  );

  // 表示名: グループ内ならsuffix部分のみ
  const displayLabel = getTagDisplayLabel(tag.name, isGrouped);

  const style = isMobile
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
      };

  // 折りたたみ時: グループ先頭以外は非表示
  const isHiddenByCollapse = isGrouped && !isFirstInGroup && collapsed;

  // ポップアップ開閉状態（子タグ行 / グループ親行の 2 箇所で判定する）
  const isChildRowPopoverOpen = openPopoverTagId === tag.id;
  const isGroupRowPopoverOpen = parentTag != null && openPopoverTagId === parentTag.id;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          !isMobile && isDragging && 'z-10 cursor-grabbing opacity-50',
          isHiddenByCollapse && 'hidden',
        )}
        {...(isMobile ? {} : { ...attributes, ...listeners })}
        // ブラウザ native HTML5 DnD の copy cursor を抑止（dnd-kit は pointer events 使用）
        draggable={false}
        role="listitem"
      >
        {/* グループ先頭タグの場合、GroupHeader を描画
            吸収された親タグ (parentTag) があれば行クリックで popover を開く。
            無い場合（仮想グループ）は onRowClick 未指定で既存の「行クリック=開閉」に fallback。
            popover は GroupHeader を包む relative div に anchor する。 */}
        {isFirstInGroup && (
          <div className="relative">
            <GroupHeader
              label={currentGroup}
              checked={groupVisibility === 'all'}
              indeterminate={groupVisibility === 'some'}
              collapsed={collapsed}
              displayColor={displayColor}
              isMobile={isMobile ?? false}
              onCheckedChange={() => onToggleGroupTags(groupTagIds)}
              onToggleCollapse={onToggleCollapse}
              onShowOnlyGroup={() => onShowOnlyGroupTags(groupTagIds)}
              onColorChange={handleGroupColorChange}
              onIconChange={parentTag ? handleParentIconChange : undefined}
              currentIcon={parentTag?.icon ?? tag.icon}
              onAddTagToGroup={() => setIsCreatingInGroup(true)}
              onRenameGroup={() => setIsEditingGroupName(true)}
              onUngroupTags={handleUngroupTags}
              onViewStats={() => navigateToTagStats(parentTag?.id ?? tag.id)}
              onDeleteGroup={handleDeleteGroup}
              onRowClick={parentTag ? () => onRequestOpenPopover(parentTag.id) : undefined}
              highlighted={isGroupRowPopoverOpen}
              renameEditing={isEditingGroupName}
              onSaveRename={handleSaveGroupRename}
              onDoneRenameEditing={() => setIsEditingGroupName(false)}
              renameExistingNames={groupRenameExistingNames}
            />
            {isGroupRowPopoverOpen && parentTag ? (
              <TagEntryCreatePopover
                open
                onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? parentTag.id : null)}
                tag={{
                  id: parentTag.id,
                  name: parentTag.name,
                  color: parentTag.color,
                  icon: parentTag.icon,
                }}
                defaultDurationMinutes={30}
                isMobile={isMobile ?? false}
              />
            ) : null}
          </div>
        )}

        {/* グループ内へのインライン作成フォーム */}
        {isFirstInGroup && isCreatingInGroup && (
          <div className="pr-2 pl-4">
            <InlineTagCreateRow
              variant="row"
              defaultGroup={currentGroup}
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

        {/* タグ行: collapsed かつ先頭の場合も非表示 */}
        {!(isFirstInGroup && collapsed) && (
          <div
            className={cn(
              'group/item relative flex cursor-pointer items-center rounded-lg text-sm',
              isMobile ? 'h-11' : 'h-8',
              'hover:bg-state-hover',
              menuOpen && 'bg-state-selected',
              isChildRowPopoverOpen && 'bg-state-selected',
              isGrouped && 'pl-4',
              !checked && 'opacity-50',
            )}
            onClick={() => onRequestOpenPopover(tag.id)}
          >
            {/* タグアイコン */}
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

            {/* 👁 フィルタートグル */}
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

            {/* Menu */}
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
                isMobile={isMobile ?? false}
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

            {/* エントリ作成ポップアップ（sidebar タグ行クリックで開く）。
                (c) はモックデータ（空分布）で開閉のみ検証。
                実データ接続は (e)、配置時刻計算は (f)、onSubmit は (g) で実装。 */}
            {isChildRowPopoverOpen ? (
              <TagEntryCreatePopover
                open
                onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? tag.id : null)}
                tag={{ id: tag.id, name: tag.name, color: tag.color, icon: tag.icon }}
                defaultDurationMinutes={30}
                isMobile={isMobile ?? false}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* グループ削除ストラテジーダイアログ */}
      {isFirstInGroup && (
        <TagDeleteStrategyDialog
          open={showDeleteGroupDialog}
          onClose={() => setShowDeleteGroupDialog(false)}
          onConfirm={handleConfirmDeleteGroup}
          tagName={currentGroup}
          entryCount={groupCount}
          availableTags={availableTagsForGroupReassign}
        />
      )}

      {/* グループ解除・衝突確認ダイアログ */}
      {isFirstInGroup && (
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
      )}

      {/* グループ変更時の衝突確認ダイアログ */}
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
