# ADR-022: 共有 component の責務ベース taxonomy（第二階層）

> accepted（2026-06-23）

> ADR-021 を前提に、`packages/components/src/` の第二階層 category を精緻化する。ADR-021
> の「category 別整理 + 単一 barrel」方針は不変。本 ADR は category の**切り方**だけを更新する。

---

## コンテキスト

ADR-021 で `packages/components` を canonical 実装＋単一 barrel に集約した際、第二階層は
移行元の都合で `primitives / forms / feedback / actions / layout` の 5 category だった。
集約後にこの 5 分割を運用すると、責務の混在が顕在化した：

- `primitives/`（12）が grab-bag 化: ブランド(Logo)・操作(Button)・面(Card)・余白(Container)・
  loading(Spinner/Skeleton)・overlay(Tooltip)・文字(Typography)・a11y(VisuallyHidden) が同居
- `layout/`（9）が navigation(Tabs/Breadcrumb/Pagination)・overlay(Dialog/Drawer/Sheet/Popover)・
  実 layout(ScrollArea/Collapsible) を混載

category 名から中身が予測できず、「新しい component をどこに置くか」の判断が属人化していた。

barrel が単一 export 入口（`@dayopt/components`）であるため、第二階層の切り直しは
**公開 API・consumer の import に無影響**で行える（移動は barrel の相対 path 更新のみ）。
この低コストさが、taxonomy を最適形に整え直す好機だった。

---

## 決定

第二階層を**責務ベースの 9 category** に切り直す。各 category は「その component が
ユーザーに対して何をするか」で定義する。

| category      | 責務                       | 構成                                                                                |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `identity/`   | ブランドを識別させる       | Logo                                                                                |
| `actions/`    | 操作を実行させる           | Button, ActionFooter, Command, DropdownMenu                                         |
| `inputs/`     | 値を受け取る               | Checkbox, Field, Form, Input, InputOTP, Label, RadioGroup, Select, Switch, Textarea |
| `navigation/` | 場所・画面・節を移動させる | Breadcrumb, Pagination, Tabs                                                        |
| `feedback/`   | 状態・進行・通知を伝える   | Alert, InlineBanner, Skeleton, Spinner, Toaster                                     |
| `overlays/`   | 一時的に画面上へ重ねる     | AlertDialog, Dialog, Drawer, Popover, Sheet, HoverTooltip                           |
| `display/`    | 値・面・文字を提示する     | Avatar, Badge, Card, Heading/Text                                                   |
| `layout/`     | 余白・構造を作る           | Collapsible, Container, ScrollArea, Separator                                       |
| `utilities/`  | a11y・低レベル補助         | VisuallyHidden                                                                      |

- `cn.ts`（`src/` 直下）と `hooks/`（`src/hooks/`）は **infra として据え置く**。component の
  `'../cn'` / `'../hooks/*'` 参照を不変に保ち、不要な churn を避けるため。
- `forms` は責務名として `inputs` に改名（提案語に統一）。

---

## 詳細

### 薄い category も意味重視で残す

`identity/`（Logo 1 個）・`utilities/`（VisuallyHidden 1 個）は単体 component だが、意味境界が
明確で将来の受け皿（Wordmark / Favicon、Portal / Slot 等）として機能するため残す。一方
提案段階にあった `Surfaces`（Card 単体）は薄すぎるため `display/` に統合した。
「将来必要かも」で空 category は作らない（Avatar/Table/Metric/EmptyState/Panel/Callout/Portal
のうち shared 未存在のものは枠を作らない）。

### app 非依存 primitive の昇格

app 層（`apps/product/src/components/ui/`）に埋もれていた表示用 Avatar の基底
（`Avatar`/`AvatarImage`/`AvatarFallback` + `avatarVariants`）を `display/` に昇格した。
app 固有の `AvatarUpload`（Supabase Storage アップロード前提・i18n 結合）は app に残し、
基底のみ `@dayopt/components` から取得する。ADR-021 の「i18n 結合の強い component は
app 残置、将来 props 注入で共有化」の方針に沿う切り分け。

### app 層へは taxonomy をミラーしない

app 固有 component（product の confirm-dialog / destructive-form-dialog / mini-calendar / toast、
web の marketing/docs 系）は少数かつ app 固有で、9 category を機械的にミラーすると単体
ディレクトリが乱立する。よって app 層は昇格対象のみ shared へ動かし、残りは既存の home
（`components/ui` 等）に据え置く。taxonomy は `packages/components` の責務語彙としてのみ正規化する。

---

## 結果

### メリット

- category 名から中身が一意に予測でき、「新規 component の置き場」判断が機械化される
- grab-bag（旧 primitives / layout）が解消し、責務境界が self-documenting になる
- 単一 barrel のため consumer・Storybook story title に無影響で切り直せた

### トレードオフ

- `identity/` / `utilities/` は単体 component の category（意味境界優先で許容）
- Storybook の story `title:` は物理 path と decouple 済みのため本 ADR では再整列しない
  （必要なら別途の cosmetic 作業）

---

## 関連

- ADR-021 — デザインシステム共有レイヤー（packages canonical / app 直接 import）。本 ADR は
  その第二階層 category を精緻化する
- `packages/components/src/index.ts` — 単一 barrel（category 別に整理）
- `.claude/rules/feature-boundaries.md` — app 内 feature 境界（packages ↔ app 境界は ADR-021）
