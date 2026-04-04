# Story テンプレート集

全レイヤーのコピペ用テンプレート。

---

## UI Component（props-only）

`src/components/ui/`, `src/components/common/`, `src/shell/components/`

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MyComponent } from './my-component';

const meta = {
  title: 'Components/UI/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本的な使用例。 */
export const Default: Story = {
  args: {
    /* props */
  },
};

/** 無効状態。 */
export const Disabled: Story = {
  args: { disabled: true },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <MyComponent />
      <MyComponent disabled />
    </div>
  ),
};
```

### Interactive Wrapper（状態を持つ場合）

```tsx
/** デフォルト状態。 */
export const Default: Story = {
  render: function DefaultStory() {
    const [value, setValue] = useState(false);
    return <MyComponent checked={value} onCheckedChange={setValue} />;
  },
};
```

---

## Feature Component（tRPC / Store 依存）

`src/features/*/components/`

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../../.storybook/mocks/presets';

import { MyFeatureComponent } from './my-feature-component';

const meta = {
  title: 'Features/Settings/MyFeatureComponent',
  component: MyFeatureComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
  },
} satisfies Meta<typeof MyFeatureComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト状態。 */
export const Default: Story = {};

/** ローディング状態。 */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** エラー状態。 */
export const Error: Story = {
  parameters: {
    trpcError: { path: 'userSettings.get', code: 'INTERNAL_SERVER_ERROR' },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-12">
      <section>
        <h3 className="text-foreground mb-4 text-lg font-medium">Default</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': PRESET_USER_SETTINGS.default }}>
          <MyFeatureComponent />
        </StoryTRPCProvider>
      </section>
      <section>
        <h3 className="text-foreground mb-4 text-lg font-medium">Loading</h3>
        <StoryTRPCProvider pending>
          <MyFeatureComponent />
        </StoryTRPCProvider>
      </section>
    </div>
  ),
};
```

---

## Foundation（デザイントークン可視化）

`src/styles/tokens/`

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Colors',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj; // generic なし（component 未指定）

function ColorSwatch({
  tailwindClass,
  description,
}: {
  tailwindClass: string;
  description?: string;
}) {
  const token = tailwindClass.replace(/^(?:bg|text|border|ring)-/, '');
  return (
    <div className="flex items-center gap-4 py-2">
      <div
        className="border-border size-12 shrink-0 rounded-lg border"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <div>
        <code className="text-sm font-medium">{tailwindClass}</code>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </div>
    </div>
  );
}

/** Surface トークン。 */
export const Surfaces: Story = {
  render: () => (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-medium">Surface Colors</h2>
      <ColorSwatch tailwindClass="bg-background" description="ページ地" />
      <ColorSwatch tailwindClass="bg-card" description="カード・パネル" />
    </div>
  ),
};
```

---

## Pattern（実装パターンドキュメント）

`src/stories/patterns/`

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';

const meta = {
  title: 'Patterns/Feedback',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** 使い分けガイド。 */
export const Overview: Story = {
  render: () => (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-medium">Feedback Patterns</h1>
      <p className="text-muted-foreground mb-8">
        ユーザーへのフィードバック。Toast、Alert、InlineMessage の使い分け。
      </p>
      {/* パターン例 */}
    </div>
  ),
};

/** Toast の使用例。 */
export const ToastExamples: Story = {
  render: () => (
    <div className="space-y-4 p-8">
      <Button
        onClick={() => {
          /* toast example */
        }}
      >
        成功 Toast
      </Button>
    </div>
  ),
};
```
