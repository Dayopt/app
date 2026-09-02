---
name: storybook
description: Storybook Story の新規作成・既存更新時、UI 実装で spacing / icon size / z-index / radius / motion / elevation 等の design token 選択に迷う時に発動。`*.stories.tsx` 追加時、UI component の props / variant / state 追加時、Figma 由来のデザイン変更反映時。セマンティックトークンを徹底し AllPatterns Story を必須とする。既存 Story の文言・コメントのみ修正する時や component の internal logic のみ変更時は発動しない。
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
- `packages/components/src/` 配下の UI component を新規追加する時
- UI 実装中に spacing / icon size / z-index / radius / motion / elevation のどの値を使うべきか判断する時（→ §Design Token 選択ガイド）

## When NOT to Use

- 既存 Story の文言・コメント・説明テキストのみを修正する時（regression リスクなし）
- Component の internal logic のみ変更し、表示 props / variant / state が変わらない時（Story 再生成不要）
- 参考 UI やデザイン素材をライブラリから探す時（`mcp-usage` skill の Eagle 節に従う。この skill は Story 作成規約と token 選択まで）

## 絶対ルール

1. **セマンティックトークンのみ**。直接カラー禁止。これだけでダークモード対応完了
2. **全Storyファイルに AllPatterns Story 必須**
3. **Storybook MCP の出力とこのスキルが矛盾したらこのスキルが正**
4. **Canvas にテキスト説明を入れない**（AllPatterns含む。Foundations/Patterns 除く）
5. **play 関数はユーザー操作で状態が変わるコンポーネントにのみ書く**

---

## Design Token 選択ガイド

禁止パターン（任意値・非トークン色・許可外サイズ等）は `pnpm lint:tokens` が機械強制する。ここでは「どの値を使うべきか」の選択表だけを持つ（機械が弾かない側の判断）。

### UI コンポーネントレイヤー

`@dayopt/components` が共有 UI コンポーネントの正本。責務は 4 層:

```text
Dayopt design system          semantic tokens / spacing / radius / motion / a11y
        ↓
@dayopt/components             Dayopt が所有する UI コンポーネント（正本）
        ↓
Radix primitives                Dialog / Popover / Select 等の振る舞い・a11y
        ↓
DOM / Browser
```

- app（product / web）からは `@dayopt/components` を第一選択にする。Button / Dialog / Popover / Select 等の一般 UI は直接 Radix を使わない
- shadcn/ui は上流の設計・生成元（新規 primitive 追加時の初期実装参照）として扱い、絶対的正本にはしない
- Radix は下層 primitive。`@dayopt/components` で表現できない挙動が必要な場合のみ直接利用
- 不要な wrapper は作らない。再利用価値がある場合のみ `@dayopt/components` に昇格
- 構造的強制: app の `package.json` に `@radix-ui/*` を追加しない（Radix 依存は `packages/components` にのみ置く）
- Radix を使わない判断も許可する（例: `packages/components` の `Tooltip` は自前 CSS-based 実装。理由をコメントに残せば許容）

### 色

semantic token 経由のみ（`bg-primary`, `text-foreground`, `border-border`, `bg-category-blue` 等、`packages/foundations/src/tailwind-theme.css` で定義済みのもの）。透過（`/10` 等）は `state-*` トークンのみ。

例外: メールテンプレート（`apps/product/src/emails/`、CSS変数不可のためhex許容、`styles.ts` に集約）、OG画像（Satori制約、`@dayopt/foundations/og-colors` の定数を参照）。

### Elevation / Shadow

| レベル  | Surface       | Shadow      | Border                      | 用途                             |
| ------- | ------------- | ----------- | --------------------------- | -------------------------------- |
| Sunken  | bg-container  | なし        | border-border               | sidebar, footer                  |
| Base    | bg-background | なし        | —                           | ページ地                         |
| Raised  | bg-card       | shadow-sm   | border border-border-subtle | stat card, セクション内カード    |
| Overlay | bg-card       | shadow-card | border border-border-subtle | dropdown, popover, dialog, modal |

判断基準: Raised はページと一緒にスクロールする要素、Overlay はページの上に重なる要素。入力系（input/textarea/select/radio）は `shadow-xs`。許可される shadow は `shadow-xs` / `shadow-sm` / `shadow-card` の3種のみ（theme リセット済みのため `shadow-md` 等は生成されない）。

### Spacing

8px グリッド準拠（4pxサブグリッド）。

| Tailwind | px   | 用途例                                      |
| -------- | ---- | ------------------------------------------- |
| 1        | 4px  | アイコン-テキスト間、最小間隔               |
| 2        | 8px  | コンパクト間隔                              |
| 3        | 12px | チップ・バッジ・密な行の内側（44px タッチ） |
| 4        | 16px | 標準間隔、カード内パディング                |
| 6        | 24px | セクション間                                |
| 8        | 32px | 大間隔                                      |
| 12       | 48px | ページ間隔                                  |
| 16       | 64px | ヒーロー間隔                                |
| 24       | 96px | 最大間隔                                    |

### Border Radius

4段階のみ: `rounded-none`(0), `rounded-lg`(8px), `rounded-2xl`(16px), `rounded-full`。`rounded-sm/md/xl`、bare `rounded` は theme リセット済みのため書いても何も起きない。

Elevation対応: Sunken/Raised/Overlay(dropdown,popover)は`rounded-lg`。Overlay(modal,dialog)のみ`rounded-2xl`（画面中央に出る大きな面だけ）。

### Typography

Tailwindデフォルトのみ（`text-xs`〜`text-lg`等）。任意値禁止。

### Icon Size

| Tailwind   | px   | 用途                                                  |
| ---------- | ---- | ----------------------------------------------------- |
| `size-3.5` | 14px | 標準（迷ったらこれ）: 補助（矢印、Eye等）text-sm の横 |
| `size-4`   | 16px | 標準: ボタン内、text-base の横                        |
| `size-5`   | 20px | 必要な時だけ: ナビ、強調                              |
| `size-6`   | 24px | 必要な時だけ: 見出し横                                |
| `size-8`   | 32px | 特殊: カード主アイコン、エラー                        |
| `size-10`  | 40px | 特殊: 空状態、オンボーディング                        |

### Motion / Transition

正本は `packages/foundations/src/tokens/Motion.mdx`（Storybook の Shared/Foundations/Motion）。

- デフォルト: `transition-colors duration-150 ease-standard`（迷ったらこれ）
- duration は `150` / `200` / `300` の 3 段のみ
- easing は `ease-standard`（その場で変わる）と `ease-settle`（入る・着地する）の 2 種のみ

### Z-Index

トークン経由のみ（`z-modal`, `z-tooltip` 等）。

| グループ         | 範囲      | 用途                                                                 |
| ---------------- | --------- | -------------------------------------------------------------------- |
| 通常コンテキスト | 40–450    | dropdown, popover, sheet, modal, confirm, toast, context-menu, tour  |
| Inspector        | 1000–1100 | calendar-drag, inspector-backdrop, inspector（現在未使用、将来予約） |
| Overlay          | 1200–1400 | Inspector 上の modal, popover, confirm                               |
| 最前面           | 9999      | tooltip                                                              |

### State Patterns（Error / Empty / Loading）

| シナリオ                 | コンポーネント  | サイズ                   |
| ------------------------ | --------------- | ------------------------ |
| tRPC クエリ失敗          | `ErrorState`    | 親コンテキストに合わせる |
| データなし（親コンテナ） | `EmptyState`    | 親コンテキストに合わせる |
| データなし（子の可視化） | `return null`   | —                        |
| コンポーネントクラッシュ | `ErrorBoundary` | —                        |
| ページエラー             | `error.tsx`     | フルページ               |
| Mutation 失敗            | Toast (sonner)  | —                        |
| 初期データ読み込み       | Skeleton        | コンテンツ形状に合わせる |
| ボタン/インライン操作    | Spinner         | sm / md                  |

ルール: UI を描画する全 `useQuery` は `isError` を `ErrorState` でハンドリング必須。コンテンツ領域は Skeleton 優先、生 `Loader2` 禁止（`Spinner`/`@dayopt/components` を使う）。

### Interaction Patterns

**確認フロー**: 不可逆な削除は `variant="destructive"`、大量更新・変更破棄は `warning`、通常確認は `default`、取り消し可能な操作（保存・作成）は確認不要。コンポーネントは `ConfirmDialog`（`@/components/ui/overlays/confirm-dialog`）。

**Toast**: `@/lib/toast` 経由のみ（`sonner` 直接 import 禁止）。成功/エラーは3秒（action付き5秒）、1行構成・description無し・close ボタン無し、同時表示は最大1つ。`info`/`warning` toastは提供せず、該当用途は Inline Banner を使う。

**フォームバリデーション**: react-hook-form + Zod。`mode: 'onBlur'`（初回）、`reValidateMode: 'onChange'`（以降）。エラー表示は `FieldError`（`text-sm text-destructive`、`＊` prefix自動付与）。

**ドラッグ操作**: カレンダーグリッド内のブロック操作のみ。リスト並び替えDnDは廃止済み（`@dnd-kit`撤去済み。新設する場合は必要性から議論する）。

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

**パス**: `packages/foundations/src/tokens/`
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
