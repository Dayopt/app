---
name: eagle-dayopt
description: Eagleデザインアセットパイプライン。Storybookスナップショット同期・検索・レビュー・Archive整理を支援。
effort: high
maxTurns: 20
---

# Eagle Dayopt Skill

Dayoptのデザインアセット管理パイプラインを操作するためのスキル。
Storybookスナップショットの撮影・同期、Eagle検索、レビュー、Archive整理を支援する。

## このスキルを使用するタイミング

以下のキーワードが含まれる場合に自動的に起動：

- 「eagle」「Eagle」
- 「スナップショット更新」「スナップショット同期」「スクショ」
- 「デザインアセット」「design asset」
- 「Archive整理」「アーカイブ整理」
- 「コンポーネントのデザイン」「デザイン見せて」
- 「未レビュー」「要レビュー」

## 前提条件

- **Eagle アプリが起動していること**（MCP: localhost:41596）
- **Storybook が起動していること**（撮影時のみ: localhost:6006）
- スクリプトは `npx tsx` で実行

## ユーザー発話 → 実行コマンド マッピング

| ユーザーの発話                                 | 実行するコマンド                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| 「スナップショット更新して」「スクショ撮って」 | `npx tsx scripts/eagle-capture.ts && npx tsx scripts/eagle-sync.ts`                   |
| 「Buttonだけ撮影して」                         | `npx tsx scripts/eagle-capture.ts --filter "Button" && npx tsx scripts/eagle-sync.ts` |
| 「darkだけ撮って」                             | `npx tsx scripts/eagle-capture.ts --theme dark && npx tsx scripts/eagle-sync.ts`      |
| 「dry-runで確認して」                          | `npx tsx scripts/eagle-sync.ts --dry-run`                                             |
| 「BottomSheetのデザイン見せて」                | `npx tsx scripts/eagle-lookup.ts --tags bottom-sheet,current`                         |
| 「未レビューのコンポーネント一覧」             | `npx tsx scripts/eagle-lookup.ts --review`                                            |
| 「bottom-sheetの参考UIと実装を並べて」         | `npx tsx scripts/eagle-lookup.ts --ref bottom-sheet`                                  |
| 「ブランドカラーから外れてる？」               | `npx tsx scripts/eagle-lookup.ts --color-check`                                       |
| 「最近追加されたデザイン」                     | `npx tsx scripts/eagle-lookup.ts --recent`                                            |
| 「Archive整理して」                            | `npx tsx scripts/eagle-cleanup.ts`                                                    |
| 「フォルダ構造セットアップして」               | `npx tsx scripts/eagle-sync.ts --setup`                                               |
| 「Eagleに繋がるか確認して」                    | `npx tsx scripts/eagle-api.ts`                                                        |

## コマンド詳細

### 撮影（eagle-capture）

Playwright で Storybook ストーリーをスクリーンショット撮影。

```bash
npx tsx scripts/eagle-capture.ts                      # 全ストーリー（light+dark）
npx tsx scripts/eagle-capture.ts --filter "Button"    # タイトルでフィルタ
npx tsx scripts/eagle-capture.ts --limit 10           # 先頭N件
npx tsx scripts/eagle-capture.ts --theme dark         # darkのみ
npx tsx scripts/eagle-capture.ts --theme both         # light+dark（デフォルト）
```

### 同期（eagle-sync）

screenshots/ 内の画像を Eagle に取込。ハッシュ比較で変更なしはスキップ。

```bash
npx tsx scripts/eagle-sync.ts                    # 同期
npx tsx scripts/eagle-sync.ts --dry-run          # プレビュー
npx tsx scripts/eagle-sync.ts --version v0.25    # バージョンタグ付き
```

### 撮影+同期ワンコマンド

```bash
npm run eagle:sync:capture
```

### 検索（eagle-lookup）

```bash
npx tsx scripts/eagle-lookup.ts button              # フリーテキスト
npx tsx scripts/eagle-lookup.ts --tags button,dark   # タグ検索
npx tsx scripts/eagle-lookup.ts --review             # ★3以下の要レビュー
npx tsx scripts/eagle-lookup.ts --recent             # 直近追加
npx tsx scripts/eagle-lookup.ts --ref bottom-sheet   # インスピ+実装対比
npx tsx scripts/eagle-lookup.ts --color-check        # カラー逸脱候補
```

### Archive 整理（eagle-cleanup）

```bash
npx tsx scripts/eagle-cleanup.ts              # 確認プロンプト付き
npx tsx scripts/eagle-cleanup.ts --dry-run    # プレビュー
npx tsx scripts/eagle-cleanup.ts --days 60    # 保持日数カスタム
npx tsx scripts/eagle-cleanup.ts --force      # 確認スキップ
```

## タグ体系（リファレンス）

### 自動付与タグ

- `component` — Storybook スナップショット
- `current` — 最新版（deprecated でないもの）
- `{component-name}` — コンポーネント名（kebab-case: `button`, `app-header` 等）
- パスセグメント — 階層の各フォルダ名が自動タグ化（`components`, `ui`, `features`, `calendar` 等）

### 状態

- `current` / `deprecated` / `draft`

### テーマ・ビューポート

- `light` / `dark`
- `mobile` / `desktop`

### Feature セクション（自動検出）

- `calendar` / `stats` / `settings` / `entry` / `auth` / `tags` / `tour` / `onboarding` / `chronotype` / `notifications` / `history` / `palette` / `search` / `contact`

### インスピレーション紐づけ

- `ref:{component-name}` — 例: `ref:bottom-sheet`

### タグ生成例

`Components/UI/Button` → `[component, current, button, components, ui, light, mobile]`
`Features/Calendar/Views/Grid` → `[component, current, grid, features, calendar, views, calendar, dark, mobile]`

## フォルダ構造（Storybook 階層に準拠）

Eagle のフォルダ構造は Storybook のサイドバー階層をそのまま反映する。
コンポーネントフォルダは撮影・同期時に動的作成される。

```
Components/
  UI/          ← Button, Dialog, Badge, Input, Select...
  Shell/       ← AppHeader, BottomTabBar, Sidebar/...
  Common/      ← ErrorBoundary, EmptyState, DateNavigator...
Features/
  Calendar/    ← Views/{Day,Week,Grid}, Header, Sidebar...
  Settings/    ← Account, Display, Billing, Data...
  Stats/       ← Badges, Insights, Progress, Review...
  Entry/       ← Card, Content, Inspector/...
  Auth/        ← Login, Signup, MFA...
  Tags/  Onboarding/  Tour/  etc.
Foundations/   ← Colors, Icons, Spacing, Typography...
Inspiration/
  Timeboxing/  Dashboard/  Mobile UX/
Marketing/
  Product Hunt/  LP/  Social/
Archive/
```

## ビューポート戦略

| カテゴリ                  | mobile | desktop | 理由                         |
| ------------------------- | ------ | ------- | ---------------------------- |
| Features/Calendar/Views/  | ✓      | ✓       | ページレイアウトが変わる     |
| Features/Settings/        | ✓      | ✓       | 設定画面各種                 |
| Features/Stats/           | ✓      | ✓       | 統計タブ                     |
| Features/Auth/            | ✓      | ✓       | 認証画面                     |
| Features/Onboarding/      | ✓      | ✓       | オンボーディング             |
| Components/Shell/Sidebar/ | ✓      | ✓       | デスクトップでレイアウト変化 |
| その他すべて              | ✓      | -       | レスポンシブ差分が小さい     |

## ★レーティング

| ★   | 意味           | 備考                   |
| --- | -------------- | ---------------------- |
| ★5  | 確定・保護対象 | 自動削除から除外       |
| ★4  | 承認済み       | レビュー完了           |
| ★3  | 要レビュー     | 自動生成時のデフォルト |
| ★2  | 要修正         | 問題あり               |
| ★1  | ボツ           | 削除候補               |

## 設計書

詳細は Storybook ドキュメントを参照:
`src/stories/docs/guides/EagleAssetManagement.mdx`
