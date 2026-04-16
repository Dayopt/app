import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Architecture/Props Inventory',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// データ定義
// ---------------------------------------------------------------------------

interface ComponentEntry {
  name: string;
  variant: string | null;
  size: string | null;
  disabled: boolean;
  loading: boolean;
  className: boolean;
  note?: string;
}

const components: ComponentEntry[] = [
  {
    name: 'ActionFooter',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'AlertDialog',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'Avatar',
    variant: null,
    size: 'xs / sm / default / lg / xl / 2xl / 3xl',
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'AvatarUpload',
    variant: null,
    size: '2xl / 3xl',
    disabled: true,
    loading: true,
    className: true,
    note: 'isUploading → loading',
  },
  {
    name: 'Badge',
    variant: 'primary / secondary / outline / success / warning / info / destructive',
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'Button',
    variant: 'primary / outline / ghost / destructive',
    size: 'sm / default / lg',
    disabled: true,
    loading: true,
    className: true,
    note: 'isLoading → loading',
  },
  { name: 'Card', variant: null, size: null, disabled: false, loading: false, className: true },
  { name: 'Checkbox', variant: null, size: null, disabled: true, loading: false, className: true },
  {
    name: 'Collapsible',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'ColorPalettePicker',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: false,
  },
  {
    name: 'ConfirmDialog',
    variant: 'destructive / warning / default',
    size: null,
    disabled: false,
    loading: false,
    className: false,
  },
  { name: 'Dialog', variant: null, size: null, disabled: false, loading: false, className: true },
  { name: 'Drawer', variant: null, size: null, disabled: false, loading: false, className: true },
  {
    name: 'DropdownMenu',
    variant: 'default / destructive',
    size: null,
    disabled: true,
    loading: false,
    className: true,
  },
  { name: 'Field', variant: null, size: null, disabled: false, loading: false, className: true },
  {
    name: 'Input',
    variant: null,
    size: 'sm / default / lg',
    disabled: true,
    loading: false,
    className: true,
  },
  { name: 'InputOTP', variant: null, size: null, disabled: true, loading: false, className: true },
  { name: 'Label', variant: null, size: null, disabled: false, loading: false, className: true },
  {
    name: 'MiniCalendar',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  { name: 'Popover', variant: null, size: null, disabled: false, loading: false, className: true },
  {
    name: 'RadioGroup',
    variant: null,
    size: null,
    disabled: true,
    loading: false,
    className: true,
  },
  {
    name: 'ScrollArea',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  {
    name: 'Select',
    variant: 'default / ghost',
    size: 'sm / default',
    disabled: true,
    loading: false,
    className: true,
  },
  {
    name: 'Separator',
    variant: null,
    size: null,
    disabled: false,
    loading: false,
    className: true,
  },
  { name: 'Sheet', variant: null, size: null, disabled: false, loading: false, className: true },
  {
    name: 'Skeleton',
    variant: 'pulse / shimmer',
    size: null,
    disabled: false,
    loading: false,
    className: true,
    note: 'animation → variant',
  },
  {
    name: 'Spinner',
    variant: null,
    size: 'sm / default / lg / xl',
    disabled: false,
    loading: false,
    className: true,
    note: 'md → default',
  },
  { name: 'Switch', variant: null, size: null, disabled: true, loading: false, className: true },
  { name: 'Tabs', variant: null, size: null, disabled: false, loading: false, className: true },
  { name: 'Textarea', variant: null, size: null, disabled: true, loading: false, className: true },
  { name: 'Toast', variant: null, size: null, disabled: false, loading: false, className: false },
  { name: 'Tooltip', variant: null, size: null, disabled: true, loading: false, className: true },
];

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function Check() {
  return <span className="text-primary">&#10003;</span>;
}

function Dash() {
  return <span className="text-muted-foreground">&mdash;</span>;
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const Overview: Story = {
  render: function PropsInventoryPage() {
    return (
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        {/* タイトル */}
        <div>
          <h1 className="text-2xl font-medium">Props Inventory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            UIコンポーネント（src/components/ui/）のprops一覧。設計ルールとの整合性を確認する。
          </p>
        </div>

        {/* 統一ルール */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">統一ルール</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-2 text-left font-medium">Prop</th>
                <th className="py-2 text-left font-medium">用途</th>
                <th className="py-2 text-left font-medium">許可値の例</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="text-foreground py-2 font-mono text-xs">variant</td>
                <td className="py-2">見た目のバリエーション</td>
                <td className="py-2 font-mono text-xs">primary / outline / ghost / destructive</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-foreground py-2 font-mono text-xs">size</td>
                <td className="py-2">サイズ</td>
                <td className="py-2 font-mono text-xs">sm / default / lg</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-foreground py-2 font-mono text-xs">disabled</td>
                <td className="py-2">無効化</td>
                <td className="py-2 font-mono text-xs">boolean</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-foreground py-2 font-mono text-xs">loading</td>
                <td className="py-2">ローディング</td>
                <td className="py-2 font-mono text-xs">boolean</td>
              </tr>
              <tr className="border-border border-b">
                <td className="text-foreground py-2 font-mono text-xs">color</td>
                <td className="py-2">色（tag color等）</td>
                <td className="py-2 font-mono text-xs">TagColorName</td>
              </tr>
              <tr>
                <td className="text-foreground py-2 font-mono text-xs">className</td>
                <td className="py-2">クラス追加</td>
                <td className="py-2 font-mono text-xs">string</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* コンポーネント一覧 */}
        <section>
          <h2 className="mb-4 text-lg font-medium">
            全コンポーネント一覧（{components.length}件）
          </h2>
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-container border-border border-b">
                  <th className="px-4 py-2 text-left font-medium">コンポーネント</th>
                  <th className="px-4 py-2 text-left font-medium">variant</th>
                  <th className="px-4 py-2 text-left font-medium">size</th>
                  <th className="px-4 py-2 text-center font-medium">disabled</th>
                  <th className="px-4 py-2 text-center font-medium">loading</th>
                  <th className="px-4 py-2 text-center font-medium">className</th>
                  <th className="px-4 py-2 text-left font-medium">備考</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr
                    key={c.name}
                    className={`border-border border-b last:border-b-0 ${c.note ? 'bg-warning/5' : ''}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs font-medium">{c.name}</td>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {c.variant ?? <Dash />}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {c.size ?? <Dash />}
                    </td>
                    <td className="px-4 py-2 text-center">{c.disabled ? <Check /> : <Dash />}</td>
                    <td className="px-4 py-2 text-center">{c.loading ? <Check /> : <Dash />}</td>
                    <td className="px-4 py-2 text-center">{c.className ? <Check /> : <Dash />}</td>
                    <td className="px-4 py-2 text-xs">
                      {c.note && (
                        <span className="bg-warning/10 text-warning rounded-lg px-2 py-0.5 font-mono">
                          {c.note}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ステータス */}
        <section className="bg-primary/5 border-primary/20 rounded-lg border p-4">
          <p className="text-primary text-sm font-medium">
            &#10003; すべてのpropsが統一ルールに準拠しています
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            備考欄はリネーム履歴です。現在のAPIは統一済みです。
          </p>
        </section>
      </div>
    );
  },
};
