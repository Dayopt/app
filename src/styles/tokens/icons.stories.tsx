import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Home,
  Info,
  Loader2,
  Mail,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Trash2,
  User,
  X,
} from 'lucide-react';

const meta = {
  title: 'Foundations/Icons',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Sizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">アイコンサイズ</h1>
        <p className="text-muted-foreground">
          lucide-react を使用。3階層 × 6種に統一。迷ったら size-3.5 か size-4。
        </p>
      </div>

      {/* 標準（迷ったらこれ） */}
      <div>
        <h2 className="text-muted-foreground mb-4 text-sm tracking-wide uppercase">
          標準（迷ったらこれ）
        </h2>
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-3.5" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-3.5</code>
            <p className="mt-2 text-xs font-bold">14px</p>
            <p className="text-muted-foreground mt-1 text-xs">
              補助アイコン、
              <br />
              text-sm の横
            </p>
          </div>

          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-4" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-4</code>
            <p className="mt-2 text-xs font-bold">16px</p>
            <p className="text-muted-foreground mt-1 text-xs">
              <strong>標準</strong>: ボタン内、
              <br />
              text-base の横
            </p>
          </div>
        </div>
      </div>

      {/* 必要なときだけ */}
      <div>
        <h2 className="text-muted-foreground mb-4 text-sm tracking-wide uppercase">
          必要なときだけ
        </h2>
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-5" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-5</code>
            <p className="mt-2 text-xs font-bold">20px</p>
            <p className="text-muted-foreground mt-1 text-xs">ナビ、強調</p>
          </div>

          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-6" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-6</code>
            <p className="mt-2 text-xs font-bold">24px</p>
            <p className="text-muted-foreground mt-1 text-xs">見出し横</p>
          </div>
        </div>
      </div>

      {/* 特殊用途 */}
      <div>
        <h2 className="text-muted-foreground mb-4 text-sm tracking-wide uppercase">特殊用途</h2>
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-8" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-8</code>
            <p className="mt-2 text-xs font-bold">32px</p>
            <p className="text-muted-foreground mt-1 text-xs">
              カード主アイコン、
              <br />
              エラー
            </p>
          </div>

          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-10" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-10</code>
            <p className="mt-2 text-xs font-bold">40px</p>
            <p className="text-muted-foreground mt-1 text-xs">
              空状態、
              <br />
              オンボーディング
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const StrokeWidth: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">線の太さ（strokeWidth）</h1>
      <p className="text-muted-foreground mb-8">
        lucide-react のデフォルトは2。用途に応じて3種類を使い分け。
      </p>

      <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
        <div className="text-center">
          <div className="flex h-16 items-center justify-center">
            <Settings className="size-8" strokeWidth={2} />
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">strokeWidth=2</code>
          <p className="mt-2 text-xs font-bold">
            <strong>標準（デフォルト）</strong>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            指定不要、
            <br />
            ほとんどの場面で使用
          </p>
        </div>

        <div className="text-center">
          <div className="flex h-16 items-center justify-center">
            <Home className="size-8" strokeWidth={2.5} />
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">strokeWidth=2.5</code>
          <p className="mt-2 text-xs font-bold">強調</p>
          <p className="text-muted-foreground mt-1 text-xs">
            ナビゲーションタブ、
            <br />
            アクティブ状態
          </p>
        </div>

        <div className="text-center">
          <div className="flex h-16 items-center justify-center">
            <Check className="size-8" strokeWidth={3} />
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">strokeWidth=3</code>
          <p className="mt-2 text-xs font-bold">高視認性</p>
          <p className="text-muted-foreground mt-1 text-xs">
            チェックマーク、
            <br />
            小さいサイズでの使用
          </p>
        </div>
      </div>
    </div>
  ),
};

export const CommonIcons: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">よく使うアイコン</h1>
      <p className="text-muted-foreground mb-8">
        代表的なアイコンの一覧。全アイコンは{' '}
        <a
          href="https://lucide.dev/icons"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          lucide.dev
        </a>{' '}
        を参照。
      </p>

      <div className="grid grid-cols-4 gap-6 md:grid-cols-6 lg:grid-cols-8">
        {[
          { icon: Home, name: 'Home' },
          { icon: Search, name: 'Search' },
          { icon: Settings, name: 'Settings' },
          { icon: User, name: 'User' },
          { icon: Menu, name: 'Menu' },
          { icon: X, name: 'X' },
          { icon: Plus, name: 'Plus' },
          { icon: Edit, name: 'Edit' },
          { icon: Trash2, name: 'Trash2' },
          { icon: Check, name: 'Check' },
          { icon: ChevronDown, name: 'ChevronDown' },
          { icon: ChevronRight, name: 'ChevronRight' },
          { icon: ArrowLeft, name: 'ArrowLeft' },
          { icon: ArrowRight, name: 'ArrowRight' },
          { icon: MoreHorizontal, name: 'MoreHorizontal' },
          { icon: MoreVertical, name: 'MoreVertical' },
          { icon: Calendar, name: 'Calendar' },
          { icon: Clock, name: 'Clock' },
          { icon: Mail, name: 'Mail' },
          { icon: Filter, name: 'Filter' },
          { icon: Eye, name: 'Eye' },
          { icon: EyeOff, name: 'EyeOff' },
          { icon: ExternalLink, name: 'ExternalLink' },
          { icon: Loader2, name: 'Loader2' },
        ].map(({ icon: Icon, name }) => (
          <div key={name} className="text-center">
            <Icon className="mx-auto mb-2 size-5" />
            <p className="text-muted-foreground text-xs">{name}</p>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const SemanticIcons: Story = {
  render: () => (
    <div>
      <h1 className="mb-8 text-2xl font-bold">意味を持つアイコン</h1>

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-muted text-success rounded-full p-2">
            <Check className="size-5" />
          </div>
          <div>
            <p className="font-bold">成功・完了</p>
            <code className="text-muted-foreground text-xs">Check + text-success + bg-muted</code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted text-warning rounded-full p-2">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <p className="font-bold">警告・注意</p>
            <code className="text-muted-foreground text-xs">
              AlertCircle + text-warning + bg-muted
            </code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted text-destructive rounded-full p-2">
            <X className="size-5" />
          </div>
          <div>
            <p className="font-bold">エラー・削除</p>
            <code className="text-muted-foreground text-xs">X + text-destructive + bg-muted</code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted text-info rounded-full p-2">
            <Info className="size-5" />
          </div>
          <div>
            <p className="font-bold">情報</p>
            <code className="text-muted-foreground text-xs">Info + text-info + bg-muted</code>
          </div>
        </div>
      </div>
    </div>
  ),
};
