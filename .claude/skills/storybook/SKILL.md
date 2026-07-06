---
name: storybook
description: Storybook Story の新規作成・既存更新時に発動。`*.stories.tsx` 追加時、UI component の props / variant / state 追加時、Figma 由来のデザイン変更反映時。セマンティックトークンを徹底し AllPatterns Story を必須とする。既存 Story の文言・コメントのみ修正する時や component の internal logic のみ変更時は発動しない。
effort: medium
maxTurns: 15
---

# Storybook Story作成スキル

## When to Use

以下の状況で発動:

- `*.stories.tsx` ファイルを新規作成する時
- 既存 component に props / variant / state を追加した後、Story 側に反映する時
- Figma デザイン変更を component に反映した後、AllPatterns Story を更新する時
- 新しい Foundation / Pattern（トークン、レイアウト規則）を定義して Storybook で可視化する時
- `apps/product/src/lib/components/` 配下の UI component を新規追加する時

## When NOT to Use

- 既存 Story の文言・コメント・説明テキストのみを修正する時（regression リスクなし）
- Component の internal logic のみ変更し、表示 props / variant / state が変わらない時（Story 再生成不要）
- Story 作成後の snapshot 撮影・Eagle への同期・Archive 整理（eagle-dayopt skill の領域。この skill は Story 作成規約まで）

## 絶対ルール

1. **セマンティックトークンのみ**。直接カラー禁止。これだけでダークモード対応完了
2. **全Storyファイルに AllPatterns Story 必須**
3. **Storybook MCP の出力とこのスキルが矛盾したらこのスキルが正**
4. **Canvas にテキスト説明を入れない**（AllPatterns含む。Foundations/Patterns 除く）
5. **play 関数はユーザー操作で状態が変わるコンポーネントにのみ書く**

---

## Step 1: パスからレイヤーとテンプレートを決定

### UI Component

top-level は所有境界で決める（ADR-023）。共有 UI は `packages/components`、product 固有は `apps/product`。

| 物理位置                              | title prefix                                              |
| ------------------------------------- | --------------------------------------------------------- |
| `packages/components/src/<category>/` | `Shared/Components/<Category>/`（責務9category, ADR-022） |
| `apps/product/src/components/**`      | `Product/Components/`（Shell / Display / Feedback 等）    |

**layout**: `centered`
**モック**: 不要（props only）

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MyComponent } from './my-component';

const meta = {
  // 共有 UI なら 'Shared/Components/Actions/MyComponent'
  title: 'Product/Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本的な使用例。 */
export const Default: Story = {
  args: {/* props */},
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

#### 状態を持つ場合の Interactive Wrapper

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

### Feature Component

**パス**: `apps/product/src/features/*/components/`
**title**: `Product/Features/{feature名}/`
**layout**: `padded`
**モック**: `parameters.trpcMocks` + `parameters.storeMocks` で宣言

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../../.storybook/mocks/presets';
import { StoryTRPCProvider } from '../../../.storybook/mocks/trpc';

import { MyFeatureComponent } from './my-feature-component';

const meta = {
  title: 'Product/Features/Settings/MyFeatureComponent',
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
      <div>
        <StoryTRPCProvider mocks={{ 'userSettings.get': PRESET_USER_SETTINGS.default }}>
          <MyFeatureComponent />
        </StoryTRPCProvider>
      </div>
      <div>
        <StoryTRPCProvider pending>
          <MyFeatureComponent />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
```

#### Feature Component のモック戦略

- **デフォルト**: `meta.parameters` に `trpcMocks` + `storeMocks` を宣言
- **Story固有データ**: 個別Storyの `parameters.trpcMocks` で上書き（default mocks とマージされる）
- **Loading/Error**: `parameters: { trpcPending: true }` / `parameters: { trpcError: {...} }`
- **AllPatterns内**: `<StoryTRPCProvider>` で直接ラップ。外側の providerDecorator の tRPC 層を上書きする（ネストした内側が勝つ）
- **詳細**: → `references/mocks.md`

---

### Foundation

**パス**: `apps/product/src/lib/styles/tokens/`
**title**: `Shared/Foundations/`
**layout**: `fullscreen`
**モック**: 不要
**テキスト見出し**: 許可（トークン可視化のため）

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Shared/Foundations/Colors',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

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

### Pattern

**パス**: `apps/storybook/.storybook/stories/patterns/`
**title**: 依存ベースで分ける（ADR-023）。`@dayopt/components` だけで再現できる pattern は
`Shared/Patterns/`、`@/`（product 内部: `@/components` / `@/lib` / `@/features`）に依存する
pattern は `Product/Patterns/`
**layout**: `fullscreen`
**モック**: 不要
**テキスト見出し**: 許可（パターンドキュメントのため）

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@dayopt/components';

const meta = {
  // shared 例。product 結合（@/ 依存）なら 'Product/Patterns/Feedback'
  title: 'Shared/Patterns/Actions',
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
    </div>
  ),
};
```

---

## 共通ルール

### CSF3 + satisfies Meta

```tsx
const meta = { ... } satisfies Meta<typeof MyComponent>;
export default meta;
type Story = StoryObj<typeof meta>;
```

### JSDoc

1行で簡潔に。末尾に句点。

```tsx
/** 基本的な削除確認ダイアログ。最小構成の例。 */
export const Default: Story = { ... };
```

### play 関数

ユーザー操作で状態が変わるコンポーネント（フォーム、トグル等）にのみ使用。

```tsx
import { expect, userEvent, within } from 'storybook/test';

export const ClickTest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByRole('button')).toHaveAttribute('data-clicked', 'true');
  },
};
```

---

## 運用ルール

| 変更                   | Story側の対応                 |
| ---------------------- | ----------------------------- |
| コンポーネント新規作成 | 同時にStoryも作成             |
| props追加              | argTypes追加、Story使用例追加 |
| variant追加            | AllPatternsに追加             |
| コンポーネント削除     | Storyも削除                   |

---

## チェックリスト

- [ ] `satisfies Meta<typeof Component>` + `StoryObj<typeof meta>`
- [ ] `AllPatterns` Story 含む
- [ ] JSDoc は1行・句点つき
- [ ] セマンティックトークンのみ（直接カラー・hex 禁止）
- [ ] アイコンボタンに `aria-label`
- [ ] Canvas にテキストなし（AllPatterns含む。Foundations/Patterns除く）
- [ ] layout がレイヤーのデフォルトと一致（UI=centered, Feature=padded, Foundation/Pattern=fullscreen）
