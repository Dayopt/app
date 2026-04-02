import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const meta = {
  title: 'Patterns/Selection',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Selection Patterns</h1>
      <p className="text-muted-foreground mb-8">
        選択UIのパターン。単一選択、複数選択、チップ選択の使い分け。
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
                  <th className="py-2 text-left font-bold">選択肢数</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">Radio</td>
                  <td className="py-2">排他的な単一選択</td>
                  <td className="py-2">2〜5個</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">Select</td>
                  <td className="py-2">多数の選択肢から単一選択</td>
                  <td className="py-2">6個以上</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">Checkbox</td>
                  <td className="py-2">複数選択可能な項目</td>
                  <td className="py-2">任意</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold">Chips</td>
                  <td className="py-2">タグ選択、フィルター</td>
                  <td className="py-2">〜10個</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 単一選択（Radio） */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">単一選択（Radio）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            排他的な選択。常に1つだけ選択される。
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">縦並び（推奨）</h3>
              <RadioGroup defaultValue="option-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-1" id="option-1" />
                  <Label htmlFor="option-1">日次レポート</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-2" id="option-2" />
                  <Label htmlFor="option-2">週次レポート</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-3" id="option-3" />
                  <Label htmlFor="option-3">月次レポート</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                横並び（2〜3個の場合）
              </h3>
              <RadioGroup defaultValue="light" className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light">ライト</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark">ダーク</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system">システム</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<RadioGroup defaultValue="option-1">
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option-1" id="option-1" />
    <Label htmlFor="option-1">オプション1</Label>
  </div>
</RadioGroup>`}
          </pre>
        </section>

        {/* 複数選択（Checkbox） */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">複数選択（Checkbox）</h2>
          <p className="text-muted-foreground mb-4 text-sm">複数選択可能。0個以上を選択できる。</p>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">基本</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="email" defaultChecked />
                  <Label htmlFor="email">メール通知</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="push" />
                  <Label htmlFor="push">プッシュ通知</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sms" />
                  <Label htmlFor="sms">SMS通知</Label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">説明付き</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-2">
                  <Checkbox id="weekly" className="mt-1" />
                  <div>
                    <Label htmlFor="weekly" className="">
                      週次サマリー
                    </Label>
                    <p className="text-muted-foreground text-sm">
                      毎週月曜日に1週間の活動をまとめて送信
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox id="reminder" className="mt-1" defaultChecked />
                  <div>
                    <Label htmlFor="reminder" className="">
                      リマインダー
                    </Label>
                    <p className="text-muted-foreground text-sm">予定の15分前に通知</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* チップ選択 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">チップ選択（Chips）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            タグやフィルターに最適。視覚的にコンパクト。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                フィルターチップ（単一選択）
              </h3>
              <SingleSelectChips />
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                フィルターチップ（複数選択）
              </h3>
              <MultiSelectChips />
            </div>

            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-bold">
                削除可能なチップ（タグ）
              </h3>
              <RemovableChips />
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// 選択状態のチップ
<Badge variant="default">選択中</Badge>

// 未選択のチップ
<Badge variant="outline">未選択</Badge>

// 削除可能なチップ
<Badge variant="secondary">
  タグ名
  <button onClick={onRemove}>
    <X className="size-3.5" />
  </button>
</Badge>`}
          </pre>
        </section>

        {/* リスト選択 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">リスト選択</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            リスト内のアイテムを選択。一括操作に使用。
          </p>

          <ListSelection />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// 選択状態のリストアイテム
<div className="bg-state-active border-primary border-l-2">
  <Checkbox checked />
  アイテム
</div>

// 未選択
<div className="hover:bg-state-hover">
  <Checkbox />
  アイテム
</div>`}
          </pre>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>選択肢が少ない（〜5個）→ Radio/Checkbox</li>
                <li>選択肢が多い（6個〜）→ Select</li>
                <li>視認性が必要 → Chips</li>
                <li>常にデフォルト値を設定（Radio）</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>Radioで「未選択」を許可しない</li>
                <li>10個以上のChipsを横並び</li>
                <li>Checkboxの単一必須選択</li>
                <li>選択状態が不明瞭なデザイン</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};

function SingleSelectChips() {
  const [selected, setSelected] = useState('all');
  const options = ['all', 'active', 'completed', 'archived'];
  const labels: Record<string, string> = {
    all: 'すべて',
    active: '進行中',
    completed: '完了',
    archived: 'アーカイブ',
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Badge
          key={option}
          variant={selected === option ? 'primary' : 'outline'}
          className="cursor-pointer"
          onClick={() => setSelected(option)}
        >
          {labels[option]}
        </Badge>
      ))}
    </div>
  );
}

function MultiSelectChips() {
  const [selected, setSelected] = useState<string[]>(['work']);
  const options = ['work', 'personal', 'urgent', 'meeting', 'task'];
  const labels: Record<string, string> = {
    work: '仕事',
    personal: '個人',
    urgent: '緊急',
    meeting: '会議',
    task: 'タスク',
  };

  const toggle = (option: string) => {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Badge
          key={option}
          variant={selected.includes(option) ? 'primary' : 'outline'}
          className="cursor-pointer"
          onClick={() => toggle(option)}
        >
          {selected.includes(option) && <Check className="mr-1 size-3.5" />}
          {labels[option]}
        </Badge>
      ))}
    </div>
  );
}

function RemovableChips() {
  const [tags, setTags] = useState(['React', 'TypeScript', 'Tailwind']);

  const remove = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const reset = () => {
    setTags(['React', 'TypeScript', 'Tailwind']);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="hover:bg-muted ml-1 rounded-full p-1"
          >
            <X className="size-3.5" />
          </button>
        </Badge>
      ))}
      {tags.length === 0 && (
        <Button variant="ghost" size="sm" onClick={reset}>
          リセット
        </Button>
      )}
    </div>
  );
}

function ListSelection() {
  const [selected, setSelected] = useState<string[]>(['item-1']);
  const items = [
    { id: 'item-1', title: 'プロジェクトA', description: '期限: 2024/12/31' },
    { id: 'item-2', title: 'プロジェクトB', description: '期限: 2024/11/15' },
    { id: 'item-3', title: 'プロジェクトC', description: '期限: 2024/10/20' },
  ];

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setSelected(items.map((i) => i.id));
  };

  const deselectAll = () => {
    setSelected([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id="select-all"
          checked={selected.length === items.length}
          onCheckedChange={(checked) => (checked ? selectAll() : deselectAll())}
        />
        <Label htmlFor="select-all" className="text-sm">
          すべて選択（{selected.length}/{items.length}）
        </Label>
      </div>
      <div className="border-border divide-border divide-y rounded-lg border">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex cursor-pointer items-center gap-2 p-4 transition-colors ${
              selected.includes(item.id)
                ? 'bg-state-active border-primary border-l-2'
                : 'hover:bg-state-hover border-l-2 border-transparent'
            }`}
            onClick={() => toggle(item.id)}
          >
            <Checkbox checked={selected.includes(item.id)} />
            <div>
              <p className="">{item.title}</p>
              <p className="text-muted-foreground text-sm">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
