import { useMemo, useRef, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, ChevronDown, ChevronLeft, Plus } from 'lucide-react';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { TAG_COLOR_NAMES, getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import type { TagColorName } from '@/lib/tag-colors';

import { parseColonTag } from '../lib/tag-colon';

// ─────────────────────────────────────────────────────────
// Mock Types & Data
// ─────────────────────────────────────────────────────────

interface MockTag {
  id: string;
  name: string;
  color: TagColorName;
}

const MOCK_TAGS: MockTag[] = [
  { id: '1', name: '仕事', color: 'blue' },
  { id: '2', name: '仕事:会議', color: 'blue' },
  { id: '3', name: '仕事:開発', color: 'indigo' },
  { id: '4', name: '仕事:資料作成', color: 'blue' },
  { id: '5', name: '勉強', color: 'green' },
  { id: '6', name: '運動', color: 'teal' },
  { id: '7', name: '休憩', color: 'amber' },
  { id: '8', name: '食事', color: 'orange' },
  { id: '9', name: 'Life', color: 'pink' },
  { id: '10', name: 'Hobby', color: 'gray' },
];

const FEW_TAGS: MockTag[] = [
  { id: '1', name: '仕事', color: 'blue' },
  { id: '2', name: '運動', color: 'teal' },
];

const MANY_TAGS: MockTag[] = [
  { id: '1', name: '仕事', color: 'blue' },
  { id: '2', name: '勉強', color: 'green' },
  { id: '3', name: '運動', color: 'teal' },
  { id: '4', name: '休憩', color: 'amber' },
  { id: '5', name: '食事', color: 'orange' },
  { id: '6', name: 'Life', color: 'pink' },
  { id: '7', name: 'Hobby', color: 'gray' },
  { id: '8', name: 'Reading', color: 'indigo' },
  { id: '9', name: 'Side Project', color: 'violet' },
  { id: '10', name: 'MTG', color: 'red' },
  { id: '11', name: 'Design', color: 'blue' },
  { id: '12', name: 'Planning', color: 'green' },
  { id: '13', name: 'Admin', color: 'gray' },
  { id: '14', name: 'Travel', color: 'teal' },
];

// ─────────────────────────────────────────────────────────
// Grid Tag Cell
// ─────────────────────────────────────────────────────────

interface TagGridCellProps {
  tag: MockTag;
  isSelected?: boolean | undefined;
  hasChildren?: boolean | undefined;
  onSelect: () => void;
}

function TagGridCell({ tag, isSelected = false, hasChildren = false, onSelect }: TagGridCellProps) {
  const colorClasses = getTagColorClasses(tag.color);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl p-3 transition-colors',
        'active:scale-95 active:transition-transform',
        isSelected ? 'ring-primary ring-2' : 'hover:brightness-95',
      )}
      style={{ backgroundColor: colorClasses.cssVarTint }}
    >
      <div className="relative">
        <span
          className="block size-8 rounded-full"
          style={{ backgroundColor: colorClasses.cssVar }}
        />
        {isSelected && <Check className="absolute inset-0 m-auto size-4 text-white" />}
      </div>
      <span className="text-foreground flex w-full items-center justify-center gap-0.5 text-sm font-medium">
        <span className="truncate">{tag.name}</span>
        {hasChildren && <span className="text-muted-foreground shrink-0 text-xs">›</span>}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Create New Cell (+) — グリッド末尾のボタン
// ─────────────────────────────────────────────────────────

function CreateCell({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bg-muted hover:bg-muted/80 flex flex-col items-center justify-center gap-2 rounded-xl p-3 transition-colors',
        'active:scale-95 active:transition-transform',
      )}
    >
      <span className="bg-muted-foreground/20 flex size-8 items-center justify-center rounded-full">
        <Plus className="text-muted-foreground size-5" />
      </span>
      <span className="text-muted-foreground text-sm font-medium">新規</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Create Tag Form — 同じシート内のフォーム画面
// ─────────────────────────────────────────────────────────

interface CreateTagFormProps {
  parentTags: MockTag[];
  onBack: () => void;
  onCreateAndSelect: (name: string, color?: string | null, group?: string | null) => void;
}

function CreateTagForm({ parentTags, onBack, onCreateAndSelect }: CreateTagFormProps) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<TagColorName>('blue');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const fullName = selectedGroup ? `${selectedGroup}:${name.trim()}` : name.trim();
    onCreateAndSelect(fullName, selectedColor);
  };

  return (
    <div className="flex flex-col">
      {/* ← 戻るヘッダー */}
      <button
        type="button"
        onClick={onBack}
        className="hover:bg-state-hover flex min-h-11 items-center gap-2 px-4 py-2 transition-colors"
      >
        <ChevronLeft className="text-muted-foreground size-5" />
        <span className="text-foreground font-semibold">新しいタグ</span>
      </button>

      <div className="flex flex-col gap-5 px-4 py-3">
        {/* 名前 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tag-name" className="text-muted-foreground text-sm">
            名前
          </label>
          <Input
            id="tag-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="タグ名を入力"
            className="min-h-11"
            autoFocus
          />
        </div>

        {/* 色 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-sm">色</span>
          <div className="flex flex-wrap gap-2">
            {TAG_COLOR_NAMES.map((color) => {
              const classes = getTagColorClasses(color);
              const isActive = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full transition-all',
                    isActive ? 'ring-primary ring-2 ring-offset-2' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: classes.cssVar }}
                  aria-label={color}
                  aria-pressed={isActive}
                >
                  {isActive && <Check className="size-4 text-white" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* グループ（任意） */}
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-sm">グループ（任意）</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setGroupOpen(!groupOpen)}
              className={cn(
                'border-border hover:bg-state-hover flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors',
                selectedGroup ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="flex items-center gap-2">
                {selectedGroup && (
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: getTagColorClasses(
                        parentTags.find((t) => t.name === selectedGroup)?.color ?? 'gray',
                      ).cssVar,
                    }}
                  />
                )}
                {selectedGroup ?? 'なし'}
              </span>
              <ChevronDown
                className={cn(
                  'text-muted-foreground size-4 transition-transform',
                  groupOpen && 'rotate-180',
                )}
              />
            </button>

            {/* ドロップダウン */}
            {groupOpen && (
              <div className="border-border surface-raised bg-card absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroup(null);
                    setGroupOpen(false);
                  }}
                  className={cn(
                    'hover:bg-state-hover flex min-h-10 w-full items-center px-3 text-sm transition-colors',
                    !selectedGroup && 'text-primary font-medium',
                  )}
                >
                  なし
                </button>
                {parentTags.map((tag) => {
                  const classes = getTagColorClasses(tag.color);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroup(tag.name);
                        setGroupOpen(false);
                      }}
                      className={cn(
                        'hover:bg-state-hover flex min-h-10 w-full items-center gap-2 px-3 text-sm transition-colors',
                        selectedGroup === tag.name && 'text-primary font-medium',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: classes.cssVar }}
                      />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 作成ボタン */}
        <Button onClick={handleSubmit} disabled={!canSubmit} className="min-h-11 w-full">
          作成
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Grid Selector (main component)
// ─────────────────────────────────────────────────────────

type SelectorView = { type: 'grid' } | { type: 'drill'; prefix: string } | { type: 'create' };

interface TagGridSelectorProps {
  tags: MockTag[];
  selectedId?: string | null | undefined;
  onSelect: (tagId: string, tagName: string) => void;
  onCreateAndSelect: (name: string, color?: string | null) => void;
}

function TagGridSelector({ tags, selectedId, onSelect, onCreateAndSelect }: TagGridSelectorProps) {
  const [view, setView] = useState<SelectorView>({ type: 'grid' });

  // グルーピング: コロン記法で親子に分割
  const { parentTags, childrenByPrefix } = useMemo(() => {
    const childMap = new Map<string, MockTag[]>();
    const parents: MockTag[] = [];
    const flatTags: MockTag[] = [];

    for (const tag of tags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        const existing = childMap.get(prefix) ?? [];
        existing.push(tag);
        childMap.set(prefix, existing);
      } else {
        flatTags.push(tag);
      }
    }

    // 子を持つprefix → 対応するフラットタグを親に昇格
    for (const tag of flatTags) {
      if (childMap.has(tag.name)) {
        parents.push(tag);
      } else {
        parents.push(tag);
      }
    }

    return { parentTags: parents, childrenByPrefix: childMap };
  }, [tags]);

  // 作成フォーム画面
  if (view.type === 'create') {
    return (
      <CreateTagForm
        parentTags={parentTags}
        onBack={() => setView({ type: 'grid' })}
        onCreateAndSelect={(name, color) => {
          onCreateAndSelect(name, color);
          setView({ type: 'grid' });
        }}
      />
    );
  }

  // 子タグドリルダウン画面
  if (view.type === 'drill') {
    const children = childrenByPrefix.get(view.prefix) ?? [];
    const parentTag = parentTags.find((t) => t.name === view.prefix);
    const parentColor = parentTag?.color ?? 'blue';
    const colorClasses = getTagColorClasses(parentColor);

    return (
      <div className="flex flex-col">
        {/* ← 戻るヘッダー */}
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="hover:bg-state-hover flex min-h-11 items-center gap-2 px-4 py-2 transition-colors"
        >
          <ChevronLeft className="text-muted-foreground size-5" />
          <span className="size-3 rounded-full" style={{ backgroundColor: colorClasses.cssVar }} />
          <span className="text-foreground font-semibold">{view.prefix}</span>
        </button>

        {/* 親タグ自体 + 子タググリッド */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          {parentTag && (
            <TagGridCell
              tag={parentTag}
              isSelected={selectedId === parentTag.id}
              onSelect={() => onSelect(parentTag.id, parentTag.name)}
            />
          )}
          {children.map((child) => {
            const { suffix } = parseColonTag(child.name);
            return (
              <TagGridCell
                key={child.id}
                tag={{ ...child, name: suffix ?? child.name }}
                isSelected={selectedId === child.id}
                onSelect={() => onSelect(child.id, child.name)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // メイン画面: 親タググリッド
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      {parentTags.map((tag) => {
        const hasChildren = childrenByPrefix.has(tag.name);
        return (
          <TagGridCell
            key={tag.id}
            tag={tag}
            isSelected={selectedId === tag.id}
            hasChildren={hasChildren}
            onSelect={() => {
              if (hasChildren) {
                setView({ type: 'drill', prefix: tag.name });
              } else {
                onSelect(tag.id, tag.name);
              }
            }}
          />
        );
      })}
      <CreateCell onClick={() => setView({ type: 'create' })} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Frame wrapper (PC: card, Mobile: Drawer)
// ─────────────────────────────────────────────────────────

function SelectorFrame({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="bg-card surface-raised-heavy w-[360px] overflow-hidden rounded-2xl">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-bold">{title ?? 'タグを選択'}</h2>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * TagGridSelector — グリッド型タグ選択UI（モック）
 *
 * リスト型の代替案。色タイルのグリッドで「色で認識→即タップ」を実現。
 * 子タグはドリルダウンで2画面目に遷移。
 */
const meta = {
  title: 'Features/Tags/GridSelector',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 基本: 8タグ + 新規作成セル。子タグのある「仕事」はドリルダウンで遷移。 */
export const GridDefault: Story = {
  render: function GridDefaultStory() {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <SelectorFrame>
        <TagGridSelector
          tags={MOCK_TAGS}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            fn()(id);
          }}
          onCreateAndSelect={fn()}
        />
      </SelectorFrame>
    );
  },
};

/** 子タグドリルダウン: 仕事タグの子タグ（会議/開発/資料作成）を表示。 */
export const GridWithChildren: Story = {
  render: function GridWithChildrenStory() {
    const [selected, setSelected] = useState<string | null>(null);

    return (
      <SelectorFrame>
        <div className="flex flex-col">
          {/* 戻るヘッダー */}
          <div className="flex min-h-11 items-center gap-2 px-4 py-2">
            <ChevronLeft className="text-muted-foreground size-5" />
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: getTagColorClasses('blue').cssVar }}
            />
            <span className="text-foreground font-semibold">仕事</span>
          </div>

          {/* 親タグ自体 + 子タグ grid */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            <TagGridCell
              tag={{ id: '1', name: '仕事', color: 'blue' }}
              isSelected={selected === '1'}
              onSelect={() => setSelected('1')}
            />
            {[
              { id: '2', name: '会議', color: 'blue' as TagColorName },
              { id: '3', name: '開発', color: 'indigo' as TagColorName },
              { id: '4', name: '資料作成', color: 'blue' as TagColorName },
            ].map((child) => (
              <TagGridCell
                key={child.id}
                tag={child}
                isSelected={selected === child.id}
                onSelect={() => setSelected(child.id)}
              />
            ))}
          </div>
        </div>
      </SelectorFrame>
    );
  },
};

/** 少数タグ: 2タグのみ。グリッドが少数でも見栄えするか確認。 */
export const GridFewTags: Story = {
  render: function GridFewTagsStory() {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <SelectorFrame>
        <TagGridSelector
          tags={FEW_TAGS}
          selectedId={selected}
          onSelect={(id) => setSelected(id)}
          onCreateAndSelect={fn()}
        />
      </SelectorFrame>
    );
  },
};

/** 大量タグ: 14タグ。5行に達するのでスクロールが発生するか確認。 */
export const GridManyTags: Story = {
  render: function GridManyTagsStory() {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <SelectorFrame>
        <TagGridSelector
          tags={MANY_TAGS}
          selectedId={selected}
          onSelect={(id) => setSelected(id)}
          onCreateAndSelect={fn()}
        />
      </SelectorFrame>
    );
  },
};

/** 新規作成フォーム: 「+」セルタップ後の作成画面。名前・色・グループを選択。 */
export const GridCreateNew: Story = {
  render: () => (
    <SelectorFrame>
      <CreateTagForm
        parentTags={[
          { id: '1', name: '仕事', color: 'blue' },
          { id: '5', name: '勉強', color: 'green' },
          { id: '6', name: '運動', color: 'teal' },
        ]}
        onBack={fn()}
        onCreateAndSelect={fn()}
      />
    </SelectorFrame>
  ),
};

/** モバイルDrawer: Drawer内にグリッドを配置。 */
export const MobileDrawer: Story = {
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  render: function MobileDrawerStory() {
    const [open, setOpen] = useState(true);
    const [selected, setSelected] = useState<string | null>(null);

    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80vh]">
          <div className="flex items-center justify-center px-4 pt-4 pb-2">
            <DrawerTitle className="text-lg font-bold">タグを選択</DrawerTitle>
          </div>
          <TagGridSelector
            tags={MOCK_TAGS}
            selectedId={selected}
            onSelect={(id) => {
              setSelected(id);
              fn()(id);
            }}
            onCreateAndSelect={fn()}
          />
        </DrawerContent>
      </Drawer>
    );
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    return (
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium">Default (8)</p>
          <SelectorFrame>
            <TagGridSelector tags={MOCK_TAGS} onSelect={fn()} onCreateAndSelect={fn()} />
          </SelectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium">Few (2)</p>
          <SelectorFrame>
            <TagGridSelector tags={FEW_TAGS} onSelect={fn()} onCreateAndSelect={fn()} />
          </SelectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium">Many (14)</p>
          <SelectorFrame>
            <TagGridSelector tags={MANY_TAGS} onSelect={fn()} onCreateAndSelect={fn()} />
          </SelectorFrame>
        </div>
        <div>
          <p className="text-muted-foreground mb-3 text-center text-xs font-medium">Children</p>
          <SelectorFrame>
            <div className="flex flex-col">
              <div className="flex min-h-11 items-center gap-2 px-4 py-2">
                <ChevronLeft className="text-muted-foreground size-5" />
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: getTagColorClasses('blue').cssVar }}
                />
                <span className="text-foreground font-semibold">仕事</span>
              </div>
              <div className="grid grid-cols-3 gap-2 px-4 py-3">
                <TagGridCell tag={{ id: 'p-0', name: '仕事', color: 'blue' }} onSelect={fn()} />
                {(['会議', '開発', '資料作成'] as const).map((name, i) => (
                  <TagGridCell
                    key={name}
                    tag={{ id: `c-${i}`, name, color: 'blue' }}
                    onSelect={fn()}
                  />
                ))}
              </div>
            </div>
          </SelectorFrame>
        </div>
      </div>
    );
  },
};
