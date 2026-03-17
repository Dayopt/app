# ダークモード 3層アーキテクチャ

ツールバーの Theme 切り替えで確認可能。**Story側でのダークモード対応は不要**（セマンティックトークンを使っていれば自動対応）。

## 3層構造

| 層          | 対象                   | 仕組み                                                            | ファイル                             |
| ----------- | ---------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| **Manager** | サイドバー・ツールバー | `darkMode` パラメータの `dark`/`light` テーマ                     | `.storybook/preview.tsx`             |
| **Canvas**  | Story描画エリア        | `stylePreview: true, classTarget: 'html'` で `.dark` クラストグル | `.storybook/preview.tsx`             |
| **Docs**    | Docsページ全体         | `ThemedDocsContainer` で動的テーマ切替                            | `.storybook/ThemedDocsContainer.tsx` |

## ThemedDocsContainer（最重要）

Storybook の DocsContainer は emotion CSS-in-JS でスタイルを生成する。テーマオブジェクトの hex 値がインラインスタイルとして埋め込まれるため、**静的な `docs.theme` では常に同じテーマが適用されダークモードに追従しない**。

`ThemedDocsContainer` は `useDarkMode()` フックでダークモード状態を検出し、DocsContainer に渡すテーマを動的に切り替える。

```tsx
// .storybook/ThemedDocsContainer.tsx
import { DocsContainer } from '@storybook/addon-docs/blocks';
import { useDarkMode } from '@vueless/storybook-dark-mode';
import { dayoptDarkTheme, dayoptLightTheme } from './dayoptTheme';

export function ThemedDocsContainer({ children, ...props }) {
  const isDark = useDarkMode();
  return (
    <DocsContainer {...props} theme={isDark ? dayoptDarkTheme : dayoptLightTheme}>
      {children}
    </DocsContainer>
  );
}
```

## preview.tsx の設定

```tsx
// .storybook/preview.tsx（抜粋）
import { ThemedDocsContainer } from './ThemedDocsContainer';
import { dayoptDarkTheme, dayoptLightTheme } from './dayoptTheme';

parameters: {
  darkMode: {
    dark: dayoptDarkTheme,      // Manager + Canvas のダークテーマ
    light: dayoptLightTheme,    // Manager + Canvas のライトテーマ
    stylePreview: true,         // Canvas に .dark クラスを適用
    classTarget: 'html',        // <html> 要素にクラスを付与
  },
  docs: {
    container: ThemedDocsContainer,  // theme ではなく container を使う
    page: DocsTemplate,
  },
}
```

**禁止**: `docs.theme: dayoptLightTheme` — ダークモードに追従しなくなる

## CSS オーバーライド（storybook-overrides.css）

emotion CSS で生成される一部の要素は DocsContainer テーマだけではカバーできない。`.storybook/storybook-overrides.css` に `html.dark` プレフィックス付きの CSS オーバーライドを配置している。

```css
/* 高詳細度で emotion CSS を上書き */
html.dark .sbdocs {
  background: var(--background) !important;
}
html.dark .docblock-argstable input {
  color: var(--foreground) !important;
}
html.dark .docblock-code-toggle {
  color: var(--muted-foreground) !important;
}
```

**ルール**:

- セレクタは `html.dark` プレフィックスで emotion CSS より詳細度を高くする
- 値は CSS 変数 (`var(--token)`) を使い、hex 直書きしない
- `!important` は emotion CSS 上書きのために必要

## dayoptTheme.ts

Storybook の `create()` API は CSS 変数を受け付けないため、`tokens/colors.css` のデザイントークンから変換した hex 値を使用。トークン変更時はこのファイルも更新すること。

## Story作成者が守ること

1. **セマンティックトークンのみ使用** — `text-foreground`, `bg-card` 等。`text-red-500` 等の直接カラーは禁止
2. **特別な対応は不要** — セマンティックトークンを使っていれば `.dark` クラストグルで自動対応
3. **inline style の `var()` は動作する** — `style={{ backgroundColor: 'var(--token)' }}` は問題なし
