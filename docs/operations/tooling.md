---
status: current
last_verified: 2026-07-03
---

# 運用ツール（Eagle / ライセンスコンプライアンス / Skill Triggers / 管理者スクリプト）

Eagle デザインアセット管理設計、OSSライセンスコンプライアンスガイド、Opus 4.7 Skill Triggers migration、管理者向け運用スクリプトの記録を集約する。

---

# 第1部: Dayopt Eagle デザインアセット管理設計書

> このドキュメントはDayoptのデザインアセットをEagle + MCP + Claude Codeで一元管理するための設計仕様。
> Claude CodeのSkillやCLAUDE.mdから参照する運用ドキュメントとして使用する。

## 1. ライブラリ構成

### 1.1 ライブラリ方針

Dayopt専用ライブラリを新規作成する。既存の混在ライブラリとは分離。

- ライブラリ名: `Dayopt Design`
- 用途: Dayoptに関するすべてのデザインアセット

### 1.2 フォルダ構造

```
Dayopt Design/
├── Components/                    ← Storybookスナップショット（自動管理）
│   ├── UI/                        ← Button, Dialog, Badge, Input, Select...
│   ├── Shell/                     ← AppHeader, BottomTabBar, Sidebar/...
│   └── Common/                    ← ErrorBoundary, EmptyState, DateNavigator...
├── Features/                      ← 機能コンポーネント（自動管理）
│   ├── Calendar/                  ← Views/{Day,Week,Grid}, Header, Sidebar...
│   ├── Settings/                  ← Account, Display, Billing, Data...
│   ├── Stats/                     ← Badges, Insights, Progress, Review...
│   ├── Entry/                     ← Card, Content, Inspector/...
│   ├── Auth/                      ← Login, Signup, MFA...
│   └── Tags/ Onboarding/ Tour/ etc.
├── Foundations/                    ← カラー、タイポグラフィ、spacing、radius
├── Inspiration/                   ← 参考UI・UXリファレンス
│   ├── Timeboxing/
│   ├── Dashboard/
│   └── Mobile UX/
├── Marketing/                     ← ローンチ・プロモーション素材
│   ├── Product Hunt/
│   ├── LP/
│   └── Social/
└── Archive/                       ← 自動移動先（前世代スナップショット、ボツ案）
```

> フォルダ構造は Storybook のサイドバー階層をそのまま反映する。
> コンポーネントフォルダは撮影・同期時に動的に作成される。

### 1.3 スマートフォルダ（保存済み検索）

初期セットアップ時に以下を作成:

| スマートフォルダ名        | 条件                               |
| ------------------------- | ---------------------------------- |
| 🔍 要レビュー             | ★3以下 AND タグ `current`          |
| 🌙 Darkモード全件         | タグ `dark`                        |
| 📅 今週更新               | 更新日 = 今週 AND タグ `component` |
| ⚠️ ブランドカラー逸脱候補 | タグ `color-check`                 |
| 🔗 インスピ→実装リンク    | タグが `ref:` プレフィックスを含む |

## 2. タグ体系

### 2.1 タグカテゴリ

タグはフラットだが、プレフィックスで意味的にグループ化する。

#### 種別（必須・自動付与）

- `component` — Storybookスナップショット
- `token` — デザイントークン素材
- `inspiration` — 参考UI
- `marketing` — LP/PH/SNS素材

#### 状態（必須・自動付与）

- `current` — 最新の正スナップショット
- `deprecated` — 前世代（Archive移動済み）
- `draft` — WIP・検討中

#### テーマ

- `light`
- `dark`

#### ビューポート

- `mobile` — 375px
- `desktop` — 1280px

#### Feature セクション（自動検出）

- `calendar` / `stats` / `settings` / `entry` / `auth`
- `tags` / `tour` / `onboarding` / `chronotype`
- `notifications` / `history` / `palette` / `search` / `contact`

#### パスセグメント（自動付与）

Storybook タイトルの階層がそのままタグになる。
例: `Shared/Components/Actions/Button` → `components`, `ui`, `button`

#### デザイン要素（任意・手動）

- `color:primary-blue`
- `color:amber-h70`
- `color:green-h150`
- `tab-bar`

#### バージョン（リリース単位）

- `v0.9` — プレローンチ
- `v1.0` — ローンチ版
- 以降インクリメント

#### インスピレーション紐づけ

- `ref:{component-name}` — 例: `ref:bottom-sheet`, `ref:entry-card`
- インスピレーション画像と実装スナップショットの両方に付与

### 2.2 タグ自動生成ルール

Storybook タイトル階層とバリアント名からタグを自動生成する。

```
Storybook title: Shared/Components/Actions/Button
Story name: AllPatterns
ファイル名: Components_UI_Button--AllPatterns_dark_mobile.png

→ 自動タグ:
  component, current, button, components, ui, allpatterns, dark, mobile
```

パース規則:

1. `--` の左側をパスとして分割 → 最後のセグメントがコンポーネント名、それ以外がフォルダパス+タグ
2. `--` の右側をバリアント+テーマ+ビューポートとして分割
3. パスの各セグメントが自動的にタグ化される（kebab-case）
4. Feature セクション名（calendar, stats 等）がパスに含まれていれば自動付与

## 3. ファイル命名規約

### 3.1 Storybookスナップショット（自動生成）

```
{StorybookTitle}--{StoryName}_{theme}_{viewport}.png
```

Storybook のタイトル階層がそのままファイル名になる（`/` は `_` に変換）。

具体例:

```
Components_UI_Button--AllPatterns_dark_mobile.png
Components_UI_Button--Default_light_mobile.png
Components_Shell_AppHeader--Default_dark_mobile.png
Features_Calendar_Views_Grid_TimeColumn--Default_light_desktop.png
Features_Settings_DisplaySettings--Default_dark_mobile.png
Features_Entry_Card--WithRecord_light_mobile.png
Foundations_Colors--AllColors_dark_mobile.png
Foundations_Icons--Sizes_light_mobile.png
```

### 3.2 デザイントークン素材

```
token-{type}-{name}.png
```

例:

```
token-color-palette-full.png
token-color-chronotype-zones.png
token-typography-scale.png
token-radius-specimens.png
token-icon-sizes.png
```

### 3.3 マーケティング素材

```
{YYYY-MM-DD}_{channel}-{description}-{version}.png
```

例:

```
2026-04-08_ph-hero-v1.png
2026-04-08_ph-gallery-stats-v2.png
2026-04-10_lp-og-image-v1.png
2026-04-12_social-launch-announcement-v1.png
```

### 3.4 インスピレーション

命名制約なし。Eagle取込時の元ファイル名をそのまま使用。
タグ（種別 `inspiration` + 参考先 `ref:{name}` + カテゴリ）で管理。

## 4. ライフサイクル管理

### 4.1 スナップショットの世代管理ポリシー

**最新のみをComponents/に保持。前回分はArchive/へ自動移動。**

スナップショット更新フロー:

1. Storycapが新しい画像を `screenshots/` に出力
2. スクリプトがComponents/内の同名ファイルを検知
3. 既存ファイルに `deprecated` タグを付与、`current` タグを除去
4. 既存ファイルをArchive/フォルダへ移動
5. 新しいファイルをComponents/の適切なサブフォルダへ追加
6. タグ自動付与（`current` + ファイル名パースによるタグ群）

### 4.2 Archive保持期間

- **30日経過した `deprecated` アイテムは自動削除**（moveToTrash）
- 必要に応じて削除前に★5を付ければ保持対象から除外

### 4.3 ★レーティングの運用ルール

| ★    | 意味           | 用途                                   |
| ---- | -------------- | -------------------------------------- |
| ★5   | 確定・保護対象 | 削除対象から除外。リリース確定デザイン |
| ★4   | 承認済み       | レビュー完了、問題なし                 |
| ★3   | 要レビュー     | 自動生成直後のデフォルト               |
| ★2   | 要修正         | 問題あり、修正予定                     |
| ★1   | ボツ           | 次回クリーンアップで削除候補           |
| なし | 未評価         | 新規取込直後                           |

### 4.4 メモ（annotation）フィールドの活用

Storybookスナップショットには以下を自動でメモに格納:

```
storybook: http://localhost:6006/?path=/story/{story-id}
source: src/components/{path}/{ComponentName}.tsx
captured: 2026-04-08T14:30:00+09:00
storycap-hash: {前回との差分検知用ハッシュ}
```

Claude Codeが「このコンポーネントのソースどこ？」と聞かれたとき、
Eagle MCP → `get_item_info` → メモからパスを抽出して応答できる。

## 5. ビューポート戦略

### 5.1 撮影対象ビューポート

| ビューポート | 幅     | 用途                         |
| ------------ | ------ | ---------------------------- |
| mobile       | 375px  | メイン。全コンポーネント     |
| desktop      | 1280px | Statsページ等の2カラム時のみ |

### 5.2 ルール（Storybook カテゴリ準拠）

| カテゴリ                                | mobile | desktop | 理由                             |
| --------------------------------------- | ------ | ------- | -------------------------------- |
| Features/Calendar/Views/                | ✓      | ✓       | Day/Week/Grid のページレイアウト |
| Features/Settings/                      | ✓      | ✓       | 設定画面各種                     |
| Features/Stats/                         | ✓      | ✓       | 統計タブ各種                     |
| Features/Auth/                          | ✓      | ✓       | 認証画面                         |
| Features/Onboarding/                    | ✓      | ✓       | オンボーディング                 |
| Product/Components/Shell/Sidebar/       | ✓      | ✓       | デスクトップでレイアウト変化     |
| Shared/Components/                      | ✓      | -       | プリミティブ（差分小）           |
| Product/Components/                     | ✓      | -       | ユーティリティ                   |
| Product/Components/Shell/ (Sidebar以外) | ✓      | -       | BottomTabBar, AppHeader          |
| Foundations/                            | ✓      | -       | デザイントークン                 |
| その他 Feature コンポーネント           | ✓      | -       | 個別UIパーツ                     |

フォルダは分けず、タグ（`mobile` / `desktop`）で管理。

## 6. Eagle固有機能の役割割り当て

| Eagle機能              | Dayoptでの用途                                              |
| ---------------------- | ----------------------------------------------------------- |
| ★レーティング          | デザインレビュー状態（§4.3参照）                            |
| メモ                   | Storybook URL、ソースパス、撮影日時、差分ハッシュ           |
| カラーパレット自動抽出 | ブランドカラー準拠チェック。逸脱時に `color-check` タグ付与 |
| スマートフォルダ       | 動的ビュー（§1.3参照）                                      |
| タグ                   | 全メタデータの中心（§2参照）                                |

### 6.1 カラーパレット準拠チェック

Eagleが画像から自動抽出する支配色を、Dayoptブランドカラーと照合:

```
ブランドカラー定義:
- Primary Blue: #2563EB (近傍許容: ΔE < 15)
- Amber H70 (Deep zone): #F59E0B
- Green H150 (Ease zone): #22C55E
- Neutral Gray系: #F8FAFC ~ #0F172A

許容外の支配色が検出された場合 → `color-check` タグを自動付与
```

## 7. インスピレーション → 実装のトレーサビリティ

### 7.1 紐づけルール

参考デザインを保存するとき:

1. `inspiration` タグを付与
2. 参考にするコンポーネントの `ref:{component-name}` タグを付与

実装スナップショットにも同じ `ref:{component-name}` タグが自動で付く。

### 7.2 活用例

```
Eagle検索: "ref:bottom-sheet"
→ 結果:
  - [inspiration] Uber Eats の bottom sheet UI → ★4
  - [inspiration] Apple Maps の地図上 sheet → ★3
  - [component] organisms-bottom-sheet--create-entry-light-mobile.png → ★5 current
```

「このコンポーネント、どの参考UIを元にデザインしたっけ？」に即答できる。

## 8. スナップショットパイプライン

### 8.1 全体フロー

```
[Storybook]
    ↓ Storycap (Playwright)
[screenshots/]  ← ローカルに画像出力
    ↓ eagle-sync スクリプト
[Eagle MCP]
    ├── addFromPath → Components/{category}/
    ├── update → タグ自動付与
    ├── update → メモにメタデータ格納
    └── (既存分) → deprecated化 → Archive/へ移動
```

### 8.2 Storycap設定方針

```js
// .storycap.config.js
module.exports = {
  serverCmd: 'npx storybook dev -p 6006 --no-open',
  captureTimeout: 10000,
  viewports: {
    mobile: { width: 375, height: 812 },
    desktop: { width: 1280, height: 800 },
  },
  // ファイル名テンプレート（命名規約に準拠）
  outDir: './screenshots',
  // 各storyに対して light/dark × mobile/desktop の組み合わせ
};
```

### 8.3 eagle-sync スクリプト概要

```
入力: screenshots/ ディレクトリ内の .png ファイル群
処理:
  1. ファイル名をパースしてメタデータ抽出
  2. Eagle MCP: get_folder_list → 対象フォルダID取得
  3. Eagle MCP: get_item_list → 同名の既存アイテム検索
  4. 既存あり → update（deprecated タグ付与）→ 別フォルダへ移動相当の処理
  5. Eagle MCP: add_item_from_path → 新規追加
  6. Eagle MCP: update → タグ・メモ一括設定
  7. レポート出力（追加N件、更新N件、削除候補N件）
```

### 8.4 実行タイミング

- **手動**: Claude Codeから `eagle-sync` スキルを呼び出し
- **CI連携（将来）**: GitHub Actions の post-merge でStorycap → eagle-sync
- **推奨頻度**: 機能ブランチマージ後、またはデザイン変更コミット後

## 9. Claude Code Skill設計

### 9.1 スキル一覧

| スキル名          | トリガー例                                         | 動作                                      |
| ----------------- | -------------------------------------------------- | ----------------------------------------- |
| eagle-sync        | 「スナップショット更新して」                       | Storycap実行 → Eagle取込 → レポート       |
| eagle-lookup      | 「BottomSheetのデザイン見せて」                    | Eagle MCP検索 → サムネイル/メタデータ返却 |
| eagle-review      | 「未レビューのコンポーネント一覧」                 | ★3以下 + current を検索してリスト表示     |
| eagle-cleanup     | 「Archiveの古いスナップショット整理して」          | 30日超のdeprecatedアイテムをmoveToTrash   |
| eagle-inspiration | 「bottom-sheetの参考UIと実装を並べて」             | ref:タグで検索、インスピと実装を対比表示  |
| eagle-color-check | 「ブランドカラーから外れてるコンポーネントある？」 | color-checkタグのアイテムをリスト表示     |

### 9.2 ディレクトリ配置

```
~/.claude/skills/eagle-dayopt/
├── SKILL.md                  ← スキル本体（description + 手順）
├── scripts/
│   ├── eagle-sync.sh         ← Storycap実行 + Eagle取込
│   ├── eagle-cleanup.sh      ← Archive整理
│   └── parse-filename.ts     ← ファイル名→タグ変換ユーティリティ
├── references/
│   └── tag-taxonomy.md       ← タグ体系リファレンス（§2を抽出）
└── assets/
    └── storycap.config.js    ← Storycap設定テンプレート
```

## 10. 初期セットアップ手順

### Phase 1: Eagle側

1. Dayopt Design ライブラリ新規作成
2. フォルダ構造作成（§1.2）
3. スマートフォルダ作成（§1.3）

### Phase 2: パイプライン構築

4. Storycap導入・設定
5. eagle-sync スクリプト実装
6. ファイル命名テンプレート→タグ変換ロジック実装
7. ライフサイクル管理（deprecated化・Archive移動）実装
8. メモフィールド自動格納実装

### Phase 3: Claude Code Skill

9. SKILL.md作成（eagle-dayoptスキル）
10. scripts/ 実装
11. 動作確認（手動トリガーで一連のフロー実行）

### Phase 4: 運用開始

12. 既存インスピレーション画像をInspiration/へ移動・タグ付け
13. デザイントークン素材を撮影・取込
14. マーケティング素材フォルダにPH/LP用素材を整理

## 変更履歴（Eagle）

| 日付       | 内容     |
| ---------- | -------- |
| 2026-04-08 | 初版作成 |

---

# 第2部: License Compliance Guide - 開発者向け

Dayopt OSS License Compliance System の使い方ガイド。

このリポジトリは pnpm workspace 形式の monorepo。公開用クレジットは `@dayopt/product` の
production dependency tree を対象に生成する。

## クイックスタート

### 依存関係追加時のチェックフロー

```bash
# 1. 新しいパッケージをインストール
pnpm --filter @dayopt/product add <package-name>

# 2. ライセンス情報を生成
pnpm generate-licenses

# 3. コンプライアンスチェック
pnpm license:check

# ✅ 合格なら完了
# ❌ 違反があればパッケージを削除して代替を探す
```

### よくある質問（ライセンス）

**Q: MIT、Apache-2.0、ISCライセンスは使える？**
A: はい、すべて承認済みライセンスです。

**Q: GPLライセンスは使える？**
A: いいえ。GPL/AGPLはコピーレフト条項により商用アプリで使用できません。

**Q: ライセンスが不明なパッケージは？**
A: 使用禁止です。法的リスクがあるため、必ず代替パッケージを探してください。

## VS Code統合

### タスクランナー

`Cmd+Shift+P` → `Tasks: Run Task` でライセンス関連タスクを実行:

| タスク名                            | 説明                       | ショートカット |
| ----------------------------------- | -------------------------- | -------------- |
| **📄 Generate License Information** | ライセンス情報を生成       | -              |
| **🔒 License Compliance Check**     | コンプライアンスチェック   | -              |
| **📊 License Statistics**           | ライセンス統計表示         | -              |
| **🔍 View License Policy**          | ポリシー表示               | -              |
| **📋 Full License Audit**           | 完全監査（生成+チェック）  | -              |
| **⚠️ License Check (Strict Mode)**  | 厳格モード（警告もエラー） | -              |

### キーボードショートカット設定（オプション）

`.vscode/keybindings.json` に追加:

```json
[
  {
    "key": "cmd+shift+l",
    "command": "workbench.action.tasks.runTask",
    "args": "🔒 License Compliance Check"
  }
]
```

## CLIコマンド

### ライセンス情報生成

```bash
pnpm generate-licenses
```

**出力**:

- `apps/product/public/legal/oss-credits.json` - Web表示用データ
- `apps/product/public/legal/THIRD_PARTY_NOTICES.txt` - Apache-2.0 NOTICE集約

**実行タイミング**:

- `apps/product/package.json` / `pnpm-lock.yaml` 変更時
- 手動でライセンス情報を更新したい時

**生成対象**:

- `pnpm --filter @dayopt/product licenses list --prod --json --long` の結果
- production dependencies とその transitive dependencies
- private workspace package 自体は除外され、外部 package の license だけを列挙

### 生成物の鮮度チェック

```bash
pnpm license:credits:check
```

`pnpm generate-licenses` の結果と committed file が一致するかを検証する。CI では drift 検出として実行する。

### コンプライアンスチェック

```bash
# 通常チェック（.licensrc.json のルールを適用）
pnpm license:check
```

**チェック項目**:

- ✅ 許可ライセンス: 16種類（MIT, Apache-2.0, ISC等）
- ❌ 制限ライセンス: 自動検出（.licensrc.json の onlyAllow に含まれないライセンス）

### ライセンス統計表示

```bash
# 統計サマリー
pnpm license:audit

# 全パッケージ詳細（JSON形式）
pnpm --filter @dayopt/product licenses list --prod --json --long
```

**例: 統計サマリー出力**:

```
├─ MIT: 719
├─ Apache-2.0: 75
├─ ISC: 63
├─ BSD-3-Clause: 16
└─ BSD-2-Clause: 12
```

## ワークフロー（ライセンス）

### 1. 新規パッケージ追加時

```bash
# Step 1: インストール
pnpm --filter @dayopt/product add lodash

# Step 2: ライセンス情報更新
pnpm generate-licenses

# Step 3: コンプライアンスチェック
pnpm license:check

# Step 4: ライセンス詳細確認（必要に応じて）
pnpm --filter @dayopt/product licenses list --prod --json --long \
  | jq '.[] | .[] | select(.name | contains("lodash"))'
```

**チェック結果**:

- ✅ 合格 → コミット可能
- ❌ 違反 → パッケージを削除して代替を探す

### 2. 依存関係更新時

```bash
# Step 1: 依存関係更新
pnpm --filter @dayopt/product update

# Step 2: ライセンス情報更新
pnpm generate-licenses

# Step 3: 差分確認
git diff apps/product/public/legal/oss-credits.json

# Step 4: コンプライアンスチェック
pnpm license:check

# Step 5: 生成物の鮮度チェック
pnpm license:credits:check
```

### 3. CI/CDパイプライン（ライセンス）

GitHub Actionsが自動実行:

**トリガー**:

- `package.json` / `pnpm-lock.yaml` 変更時
- PR / main push の CI

**処理内容**:

1. コンプライアンスチェック
2. `oss-credits.json` / `THIRD_PARTY_NOTICES.txt` の drift 検出
3. 違反または drift があれば CI 失敗

## ライセンスポリシー

### 許可ライセンス（全16種類）

| ライセンス   | 商用利用 | 注意点                         |
| ------------ | -------- | ------------------------------ |
| MIT          | ✅       | 著作権表示必須                 |
| Apache-2.0   | ✅       | NOTICE表示必須（自動対応済み） |
| ISC          | ✅       | 著作権表示必須                 |
| BSD-2-Clause | ✅       | 著作権表示必須                 |
| BSD-3-Clause | ✅       | 著作権表示 + 推薦禁止条項      |
| MPL-2.0      | ✅       | ファイル単位のコピーレフト     |
| CC0-1.0      | ✅       | パブリックドメイン             |
| 0BSD         | ✅       | 著作権表示不要                 |
| Unlicense    | ✅       | パブリックドメイン             |

### 制限ライセンス（全10種類）

| ライセンス     | 理由                                         | 代替案                               |
| -------------- | -------------------------------------------- | ------------------------------------ |
| GPL-2.0/3.0    | コピーレフト                                 | MITライセンスのパッケージを探す      |
| AGPL-3.0       | 強力なコピーレフト（ネットワーク経由も適用） | Apache-2.0のパッケージを探す         |
| LGPL-2.1/3.0   | 動的リンクのみ許可                           | 代替パッケージを探す                 |
| SSPL           | サーバーサイド利用でソース公開義務           | 代替パッケージを探す                 |
| Commons Clause | 商用利用禁止                                 | 商用利用可能なパッケージを探す       |
| BUSL-1.1       | ビジネス利用に時間制限                       | 代替パッケージを探す                 |
| UNLICENSED     | ライセンス不明                               | 公式ライセンスがあるパッケージを探す |
| UNKNOWN        | ライセンス情報なし                           | 公式パッケージを探す                 |

### 警告ライセンス（3種類）

| ライセンス   | 注意点                                       | 対応         |
| ------------ | -------------------------------------------- | ------------ |
| CC-BY-SA-4.0 | ShareAlike条項（派生物に同一ライセンス適用） | 使用前に確認 |
| EPL-2.0      | 弱いコピーレフト（ファイル単位）             | 使用前に確認 |
| CDDL-1.0     | 弱いコピーレフト（ファイル単位）             | 使用前に確認 |

## トラブルシューティング（ライセンス）

### エラー: "oss-credits.json が見つかりません"

**原因**: ライセンス情報が未生成

**解決方法**:

```bash
pnpm generate-licenses
```

### エラー: "ライセンス違反が検出されました"

**原因**: 制限ライセンスのパッケージを使用

**解決方法**:

```bash
# 1. 違反パッケージを特定
pnpm license:check

# 2. パッケージの詳細確認（違反ライセンスを持つパッケージを探す）
pnpm --filter @dayopt/product licenses list --prod --json --long \
  | jq '.[] | .[] | select(.license != "MIT" and .license != "Apache-2.0" and .license != "ISC")'

# 3. パッケージを削除
pnpm --filter @dayopt/product remove <package-name>

# 4. 代替パッケージを検索
pnpm search <similar-package-name>

# 5. 代替パッケージをインストール
pnpm --filter @dayopt/product add <alternative-package>

# 6. 再チェック
pnpm generate-licenses && pnpm license:check && pnpm license:credits:check
```

### 警告: "検証済みファクターなし"（MFA関連）

**原因**: 開発環境で無関係な警告が表示される場合がある

**解決方法**: 無視してOK（本番環境のみ必要）

### ビルド失敗: "License compliance check failed"

**原因**: CI/CDで制限ライセンスが検出された

**解決方法**:

1. ローカルで `pnpm license:check` 実行
2. 違反パッケージを削除
3. 代替パッケージをインストール
4. 再度プッシュ

## 統計情報の見方（ライセンス）

### ライセンス分布

```
MIT: 719 packages (80.2%)  ← 最も一般的
Apache-2.0: 75 packages (8.4%)
ISC: 63 packages (7.0%)
BSD-3-Clause: 16 packages (1.8%)
BSD-2-Clause: 12 packages (1.3%)
```

**分析**:

- **80%以上がMIT**: 非常に健全な状態
- **Apache-2.0が8%**: NOTICE要件に自動対応済み
- **その他のライセンス**: すべて許可リスト内

### トップ公開者

```
1. Titus Wormer: 114 packages  ← マークダウン関連
2. Mike Bostock: 38 packages   ← D3.js作者
3. Sindre Sorhus: 29 packages  ← Node.jsユーティリティ
```

**意味**:

- 信頼できる著名な開発者のパッケージを多く使用
- エコシステムの健全性が高い

## 関連リンク（ライセンス）

### 外部リソース

- [SPDX License List](https://spdx.org/licenses/) - 公式ライセンス一覧
- [Choose a License](https://choosealicense.com/) - ライセンス選択ガイド
- [TL;DR Legal](https://tldrlegal.com/) - ライセンス要約サイト
- [Open Source Initiative](https://opensource.org/licenses) - OSI承認ライセンス

## 変更履歴（ライセンス）

| 日付       | バージョン | 変更内容                                              |
| ---------- | ---------- | ----------------------------------------------------- |
| 2026-06-29 | 1.1.0      | monorepo / pnpm 前提に更新。生成物 drift check を追加 |
| 2025-10-15 | 1.0.0      | 初版作成（Phase 5完了時）                             |

---

# 第3部: Opus 4.7 Skill Triggers Migration

**Date**: 2026-04-17
**Scope**: `.claude/skills/` 配下 project skills 12 個
**Status**: 完了

## 1. 背景

Claude Opus 4.7 は Opus 4.6 より **subagent / skill の自動起動が控えめ** になった。delegation 判断が厳しくなり、曖昧な description では skill が invoke されなくなるケースが増えた。

skill invocation は description を読んで判断される仕様上、**description が invocation 判断の主戦場、本文は invoke 後の行動強化**という役割分担を前提にチューニングが必要になった。

## 2. 対象と範囲

**対象**: project skills 12 個（`.claude/skills/` 配下、repo commit される）

- `storybook` / `security` / `test` / `optimistic-update`
- `trpc-router-creating` / `store-creating` / `i18n` / `error-handling`
- `supabase` / `docs-writing` / `releasing` / `eagle-dayopt`

**スコープ外（別タスク）**:

- user-global skills（`~/.claude/skills/` 配下、個人設定）の 4.7 チューニング
- adversarial review 等の subagent 設計（`.claude/agents/` ディレクトリ自体が現状存在しない）

**実施内容**:

- 各 skill の description をリライト（先頭句に具体トリガー列挙を埋め込む）
- `## When to Use` / `## When NOT to Use` セクションを新設または更新
- skill 間の境界を NOT 条件の括弧明記で self-documenting 化
- `supabase` skill で invocation トリガーと実行時ルールを別セクションに分離

## 3. 展開プロセス（参考）

将来類似の migration（4.8 対応、skill 群一括追加など）で再利用できるメタパターンとして記録する。方法論として独立させるほどの蓄積はまだないため、本節内に「参考」として置く。

### Phase A: 型安定性検証（pilot + 高標準度）

- Pilot: `storybook`（新設パターン）+ `security`（リライトパターン）を同時に仕上げ、**「新設」と「リライト」の両方の型**を 1 バッチで固める
- 検証: `test` + `optimistic-update` で pilot の型が他 skill でも機能するか本番検証

判断基準: 1 skill だけの pilot だと「既存 When to Use あり / なし」のどちらか一方しかカバーできない。2 skill 同時だと型の両側が固まる。

### Phase B: 標準型で機械展開

- B-1: `trpc-router-creating` + `store-creating`（作成系）
- B-2: `i18n` + `error-handling`（予防系）

判断基準: Phase A で型確定後は機械的に処理できる skill を先に。境界の括弧明記ルールが自然に適用される。

### Phase C: 例外系（型拡張しながら個別対応）

- `supabase`（字数 250 字拡張、軸混在特例）
- `docs-writing`（副次トリガー型、見出しラベル変更、要素数 7 まで許容）

判断基準: 標準型から外れる skill は Phase A/B と混ぜると型が揺らぐ。まとめて Phase C で拡張ルールを決めながら書く。

### Phase D: 単独扱い

- `releasing`（明示発動型、NOT=該当なし + 近接ケース列挙）
- `eagle-dayopt`（ライフサイクル型、パイプラインステージ分割、要素数 8 まで許容）

判断基準: 型が質的に異なる skill は並行処理しない。1 skill ずつ慎重に。

### Gate の設計

各 Phase 完了時に **型の再利用性チェック** を 1 ターン挟んだ。pilot → 4 skill 横断チェック → 6 skill 横断チェック → 最終 12 skill cross-check。「型が崩れた瞬間」を早期に検知できた。

## 4. 12 skill の類型マッピング

各 skill の類型定義と書式詳細は [.claude/rules/skill-design.md](../../.claude/rules/skill-design.md) を参照。

| #   | skill                  | 類型             |
| --- | ---------------------- | ---------------- |
| 1   | `storybook`            | 作成系           |
| 2   | `security`             | 予防系           |
| 3   | `test`                 | 予防系           |
| 4   | `optimistic-update`    | 予防系           |
| 5   | `trpc-router-creating` | 作成系           |
| 6   | `store-creating`       | 作成系           |
| 7   | `i18n`                 | 予防系           |
| 8   | `error-handling`       | 予防系           |
| 9   | `supabase`             | 運用系           |
| 10  | `docs-writing`         | 副次トリガー型   |
| 11  | `releasing`            | 明示発動型       |
| 12  | `eagle-dayopt`         | ライフサイクル型 |

6 類型を 12 skill でカバーしており、類型定義の網羅性として十分。

## 5. 例外運用と特例記録

### `supabase`: 軸混在特例

description に「DB 変更系 / Realtime 系 / Edge Functions 系 / 3 環境運用」の 4 束が混在する。通常型の単一軸構造では収まらず、字数 244 字で 6 要素を配置している（250 字枠の特例）。将来 supabase を触る時は、この軸混在を前提に読む。

### `docs-writing`: 副次トリガー型、7 要素

「コード変化」ではなく「上位イベント確定」が発動契機。通常型の 5-6 要素上限を超える 7 要素を許容している。見出しも「上位イベント起点 / 診断起点」のサブ見出しで分割。

### `error-handling`: 6 要素上限到達

責務が「try/catch / onError / ErrorBoundary / Sentry / AppError 正規化 / ユーザー通知」の 6 軸に広がっており、When to Use 要素数が通常型の上限 6 に到達している。今後新しい責務（例: observability 連携拡張）が加わる場合は、**別 skill 分離を検討**すべき境界に既に来ている。

### `releasing`: NOT=「該当なし」+ 近接ケース列挙

明示発動型は暗黙発動ケースが存在しないため、NOT を「該当なし」だけで終えると情報密度ゼロになる。代わりに近接ケース 3 件を矢印記法で列挙し、遷移先を明記している（例: `→ docs-writing skill で ADR / 技術ドキュメント更新を先行`）。

### `eagle-dayopt`: ライフサイクル型、要素数 8

パイプラインの各ステージ（撮影 → 同期 → レビュー → 整理）で最低 1-2 要素必要なため、要素数が通常型を超える。[.claude/rules/skill-design.md](../../.claude/rules/skill-design.md) の類型表で 8 まで許容と明記済み。

## 6. 設計原則の確立

この migration 中に確立した skill 設計の恒常ルールは **[.claude/rules/skill-design.md](../../.claude/rules/skill-design.md)** に分離した。主要原則:

- **6 類型の定義**（作成系 / 予防系 / 運用系 / 副次トリガー型 / 明示発動型 / ライフサイクル型）
- **description の書式**（字数、先頭句、構造）
- **When to Use の書式**（並び順、要素数、診断起点数の判断基準、外部起点の扱い）
- **When NOT to Use の書式**（括弧明記ルール、明示発動型の矢印記法）
- **境界設計原則**（skill 間 handoff、skill 層と rules 層の境界、自動生成 artifact の扱い、invocation トリガーと実行時ルールの分離、self-contained 原則）
- **空白領域 flag**（URL state の将来 skill 化余地）

本節は **1 回性のイベント記録**であり、skill 設計の source of truth は `.claude/rules/skill-design.md` 側。将来 skill を追加・修正する際は rules/ 側を参照する。

## 7. スコープ境界（未着手タスク）

### 7.1 user-global skills の Opus 4.7 チューニング

対象候補: `ask-questions-if-underspecified` / `investigate` / `debug` / `refactor` / `feature-scaffolding`

特に `ask-questions-if-underspecified` は 4.7 の「初回ターンで十分仕様化されていれば質問せず進む」方針と衝突する可能性が高い。repo タスクに混ぜず、個人設定見直しとして別セッションで扱う。

### 7.2 adversarial review subagent 設計

Designer / Critic / User の 3-agent design review を仮に実装する場合、skill ではなく subagent として `.claude/agents/` 配下に設計する。現状ディレクトリ自体存在せず、発生時に別ファイル / 別 note で扱う。命名空間は `subagent-*` とし、本節（`skill-triggers`）と分離する。

---

# 第4部: 管理者向け運用スクリプト（admin-\*.sh）

`scripts/admin-*.sh` は Supabase Auth Admin API を直接叩き、dogfooding / 内部テスト用の account 操作を CLI から行うためのツール群。通常の signup / login flow を bypass したい時のみ使用する。

共通の env チェック・auth header 生成は `scripts/admin-common.sh` に集約されており、各スクリプトはこれを `source` する。

## 実行方法

```bash
op run --env-file=.op-env.local -- \
  env USER_EMAIL=foo@example.com \
  bash scripts/admin-show-user.sh
```

`.op-env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を設定し、`op run --env-file=.op-env.local` 経由で実行する。Production project に対して実行する場合は手動作業ログを残す。

## スクリプト一覧

| スクリプト                    | 用途                                                      | 必須 env                         |
| ----------------------------- | --------------------------------------------------------- | -------------------------------- |
| `admin-create-user.sh`        | email + password で user を新規作成（即 login 可能）      | `USER_EMAIL`, `PASSWORD_ITEM_ID` |
| `admin-delete-user.sh`        | user を hard delete（関連 row も CASCADE 削除）           | `USER_EMAIL`                     |
| `admin-ensure-profile.sh`     | trigger 未発火時に `profiles` row を手動 upsert           | `USER_EMAIL`                     |
| `admin-generate-magiclink.sh` | captcha / UI form の bug を bypass する magic link を発行 | `USER_EMAIL`                     |
| `admin-set-user-password.sh`  | 既存 user の password を上書き + email 確認済みにする     | `USER_EMAIL`, `PASSWORD_ITEM_ID` |
| `admin-show-user.sh`          | email から `auth.users` の状態を dump（read-only）        | `USER_EMAIL`                     |

`PASSWORD_ITEM_ID` は password を保存した 1Password item の ID。

## 関連スクリプト

| スクリプト            | 用途                                                                                       | 必須 env                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `enable-auth-hook.sh` | Production project の `custom_access_token` hook を有効化する                              | `SUPABASE_ACCESS_TOKEN`                                                                       |
| `verify-login.sh`     | email + password の組合せで直接 `/auth/v1/token` を叩き、login 可否を確認する（read-only） | `USER_EMAIL`, `PASSWORD_ITEM_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

`verify-login.sh` が成功すれば password 自体は正しい（UI / CSP / form 側の問題）。失敗すれば `admin-set-user-password.sh` で password を再設定する。
