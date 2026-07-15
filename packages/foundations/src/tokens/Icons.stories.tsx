import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Award,
  Baby,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crown,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Flower2,
  FolderMinus,
  FolderOpen,
  Gamepad2,
  Gauge,
  Gem,
  Heart,
  HelpCircle,
  Home,
  ImagePlus,
  Info,
  Layers,
  Leaf,
  Lightbulb,
  Loader2,
  Mail,
  Medal,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Ratio,
  Search,
  SearchX,
  Settings,
  Sparkles,
  Star,
  Sun,
  SunMoon,
  Sunrise,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  User,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const meta = {
  title: 'Shared/Foundations/Icons',
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
        <h1 className="mb-2 text-2xl font-medium">アイコンサイズ</h1>
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
            <p className="mt-2 text-xs font-medium">14px</p>
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
            <p className="mt-2 text-xs font-medium">16px</p>
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
            <p className="mt-2 text-xs font-medium">20px</p>
            <p className="text-muted-foreground mt-1 text-xs">ナビ、強調</p>
          </div>

          <div className="text-center">
            <div className="flex h-16 items-center justify-center">
              <Settings className="size-6" />
            </div>
            <code className="bg-container rounded-lg px-2 py-1 text-xs">size-6</code>
            <p className="mt-2 text-xs font-medium">24px</p>
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
            <p className="mt-2 text-xs font-medium">32px</p>
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
            <p className="mt-2 text-xs font-medium">40px</p>
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
      <h1 className="mb-6 text-2xl font-medium">線の太さ（strokeWidth）</h1>
      <p className="text-muted-foreground mb-8">
        lucide-react のデフォルトは2。用途に応じて3種類を使い分け。
      </p>

      <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
        <div className="text-center">
          <div className="flex h-16 items-center justify-center">
            <Settings className="size-8" strokeWidth={2} />
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">strokeWidth=2</code>
          <p className="mt-2 text-xs font-medium">
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
          <p className="mt-2 text-xs font-medium">強調</p>
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
          <p className="mt-2 text-xs font-medium">高視認性</p>
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
      <h1 className="mb-6 text-2xl font-medium">よく使うアイコン</h1>
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
          { icon: Crown, name: 'Crown' },
          { icon: Sparkles, name: 'Sparkles' },
          { icon: Star, name: 'Star' },
          { icon: Medal, name: 'Medal' },
          { icon: SunMoon, name: 'SunMoon' },
          { icon: Flower2, name: 'Flower2' },
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
      <h1 className="mb-8 text-2xl font-medium">意味を持つアイコン</h1>

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-muted text-success rounded-full p-2">
            <Check className="size-5" />
          </div>
          <div>
            <p className="font-medium">成功・完了</p>
            <code className="text-muted-foreground text-xs">Check + text-success + bg-muted</code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted text-warning rounded-full p-2">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <p className="font-medium">警告・注意</p>
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
            <p className="font-medium">エラー・削除</p>
            <code className="text-muted-foreground text-xs">X + text-destructive + bg-muted</code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-muted text-info rounded-full p-2">
            <Info className="size-5" />
          </div>
          <div>
            <p className="font-medium">情報</p>
            <code className="text-muted-foreground text-xs">Info + text-info + bg-muted</code>
          </div>
        </div>
      </div>
    </div>
  ),
};

interface IconEntry {
  icon: LucideIcon;
  name: string;
  usage?: string;
}

interface IconGroup {
  title: string;
  note?: string;
  items: IconEntry[];
}

const CONVENTION_GROUPS: IconGroup[] = [
  {
    title: 'Pro / 課金',
    note: 'Crown 単独。Sparkles / Zap は使わない',
    items: [{ icon: Crown, name: 'Crown', usage: 'Pro tier / 課金プラン階層' }],
  },
  {
    title: 'AI / Insight',
    note: 'Sparkles は AI 専用予約 (Watching AI モードアイコン含む)',
    items: [
      { icon: Sparkles, name: 'Sparkles', usage: 'AI 機能全般 + Watching AI モード' },
      { icon: Lightbulb, name: 'Lightbulb', usage: 'ヒント / tips (非 AI)' },
    ],
  },
  {
    title: 'バッジ・達成記号',
    note: 'Crown は使わない (Pro tier と分離)',
    items: [
      { icon: Medal, name: 'Medal', usage: '単発達成 / 継続記念' },
      { icon: Award, name: 'Award', usage: '認定系' },
      { icon: Trophy, name: 'Trophy', usage: 'トーナメント / ランキング' },
      { icon: Gem, name: 'Gem', usage: '希少性を示す長期達成' },
    ],
  },
  {
    title: '警告 / エラー',
    items: [
      { icon: AlertCircle, name: 'AlertCircle', usage: 'error (不可逆・システム異常)' },
      { icon: AlertTriangle, name: 'AlertTriangle', usage: 'warning (修正可能)' },
      { icon: Info, name: 'Info', usage: '情報提示のみ' },
    ],
  },
  {
    title: 'ナビゲーション / ユーザー',
    items: [
      { icon: UserCircle, name: 'UserCircle', usage: 'ナビ / アバター / profile' },
      { icon: User, name: 'User', usage: '抽象的なユーザー概念' },
    ],
  },
  {
    title: 'カレンダー / 日付',
    items: [
      { icon: Calendar, name: 'Calendar', usage: '単日 / 日付フィールド' },
      { icon: CalendarDays, name: 'CalendarDays', usage: 'ナビ / 機能名 / 複数日' },
    ],
  },
  {
    title: 'アクション',
    items: [
      { icon: Plus, name: 'Plus', usage: '追加' },
      { icon: X, name: 'X', usage: '閉じる / キャンセル' },
      { icon: Trash2, name: 'Trash2', usage: '削除' },
      { icon: Check, name: 'Check', usage: 'チェック / 完了' },
    ],
  },
  {
    title: 'アップロード / 画像',
    note: 'Camera は使わない (Web は撮影でなくアップロード)',
    items: [
      { icon: Upload, name: 'Upload', usage: 'ファイル / データ' },
      { icon: ImagePlus, name: 'ImagePlus', usage: 'プロフィール画像' },
    ],
  },
  {
    title: 'フォルダ / グループ操作',
    note: 'FolderUp は使わない (アップロードと誤読)',
    items: [{ icon: FolderMinus, name: 'FolderMinus', usage: 'グループから外す' }],
  },
  {
    title: '404 / 見失い',
    note: 'FileQuestion は使わない',
    items: [
      { icon: Compass, name: 'Compass', usage: '道を見失った文脈' },
      { icon: SearchX, name: 'SearchX', usage: '検索結果なし' },
    ],
  },
  {
    title: 'ヘルプ / 疑問',
    note: 'MessageCircleQuestion は使わない',
    items: [{ icon: HelpCircle, name: 'HelpCircle', usage: 'ヘルプ / FAQ' }],
  },
];

const VALUES_CATEGORY: IconEntry[] = [
  { icon: Users, name: 'Users', usage: 'family' },
  { icon: Heart, name: 'Heart', usage: 'romance' },
  { icon: Baby, name: 'Baby', usage: 'parenting' },
  { icon: UserPlus, name: 'UserPlus', usage: 'friends' },
  { icon: Briefcase, name: 'Briefcase', usage: 'career' },
  { icon: TrendingUp, name: 'TrendingUp', usage: 'selfGrowth' },
  { icon: Gamepad2, name: 'Gamepad2', usage: 'leisure' },
  { icon: Flower2, name: 'Flower2', usage: 'spirituality' },
  { icon: Building2, name: 'Building2', usage: 'community' },
  { icon: Activity, name: 'Activity', usage: 'health' },
  { icon: Leaf, name: 'Leaf', usage: 'environment' },
  { icon: Wallet, name: 'Wallet', usage: 'finance' },
];

const METRIC_SET: IconEntry[] = [
  { icon: Clock, name: 'Clock', usage: 'totalTime' },
  { icon: Target, name: 'Target', usage: 'entryRate' },
  { icon: Flame, name: 'Flame', usage: 'streak' },
  { icon: Timer, name: 'Timer', usage: 'estimationAccuracy' },
  { icon: Gauge, name: 'Gauge', usage: 'deepUtilization' },
  { icon: ArrowLeftRight, name: 'ArrowLeftRight', usage: 'contextSwitches' },
  { icon: Ratio, name: 'Ratio', usage: 'blankRate' },
];

const BADGE_SET: IconEntry[] = [
  { icon: Flame, name: 'Flame', usage: 'streak' },
  { icon: Layers, name: 'Layers', usage: 'blocks' },
  { icon: Clock, name: 'Clock', usage: 'tag-hours' },
  { icon: Compass, name: 'Compass', usage: 'tags-5' },
  { icon: Sun, name: 'Sun', usage: 'deep-zone' },
  { icon: BarChart3, name: 'BarChart3', usage: 'full-day' },
  { icon: FolderOpen, name: 'FolderOpen', usage: 'group-first' },
  { icon: SunMoon, name: 'SunMoon', usage: 'day-night-cycle' },
  { icon: Sunrise, name: 'Sunrise', usage: 'early-bird' },
  { icon: Calendar, name: 'Calendar', usage: 'full-week / six-months' },
  { icon: Trophy, name: 'Trophy', usage: 'weekly-champion' },
  { icon: Heart, name: 'Heart', usage: 'pro-signup' },
  { icon: Medal, name: 'Medal', usage: 'one-year' },
];

function IconCell({ icon: Icon, name, usage }: IconEntry) {
  return (
    <div className="border-border-subtle flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
      <Icon className="size-6" />
      <code className="bg-container rounded-lg px-2 py-1 text-xs">{name}</code>
      {usage ? <p className="text-muted-foreground text-xs">{usage}</p> : null}
    </div>
  );
}

function IconGrid({ items }: { items: IconEntry[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <IconCell key={`${item.name}-${item.usage ?? ''}`} {...item} />
      ))}
    </div>
  );
}

/** Foundations/Icons/Docs (IconConventions.mdx) の意味論ルールに対応した一覧。新規 icon 追加時はここに反映する。 */
export const ByConvention: Story = {
  render: () => (
    <div className="space-y-10 p-6">
      <div>
        <h1 className="mb-2 text-2xl font-medium">意味論ルール別アイコン</h1>
        <p className="text-muted-foreground text-sm">
          <code className="bg-container mx-1 rounded-lg px-2 py-1 text-xs">
            Foundations/Icons/Docs
          </code>
          に対応した視覚参照。新規 icon 追加時はここにも追記する。
        </p>
      </div>

      {CONVENTION_GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="mb-1 text-lg font-medium">{group.title}</h2>
          {group.note ? (
            <p className="text-muted-foreground mb-4 text-xs">{group.note}</p>
          ) : (
            <div className="mb-4" />
          )}
          <IconGrid items={group.items} />
        </section>
      ))}

      <section>
        <h2 className="mb-1 text-lg font-medium">Values カテゴリ（例外）</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          individual な specific アイコンを優先。Crown / Sparkles は割り当てない
        </p>
        <IconGrid items={VALUES_CATEGORY} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Metric セット</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          同一セット内で重複禁止（1 アイコン = 1 指標）
        </p>
        <IconGrid items={METRIC_SET} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Badge セット</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          同一セット内で重複禁止。Crown は使わず Medal / Award / Trophy / Gem から選ぶ
        </p>
        <IconGrid items={BADGE_SET} />
      </section>
    </div>
  ),
};
