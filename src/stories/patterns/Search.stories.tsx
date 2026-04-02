import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagIcon } from '@/features/tags';

const meta = {
  title: 'Patterns/Search',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // クリアボタン付き検索の入力フィールドに入力
    const clearableInput = canvas.getByDisplayValue('検索テキスト');
    await userEvent.clear(clearableInput);
    await userEvent.type(clearableInput, 'タスク');
    await expect(clearableInput).toHaveValue('タスク');
  },
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Search Patterns</h1>
      <p className="text-muted-foreground mb-8">
        検索UIのパターン。基本検索、オートコンプリート、コマンドパレットの使い分け。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">使い分けガイド</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-bold">パターン</th>
                  <th className="py-2 text-left font-bold">用途</th>
                  <th className="py-2 text-left font-bold">トリガー</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">基本検索</td>
                  <td className="py-2">シンプルなテキスト検索</td>
                  <td className="py-2">常時表示</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">グローバル検索</td>
                  <td className="py-2">タグ一覧 + ブロック検索</td>
                  <td className="py-2">⌘K</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold">フィルター検索</td>
                  <td className="py-2">条件を絞り込んで検索</td>
                  <td className="py-2">常時表示</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 基本検索 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">基本検索</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            シンプルな検索入力。アイコン付きで視認性を確保。
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">アイコン付き</h3>
              <div className="relative max-w-md">
                <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input placeholder="検索..." className="pl-8" />
              </div>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">クリアボタン付き</h3>
              <SearchWithClear />
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">ショートカット表示</h3>
              <div className="relative max-w-md">
                <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input placeholder="検索..." className="pr-16 pl-8" />
                <kbd className="bg-muted text-muted-foreground absolute top-1/2 right-4 -translate-y-1/2 rounded-lg px-2 py-1 text-xs">
                  ⌘K
                </kbd>
              </div>
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<div className="relative">
  <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4" />
  <Input placeholder="検索..." className="pl-8" />
</div>`}
          </pre>
        </section>

        {/* グローバル検索 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">グローバル検索（⌘K）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            タグとブロックを横断検索。空状態ではタグ一覧、入力時はタグ名+メモで検索。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">空状態（タグ一覧）</h3>
              <GlobalSearchEmpty />
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                検索結果（タグ + ブロック）
              </h3>
              <GlobalSearchWithResults />
            </div>
          </div>

          <div className="bg-container mt-4 rounded-lg p-4">
            <h3 className="mb-2 text-sm font-bold">動作ルール</h3>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>空状態 → タグ一覧（TagIcon + タグ名）</li>
              <li>入力時 → タグ名マッチ + ブロックのメモ検索</li>
              <li>タグ選択 → showOnlyTag でフィルター適用</li>
              <li>ブロック選択 → カレンダーでその日に遷移 + Inspector表示</li>
            </ul>
          </div>
        </section>

        {/* フィルター検索 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">フィルター検索</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            条件を絞り込んで検索。チップでフィルターを表示。
          </p>

          <FilterSearch />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<div className="flex flex-wrap gap-2">
  {filters.map((filter) => (
    <Badge key={filter} variant="secondary">
      {filter}
      <button onClick={() => removeFilter(filter)}>
        <X className="size-3.5" />
      </button>
    </Badge>
  ))}
</div>`}
          </pre>
        </section>

        {/* 検索結果 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">検索結果</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            検索結果の表示パターン。ハイライト、件数、空状態。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                結果あり（ハイライト）
              </h3>
              <div className="border-border divide-border divide-y rounded-lg border">
                <div className="p-4">
                  <p className="">
                    <span className="bg-state-active text-state-active-foreground rounded-lg">
                      プロジェクト
                    </span>
                    A - 週次レビュー
                  </p>
                  <p className="text-muted-foreground text-sm">
                    今週の
                    <span className="bg-state-active text-state-active-foreground rounded-lg">
                      プロジェクト
                    </span>
                    進捗を確認
                  </p>
                </div>
                <div className="p-4">
                  <p className="">
                    <span className="bg-state-active text-state-active-foreground rounded-lg">
                      プロジェクト
                    </span>
                    B - キックオフ
                  </p>
                  <p className="text-muted-foreground text-sm">
                    新規
                    <span className="bg-state-active text-state-active-foreground rounded-lg">
                      プロジェクト
                    </span>
                    の立ち上げ
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">2件の結果</p>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">結果なし</h3>
              <div className="border-border rounded-lg border p-8 text-center">
                <Search className="text-muted-foreground mx-auto size-8" />
                <p className="mt-2">結果が見つかりません</p>
                <p className="text-muted-foreground text-sm">別のキーワードで検索してください</p>
              </div>
            </div>
          </div>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>検索アイコンを左に配置</li>
                <li>空状態でタグ一覧を即表示</li>
                <li>検索結果をハイライト</li>
                <li>ブロックにタグカラー + 日時を表示</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>コマンドパレット（操作がほぼない）</li>
                <li>検索履歴（タグ履歴と重複）</li>
                <li>ブロック一覧（カレンダーと重複）</li>
                <li>候補が多すぎる（20件以下推奨）</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};

function SearchWithClear() {
  const [query, setQuery] = useState('検索テキスト');

  return (
    <div className="relative max-w-md">
      <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
      <Input
        placeholder="検索..."
        className="pr-8 pl-8"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-4 -translate-y-1/2"
          onClick={() => setQuery('')}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function GlobalSearchEmpty() {
  const tags = [
    { name: 'Dev:API', icon: 'code', color: 'green' },
    { name: 'Dev:Frontend', icon: 'layout', color: 'green' },
    { name: 'Design', icon: 'palette', color: 'blue' },
    { name: 'Meeting', icon: 'users', color: 'violet' },
    { name: 'Learning', icon: null, color: 'orange' },
  ];

  return (
    <div className="border-border max-w-lg overflow-hidden rounded-lg border">
      <Command className="border-0">
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandGroup heading="Tags">
            {tags.map((tag) => (
              <CommandItem key={tag.name} className="flex items-center gap-2">
                <TagIcon icon={tag.icon} color={tag.color} size="sm" className="shrink-0" />
                <span>{tag.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function GlobalSearchWithResults() {
  const tags = [{ name: 'Dev:API', icon: 'code', color: 'green' }];

  const blocks = [
    {
      id: '1',
      tagName: 'Dev:API',
      tagIcon: 'code',
      tagColor: 'green',
      date: '3/6',
      time: '9:00 - 10:30',
      description: 'Refactored auth API endpoints',
    },
    {
      id: '2',
      tagName: 'Dev:API',
      tagIcon: 'code',
      tagColor: 'green',
      date: '3/5',
      time: '14:00 - 16:00',
      description: 'API design notes',
    },
  ];

  return (
    <div className="border-border max-w-lg overflow-hidden rounded-lg border">
      <Command className="border-0">
        <CommandInput placeholder="Search..." value="API" />
        <CommandList>
          <CommandEmpty>No results found</CommandEmpty>
          <CommandGroup heading="Tags">
            {tags.map((tag) => (
              <CommandItem key={tag.name} className="flex items-center gap-2">
                <TagIcon icon={tag.icon} color={tag.color} size="sm" className="shrink-0" />
                <span>
                  <mark className="bg-state-active text-state-active-foreground rounded-lg">
                    API
                  </mark>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Blocks">
            {blocks.map((block) => (
              <CommandItem key={block.id} value={block.id} className="flex items-center gap-2">
                <TagIcon
                  icon={block.tagIcon}
                  color={block.tagColor}
                  size="sm"
                  className="shrink-0"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <span className="">{block.tagName}</span>
                    <span>{block.date}</span>
                    <span>{block.time}</span>
                  </div>
                  <span className="truncate text-sm">{block.description}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function FilterSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(['進行中', '今週']);
  const availableFilters = ['進行中', '完了', '今週', '今月', '優先度高', '優先度低'];

  const removeFilter = (filter: string) => {
    setFilters((prev) => prev.filter((f) => f !== filter));
  };

  const addFilter = (filter: string) => {
    if (!filters.includes(filter)) {
      setFilters((prev) => [...prev, filter]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
          <Input
            placeholder="検索..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">フィルター</Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="space-y-1">
              {availableFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`hover:bg-state-hover w-full rounded-lg px-4 py-2 text-left text-sm ${
                    filters.includes(filter) ? 'bg-state-active' : ''
                  }`}
                  onClick={() =>
                    filters.includes(filter) ? removeFilter(filter) : addFilter(filter)
                  }
                >
                  {filter}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Badge key={filter} variant="secondary" className="gap-1 pr-1">
              {filter}
              <button
                type="button"
                onClick={() => removeFilter(filter)}
                className="hover:bg-muted ml-1 rounded-full p-1"
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm"
            onClick={() => setFilters([])}
          >
            すべてクリア
          </button>
        </div>
      )}
    </div>
  );
}
