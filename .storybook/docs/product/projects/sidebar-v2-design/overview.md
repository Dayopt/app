# Phase 2-D: v2 デザイン適用 詳細設計

> **策定日**: 2026-04-23
> **対象**: Dayopt `src/app/[locale]/(app)/**` の視覚デザイン (PageNav / BottomTabBar / Sidebar 外殻)
> **前提**: Phase 2-C (3 モード layout 再編) 完了済 (最終コミット `70ef2ed51` / 2026-04-23)
> **性質**: 視覚デザイン主軸の refactor (routing / 構造変更なし)
> **親設計**: `docs/design/sidebar-redesign-plan.md` §7 Phase 2-D を継承

## Context

Phase 2-C で 3 モード構造の基盤ができた。PageNav は 3 タブ (Calendar / Stats / AI) 化、BottomTabBar は 4 タブ (Calendar / Stats / AI / Account) 化されたが、**見た目は Phase 2-B 時点の utility 重ねそのまま**。

Phase 2-D では以下の視覚課題を解決する:

1. PageNav の active/inactive 差が弱い (`bg-muted` vs `hover:bg-state-hover` だけでは launch 訴求として薄い)
2. 選択時と非選択時の視覚 hierarchy が不足 (ラベルが常時表示されメリハリが出ない)
3. AI タブの launch 時訴求 (NEW バッジ / β 表示) が未実装
4. Desktop / Mobile のデザイン言語が揃っていない (Desktop=pill segmented、Mobile=M3 pill-icon)
5. hover / focus / transition の統一が取れていない

本 Phase は **routing / DOM 構造不変で CSS + アニメーションのみ**を変更する。

---

## 章立て

0. [v2 mock の扱い (blocker)](#0-v2-mock-の扱い-blocker)
1. [現状分析 (Phase 2-C 完了時点)](#1-現状分析-phase-2-c-完了時点)
2. [目標デザイン仕様](#2-目標デザイン仕様)
3. [CSS / アニメーション実装方針](#3-css--アニメーション実装方針)
4. [amber バッジ設計](#4-amber-バッジ設計)
5. [Desktop / Mobile の統合判断](#5-desktop--mobile-の統合判断)
6. [Step 分割と blast radius](#6-step-分割と-blast-radius)
7. [各 Step 詳細設計](#7-各-step-詳細設計)
8. [Storybook / test / E2E 影響](#8-storybook--test--e2e-影響)
9. [手動確認シナリオ](#9-手動確認シナリオ)
10. [ロールバック戦略](#10-ロールバック戦略)
11. [リスクと対策](#11-リスクと対策)
12. [相談事項 (ユーザー判断が必要)](#12-相談事項-ユーザー判断が必要)
13. [Phase 2-D 完了後の残課題](#13-phase-2-d-完了後の残課題)

---

## 0. v2 mock の扱い (blocker)

**Tomoya が言及した `dayopt-sidebar-tabs-refined.html` は本 repo に commit されていない** (Glob で 0 件)。`docs/design/` にも画像・URL・参照 link なし。

視覚デザインの「正解」が外部依存のままでは Phase 2-D は前に進められない。以下のいずれかで解消する必要がある:

- **Option α**: mock HTML を `docs/design/mocks/phase-2-d-refined.html` にコミット (推奨)
  - 利点: PR レビューで「何を目指しているか」が self-documenting
  - 利点: Storybook visual regression の reference として転用可能
- **Option β**: mock のスクリーンショットを `docs/design/mocks/phase-2-d-*.png` にコミット
  - 利点: HTML を保守する必要がない
  - 欠点: hover / transition の挙動が静止画で伝わらない
- **Option γ**: mock 相当の要件を本書 §2 に文章化し、mock 自体はコミットしない
  - 利点: 追加ファイル不要
  - 欠点: Tomoya の「視覚的満足」判断基準が書面に残らず、Step ごとに口頭確認になる

本書 §2 は Tomoya の planning prompt で列挙された 4 要件 (PageNav 視覚リデザイン / BottomTabBar 整合 / Sidebar 洗練 / hover・focus・transition 統一) を Option γ 相当で文章化しているが、**Step D-2 着手前に mock を Option α or β でコミットする**ことを前提とする。

→ **相談事項 A**: mock の扱い方針 (§12)

### 0.1 方針確定 (2026-04-23)

**mock HTML は Tomoya の手元にないため、本書 §2 の文章記述を基準として Phase 2-D を進める** (2026-04-23 確定)。Step D-0 はスキップし、各 Step の手動確認で軌道修正する iterative approach を採用。

- Step D-2 (PageNav v2 基本) 完了時点が方向性分岐点 (§9.4 手動確認チェックリスト参照)
- NG の場合: D-2 内で再調整 (複数回 iteration 許容) / 方針自体の変更が必要なら D-2 revert + 設計書更新
- OK の場合: D-3 以降に進む

各 Step で Storybook 視覚確認を必須ゲートとする (ja/en 両 locale / light/dark 両 theme)。違和感あれば即座にフィードバックし軌道修正。

---

## 1. 現状分析 (Phase 2-C 完了時点)

### 1.1 PageNav.tsx (Desktop)

[src/lib/components/shell/sidebar/PageNav.tsx](../../../../src/lib/components/shell/sidebar/PageNav.tsx)

```tsx
<nav className="border-border flex items-center overflow-hidden rounded-full border">
  <Link
    className={cn(
      'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
      activePage === 'calendar'
        ? 'bg-muted text-foreground font-medium'
        : 'text-muted-foreground hover:bg-state-hover',
    )}
  >
    <CalendarDays className="size-4" />
    <span>{t('calendar')}</span>
  </Link>
  {/* Stats / AI も同形 */}
</nav>
```

**現状の特徴**:

- 外枠: `rounded-full` pill + `border` + `overflow-hidden`
- 各タブ: 固定 `h-8` / `px-4` / `gap-2` / `size-4` アイコン + ラベル常時表示
- active: `bg-muted` + `text-foreground` + `font-medium`
- inactive: `text-muted-foreground` + `hover:bg-state-hover`
- transition: `transition-colors` のみ (≒ `duration-150` default)

**v2 からの gap**:

- active/inactive の背景差が弱い (`bg-muted` は L=0.95 で背景 L=0.98 との差が 0.03 しかない)
- ラベルが常時表示で「選択」のメリハリが出ない
- 隣接タブの squeeze なし (固定 `px-4` で width 変化なし)

### 1.2 BottomTabBar.tsx (Mobile)

[src/app/[locale]/(app)/\_shell/BottomTabBar.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.tsx>)

```tsx
<nav className="bg-surface-container z-bottom-tab pb-safe shadow-card fixed inset-x-0 bottom-0">
  <div className="flex h-14 items-center justify-around">
    {tabs.map((tab) => (
      <Link
        className={cn(
          'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'relative flex items-center justify-center rounded-full px-4 py-1 transition-colors',
            isActive && 'bg-primary-state-selected',
          )}
        >
          <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.5} />
        </span>
        <span className={cn('text-xs', isActive && 'font-medium')}>{tab.label}</span>
      </Link>
    ))}
  </div>
</nav>
```

**現状の特徴**:

- M3 (Material Design 3) pill-icon スタイル採用
- active: `bg-primary-state-selected` pill 背景 + `strokeWidth={2.5}` + `text-primary` + ラベル `font-medium`
- inactive: `strokeWidth={1.5}` + `text-muted-foreground`
- アイコン `size-5` (20px) / ラベル `text-xs` / 高さ `h-14`

**v2 からの gap**:

- Desktop (pill segmented) と Mobile (pill-icon individual) で言語が別
- amber バッジなし

### 1.3 Sidebar.tsx

[src/lib/components/shell/sidebar/Sidebar.tsx](../../../../src/lib/components/shell/sidebar/Sidebar.tsx)

**現状の特徴**:

- Header: `h-12` (48px) / ロゴ + 閉じるボタン
- Content: `flex-1 overflow-y-auto gap-4` (セクション間 16px)
- Footer: UserMenu + actions (`py-2`)
- 外殻: `border-r border-border bg-surface-container`

**v2 からの gap**:

- セクション見出しのスタイルが feature ごとにばらつき (CalendarSidebar / StatsSidebar / AiSidebar で異なる)
- Utilities (テーマ切替) の配置・サイズは他タスクで対応済だが、v2 モック相当かは未確認

### 1.4 design-tokens.css の現状

[src/lib/styles/tokens/colors.css](../../../../src/lib/styles/tokens/colors.css) より:

- `--muted: var(--neutral-95)` (L=0.95) — 現 active 背景
- `--state-active: oklch(0.95 0.025 260)` (H260) — 選択中の一般トークン
- `--primary: oklch(0.45 0.14 H_brand)` — brand color
- spacing は 8pt grid 厳守 (禁止値: `*-0.5/1.5/2.5/3/3.5/5/7/9`)
- transition: デフォルト `duration-150`、`duration-200/300` は用途別

**amber バッジ用のトークンなし**。`--warning` (L=0.55 H=70) は category 色としては存在するが、NEW バッジ専用としての設計はされていない。→ §4 で追加トークン or 既存転用を判断。

---

## 2. 目標デザイン仕様

### 2.1 SidebarPageNav v2 (Desktop)

**インタラクションモデル**: "expanding segmented control"

| 状態                | 幅                | 表示                                       | 背景                                             | テキスト                                       |
| ------------------- | ----------------- | ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| Active              | ラベル展開 (auto) | icon + label                               | `bg-primary-state-selected` or `bg-muted` (深め) | `text-primary` / `text-foreground` font-medium |
| Inactive            | icon のみ固定     | icon のみ                                  | なし (外枠 `border` のみ)                        | `text-muted-foreground`                        |
| Inactive hover      | icon のみ固定     | icon のみ + tooltip label                  | `bg-state-hover`                                 | `text-foreground`                              |
| Inactive hover peek | icon のみ固定     | icon + **peek label** (推奨外、相談事項 D) | 同上                                             | 同上                                           |

**挙動**:

- 外枠は `rounded-full` pill + `border` を維持
- active タブだけラベルが見える → ユーザーが選択中の位置を一目で把握
- inactive は icon-only でコンパクト → 他タブの存在が邪魔しない
- 選択時: 選択されたタブが展開し、隣接 inactive は width 固定 (squeeze せず、単に active が成長)
- タブ切替: 150-200ms ease-out で width animate

**採用トークン案**:

- 非選択背景: transparent (外枠 border のみ)
- active 背景: `bg-primary-state-selected` (既存、Mobile BottomTabBar と揃う) or 新 `bg-muted` 強化
- active text: `text-primary` + `font-medium`
- inactive text: `text-muted-foreground`
- inactive hover: `bg-state-hover` + `text-foreground`

→ **相談事項 B**: active 背景を Mobile と揃える (`bg-primary-state-selected`) か、Desktop 独自 (`bg-muted` 強化) にするか

### 2.2 BottomTabBar v2 (Mobile)

**方針**: 現行 M3 pill-icon を基本維持。Desktop v2 と「デザイン言語が揃う」感を出すための調整項目のみ:

| 項目              | 現状                           | v2 案                                       |
| ----------------- | ------------------------------ | ------------------------------------------- |
| active アイコン   | `strokeWidth={2.5}`            | 維持                                        |
| active pill       | `bg-primary-state-selected`    | 維持 (Desktop と同トークン)                 |
| active ラベル     | `font-medium` / `text-primary` | 維持                                        |
| inactive アイコン | `strokeWidth={1.5}`            | 維持                                        |
| inactive ラベル   | `text-muted-foreground`        | 維持                                        |
| タブ間配分        | `flex-1` 4 等分                | 維持 (Apple HIG 44x44 確保済)               |
| transition        | `transition-colors`            | pill 背景の fade-in を明示 (`duration-150`) |

**v2 追加要素**:

- amber バッジ (§4 参照) — AI タブの icon 右上に配置
- tap 時のフィードバック (`active:scale-[0.98]` or `active:bg-state-pressed`) — 触覚フィードバック相当

### 2.3 Sidebar 外殻の洗練

| 項目             | 現状                        | v2 案                                                          |
| ---------------- | --------------------------- | -------------------------------------------------------------- |
| Header 高さ      | `h-12` (48px)               | 維持                                                           |
| Content gap      | `gap-4` (16px)              | 維持 (セクション間 16px)                                       |
| セクション見出し | feature ごとにばらつき      | `text-muted-foreground text-xs uppercase tracking-wide` に統一 |
| Footer           | `py-2`                      | 維持                                                           |
| Utilities 配置   | footer actions にテーマ切替 | 維持 (他タスクで対応済)                                        |

**統一対象のセクション見出し** (3 箇所):

- `CalendarSidebar` の各セクション (Mini Calendar 見出し / Tag filter 見出し)
- `StatsSidebar` の Mini Calendar 見出し
- `AiSidebar` の「予定」見出し (`src/app/[locale]/(app)/_shell/AiSidebar.tsx` 既に `text-muted-foreground text-xs uppercase`)

→ 既に AiSidebar は想定形。Calendar / Stats の見出しを揃える作業。

### 2.4 hover / focus / transition の統一

| 要素               | 統一値                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| 通常 hover         | `transition-colors duration-150`                                           |
| width 変化を含む   | `transition-all duration-200`                                              |
| focus-visible ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| reduced-motion     | `motion-reduce:transition-none` を適用                                     |

`.claude/rules/design-system.md` の transition 規約に準拠 (`duration-75/150/200/300` の 4 つのみ)。

---

## 3. CSS / アニメーション実装方針

### 3.1 Tailwind utilities のみで完結するか

**判定**: 完結する。framer-motion 等のライブラリは不要。

理由:

- PageNav の width animation は `transition-[width,padding]` + 条件クラスで実現可能
- ラベルの出現/消失は `opacity` + `max-w` の組み合わせで `transition-all` に乗る
- BottomTabBar の active pill fade は現行と同じ `transition-colors`
- reduced-motion は Tailwind v4 の `motion-reduce:*` variant で対応

→ **相談事項 E**: framer-motion 導入の要否 (§12)

### 3.2 アニメーション実装パターン

**PageNav の expanding tab**:

```tsx
<Link
  className={cn(
    'flex h-8 items-center justify-center transition-all duration-200 motion-reduce:transition-none',
    activePage === 'calendar'
      ? 'bg-primary-state-selected text-primary gap-2 px-4 font-medium'
      : 'text-muted-foreground hover:bg-state-hover w-8',
  )}
>
  <CalendarDays className="size-4 shrink-0" />
  <span
    className={cn(
      'overflow-hidden whitespace-nowrap transition-all duration-200 motion-reduce:transition-none',
      activePage === 'calendar' ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0',
    )}
  >
    {t('calendar')}
  </span>
</Link>
```

**ポイント**:

- active: 幅 auto / `px-4` / `gap-2` / ラベル `max-w-[120px] opacity-100`
- inactive: `w-8` 固定 / ラベル `max-w-0 opacity-0`
- 任意値 `max-w-[120px]` は design-tokens の禁止事項に抵触する可能性 → `max-w-xs` (20rem=320px) 等の Tailwind デフォルトで代替検討

→ **相談事項 F**: `max-w-[120px]` の扱い (§12)

### 3.3 focus-visible 対応

```tsx
<Link
  className={cn(
    'focus-visible:ring-ring focus-visible:ring-offset-background rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
    // ...
  )}
/>
```

Tab キーで順番に focus 移動できること / ring が視認できることを Storybook interactions で検証。

### 3.4 reduced-motion 対応

`prefers-reduced-motion: reduce` 環境では transition を無効化:

- Tailwind の `motion-reduce:transition-none` variant を全 animation 要素に付与
- active/inactive の状態遷移は瞬時切替 (色変化も含めて)

---

## 4. amber バッジ設計

### 4.1 技術設計

**Prop 追加**:

```tsx
interface PageNavProps {
  activePage: 'calendar' | 'stats' | 'ai';
  calendarHref: string;
  statsHref: string;
  aiHref: string;
  aiBadge?: 'new' | 'beta' | null; // ← 新規
  className?: string;
}
```

BottomTabBar 側の tabs array に `badge?: 'new' | 'beta'` フィールド追加。

**バッジ component** (新規 / `src/lib/components/shell/sidebar/NavBadge.tsx`):

```tsx
export function NavBadge({ variant = 'new' }: { variant?: 'new' | 'beta' }) {
  const t = useTranslations('sidebar.navBadge');
  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 inline-flex h-4 items-center justify-center rounded-full px-1',
        'bg-warning text-warning-foreground text-[10px] leading-none font-medium',
      )}
      aria-label={t(variant)}
    >
      {t(variant)}
    </span>
  );
}
```

**i18n**:

```json
// messages/ja/sidebar.json
{
  "navBadge": { "new": "NEW", "beta": "β" }
}
// messages/en/sidebar.json
{
  "navBadge": { "new": "NEW", "beta": "Beta" }
}
```

### 4.2 token 判断

`bg-warning` (既存: oklch(0.55 0.16 70) = amber) を流用する。

- 利点: 既存トークンで済む / dark mode 自動対応済
- 注意: warning の本来用途 (validation warning) と混ざる可能性 → コンテキストで区別 (nav 配下は "new feature" 意味に限定)

→ **代替案**: 新 `--accent-new` を導入 (oklch(0.65 0.18 70) 相当)
→ **相談事項 C**: warning 転用 vs 新トークンの判断 (§12)

### 4.3 表示条件

3 つの選択肢:

| Option | 表示条件                   | 実装                                              |
| ------ | -------------------------- | ------------------------------------------------- |
| α      | launch 後 30 日間          | launch 日付を constants に記録、`new Date()` 比較 |
| β      | Watching AI 本実装まで恒久 | hard-code `aiBadge="beta"` (β 表記)               |
| γ      | 常時表示                   | hard-code `aiBadge="new"` (NEW 表記)              |

**推奨**: Option β (β 表記で stub/WIP を暗示)

理由:

- Phase 2-C Step C-3 で AI を stub (Watching AI placeholder) として実装した経緯と整合
- launch 後 30 日の時限実装は「30 日後に消したか確認する」運用コストを伴う
- 常時 NEW は launch から時間が経つと陳腐化

→ **相談事項 D**: 表示条件の選択 (§12)

### 4.4 i18n 対応

- `new` / `beta` は locale 別にローカライズ
- 英語: "NEW" / "Beta"
- 日本語: "NEW" / "β" (カタカナ表記ではなく英字/記号が視覚的に効く)

### 4.5 aria-label

`aria-label={t(variant)}` で screen reader に announce。

---

## 5. Desktop / Mobile の統合判断

### 5.1 Desktop PageNav と Mobile BottomTabBar の関係

Phase 2-C 時点で両者は別実装 (DOM / style が独立)。v2 デザインでも**別実装を維持する**。

理由:

- Desktop: horizontal segmented control (3 タブ / sidebar 内)
- Mobile: vertical stack with labels below icons (4 タブ / bottom fixed)
- 共通化すると props / conditional render で複雑化
- デザイン言語の統一は「トークン共有」で担保 (active 背景 / icon stroke / transition duration)

### 5.2 共有すべきトークン

| トークン                        | Desktop        | Mobile                 |
| ------------------------------- | -------------- | ---------------------- |
| `bg-primary-state-selected`     | active 背景    | active pill 背景       |
| `text-primary`                  | active text    | active text            |
| `text-muted-foreground`         | inactive text  | inactive text          |
| `bg-state-hover`                | inactive hover | (Mobile は hover なし) |
| `duration-150` / `duration-200` | transition     | transition             |

### 5.3 Mobile 側で選択時にラベル展開するか

**判定**: **しない**。

理由:

- Mobile は 4 タブ / 画面幅制約。ラベル展開で隣接 squeeze すると「押しにくい領域」が出る
- 現行 M3 pill-icon は完成度が高く、v2 で壊す必要がない
- Apple HIG / Material Design 両方の bottom navigation ガイドと整合

---

## 6. Step 分割と blast radius

### 6.1 Step 一覧

Phase 2-B / 2-C の Step 分割パターンを踏襲 (6-8 Step / 6-7 コミット)。

| Step | 内容                                            | 触るファイル                                                | blast radius | 状態                      |
| ---- | ----------------------------------------------- | ----------------------------------------------------------- | ------------ | ------------------------- |
| D-0  | mock コミット + 方針最終確定                    | `docs/design/mocks/*` / `phase-2-d-detail.md` 更新          | 小 (docs)    | **skip (2026-04-23)**     |
| D-1  | design-tokens 整備 (必要なトークン追加)         | `colors.css` / `states.css` 等                              | 中           | **skip 候補** (§6.3 参照) |
| D-2  | PageNav v2 基本実装 (expanding tab)             | `PageNav.tsx` / `PageNav.stories.tsx`                       | 中           | 実行                      |
| D-3  | PageNav の squeeze / transition 洗練            | `PageNav.tsx` / stories 拡張                                | 小           | 実行                      |
| D-4  | BottomTabBar v2 調整 (共有トークン統合)         | `BottomTabBar.tsx` / stories                                | 小           | 実行                      |
| D-5  | amber バッジ実装 (`NavBadge.tsx` + 両 nav 統合) | `NavBadge.tsx` 新規 / PageNav / BottomTabBar / i18n         | 中           | 実行                      |
| D-6  | Sidebar セクション見出し統一                    | `CalendarSidebar.tsx` / `StatsSidebar.tsx` / 関連 component | 小           | 実行                      |
| D-7  | Storybook バリアント拡張 (hover / transition)   | PageNav / BottomTabBar / NavBadge stories                   | 小           | 実行                      |

**当初想定**: 7 Step / 7 コミット。
**D-0 skip 後**: 実質 6 Step / 6 コミット (2026-04-23 確定)。
**D-1 も skip された場合**: 実質 5 Step / 5 コミット (§6.3 で評価)。

### 6.2 blast radius の根拠

- D-1 (tokens): 色変更の波及。失敗すると全画面に影響
- D-2 (PageNav 基本): DOM 構造 + class 構成変更。PageNav.stories の regression 必須
- D-5 (badge): 新規 component + 既存 2 nav への統合 + i18n。i18n 漏れで MISSING_MESSAGE crash リスク

### 6.3 D-1 skip 可能性評価 (2026-04-23 追記)

相談事項 B / C が確定したことで Step D-1 (design-tokens 整備) の必要性を再評価:

| 相談事項 | 確定内容                                                     | トークン追加要否 |
| -------- | ------------------------------------------------------------ | ---------------- |
| B        | Option α: active 背景に既存 `bg-primary-state-selected` 共有 | **不要** (既存)  |
| C        | Option α: amber バッジに既存 `bg-warning` を転用             | **不要** (既存)  |

**判定**: Step D-1 は **skip 可能**。既存トークンのみで §2 目標仕様は実現できる。

**前提となる保留検証項目**:

- `bg-warning` (oklch(0.55 0.16 70)) の dark mode コントラストが NavBadge 用途で WCAG AA を満たすか → Step D-5 実装時に Storybook dark theme で確認。不足時のみ D-1 相当のトークン調整を差し込む
- `bg-primary-state-selected` が PageNav active 背景として Desktop 視覚的に十分な強度か → Step D-2 実装時に確認。不足時のみトークン強化

**結論**: D-1 は先行実施せず、**D-5 / D-2 で問題が顕在化した場合のみ途中挿入**する conditional step として扱う。通常パスでは Phase 2-D = **5 Step / 5 コミット** で完了。

### 6.4 統合 or 細分の判断

D-2 / D-3 は統合案 (= 1 Step) も検討したが分離する:

- D-2: 「active/inactive の視覚差が出る」最小実装。ここで Tomoya の視覚確認を受ける
- D-3: squeeze / transition 洗練。視覚判断を経て polish

→ D-2 完了時点で「v2 の方向性が合っているか」を確認できる分岐点になる。

---

## 7. 各 Step 詳細設計

### 7.1 Step D-0: mock コミット + 方針最終確定 【skip】

**【skip】mock 不要で進める方針確定により本 Step はスキップ (2026-04-23 確定)**。Phase 2-D は Step D-1 から開始 (さらに D-1 も相談事項 B/C の確定で skip 可能、§6.3 参照)。

§0.1 の通り、mock HTML は Tomoya の手元になく、本書 §2 の文章記述を基準に iterative に進める。相談事項 A-I の回答は §12 の confirmation ブロックで確定済。

### 7.2 Step D-1: design-tokens 整備

**目的**: amber バッジ用トークン or PageNav active 強化用トークンを準備。

**作業 (相談事項回答次第で分岐)**:

- 相談事項 B で「active 背景を Desktop 独自」選択 → `--muted-strong` 新設 or 既存 `--primary-state-selected` 転用
- 相談事項 C で「新 amber トークン」選択 → `--accent-new` + `--accent-new-foreground` 追加 (light / dark 両対応)
- 両方とも「既存転用」選択 → Step 自体不要 (skip)

**触るファイル**: `src/lib/styles/tokens/colors.css` / `src/lib/styles/tokens/states.css` (必要に応じ)

**ゲート**: `npm run lint:tokens` pass / Storybook tokens.stories で視覚確認。

**コミット**: `feat(tokens): phase 2-d v2 デザイン用トークンを追加` (skip 時はコミットなし)

### 7.3 Step D-2: PageNav v2 基本実装

**目的**: expanding tab の active/inactive 視覚差を実装。

**作業**:

1. `PageNav.tsx` の 3 タブ全てを §3.2 のパターンに書き換え
2. active: `gap-2 px-4 bg-primary-state-selected text-primary font-medium` + ラベル表示
3. inactive: `w-8 justify-center text-muted-foreground hover:bg-state-hover` + ラベル hidden
4. `transition-all duration-200 motion-reduce:transition-none` 付与
5. `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` 付与
6. `PageNav.stories.tsx` の既存バリアント (CalendarActive / StatsActive / AiActive / AllPatterns) 確認
7. DOM 構造不変 (`<nav>` + 3 `<Link>`) なので既存 test / E2E (aria-current / href 属性検証) に影響なし

**触るファイル**:

- `src/lib/components/shell/sidebar/PageNav.tsx`
- `src/lib/components/shell/sidebar/PageNav.stories.tsx` (MockPageNav の className 同期)

**ゲート**:

- typecheck / lint pass
- Storybook で 3 バリアント視覚確認 (Tomoya)
- E2E mode-switching.spec.ts / deep-link.spec.ts / sidebar-persistence.spec.ts 既存 pass

**コミット**: `feat(navigation): pagenav v2 の expanding tab を実装`

### 7.4 Step D-3: PageNav squeeze / transition 洗練

**目的**: 切替時の width animation を polish。

**作業**:

1. `transition-all duration-200` の timing 微調整 (Tomoya 視覚判断)
2. ease function の検討 (Tailwind デフォルト ease-in-out で不足なら `ease-out` 指定)
3. hover 時 label peek の是非判断 (相談事項 D の回答次第)
4. Storybook に hover 状態バリアント追加 (interactions / play function)

**触るファイル**: `PageNav.tsx` / `PageNav.stories.tsx`

**ゲート**: Storybook interactions で hover/focus/transition 視覚確認。

**コミット**: `feat(navigation): pagenav の transition を調整`

### 7.5 Step D-4: BottomTabBar v2 調整

**目的**: Desktop と同トークンに揃える + transition 明示。

**作業**:

1. active pill `bg-primary-state-selected` は既存維持 (Desktop と共有)
2. `transition-colors duration-150 motion-reduce:transition-none` を明示的に付与
3. `active:scale-[0.98]` タップフィードバック検討 (相談事項 G)
4. DOM 構造 / test セレクタ不変を確認

**触るファイル**:

- `src/app/[locale]/(app)/_shell/BottomTabBar.tsx`
- `src/app/[locale]/(app)/_shell/BottomTabBar.stories.tsx`
- `src/app/[locale]/(app)/_shell/BottomTabBar.test.tsx` (link セレクタ / aria-current が機能することを確認)

**ゲート**: test / Storybook pass / mobile-navigation.spec.ts pass。

**コミット**: `feat(navigation): bottomtabbar v2 の transition を統一`

### 7.6 Step D-5: amber バッジ実装

**目的**: AI タブに β バッジ (or NEW) を配置。

**作業**:

1. `src/lib/components/shell/sidebar/NavBadge.tsx` 新規作成
2. `messages/ja/sidebar.json` / `messages/en/sidebar.json` に `navBadge.new` / `navBadge.beta` 追加
3. `PageNav.tsx` に `aiBadge` prop 追加 + AI Link の icon 右上に `<NavBadge />` 配置
4. `BottomTabBar.tsx` の tabs array に `badge` フィールド追加 + AI の span に `<NavBadge />` 配置
5. `SidebarPageNav.tsx` で `aiBadge="beta"` 固定渡し (相談事項 D の回答次第)
6. `NavBadge.stories.tsx` 新規 (new / beta バリアント)

**触るファイル** (7 ファイル想定):

- `src/lib/components/shell/sidebar/NavBadge.tsx` (新規)
- `src/lib/components/shell/sidebar/NavBadge.stories.tsx` (新規)
- `src/lib/components/shell/sidebar/index.ts` (barrel に NavBadge 追加)
- `src/lib/components/shell/sidebar/PageNav.tsx`
- `src/lib/components/shell/sidebar/PageNav.stories.tsx`
- `src/app/[locale]/(app)/_shell/SidebarPageNav.tsx`
- `src/app/[locale]/(app)/_shell/BottomTabBar.tsx`
- `src/app/[locale]/(app)/_shell/BottomTabBar.stories.tsx`
- `messages/ja/sidebar.json`
- `messages/en/sidebar.json`

**ゲート**:

- `npm run lint:i18n` pass
- typecheck / lint pass
- Storybook で NavBadge の position (right-top corner) / contrast (WCAG AA) 視覚確認
- mobile-navigation.spec.ts / mode-switching.spec.ts の aiLink セレクタが影響を受けないこと

**コミット**: `feat(navigation): ai タブに β バッジを追加`

### 7.7 Step D-6: Sidebar セクション見出し統一

**目的**: CalendarSidebar / StatsSidebar の見出しスタイルを AiSidebar と揃える。

**作業**:

1. `CalendarSidebar.tsx` のセクション見出し (Tag filter 等) を `text-muted-foreground text-xs uppercase tracking-wide` に統一
2. `StatsSidebar.tsx` 同様
3. feature 内 component (例: `TagFlatList` の見出し) も同トークンに揃える

**触るファイル** (想定):

- `src/app/[locale]/(app)/_shell/CalendarSidebar.tsx`
- `src/app/[locale]/(app)/_shell/StatsSidebar.tsx`
- 関連 feature component (調査 Step 実施時に確定)

**ゲート**: Storybook で 3 モード sidebar 比較 (CalendarSidebar / StatsSidebar / AiSidebar が一貫)。

**コミット**: `refactor(sidebar): セクション見出しのスタイルを統一`

### 7.8 Step D-7: Storybook バリアント拡張

**目的**: hover / transition / badge の視覚的 regression guard を追加。

**作業**:

1. `PageNav.stories.tsx` に `WithHover` / `WithTransition` / `WithBadge` バリアント追加 (play function or decorator)
2. `BottomTabBar.stories.tsx` に `WithBadge` / `ActiveTransition` バリアント追加
3. `NavBadge.stories.tsx` に `NewVariant` / `BetaVariant` / `DarkMode` バリアント追加

**触るファイル**: stories のみ。実装コード変更なし。

**ゲート**: `npm run storybook` で全 stories 描画確認。

**コミット**: `test(storybook): pagenav / bottomtabbar の v2 バリアントを追加`

---

## 8. Storybook / test / E2E 影響

### 8.1 既存 test の影響

- `BottomTabBar.test.tsx` (Phase 2-B で link セレクタ化済): CSS 変更のみで DOM 不変 → 影響なし
- `navigation-paths.test.ts` (Phase 2-C Step C-2 追加 / 18 tests): 対象外 (CSS 変更なし)

### 8.2 既存 E2E spec の影響

4 spec (Phase 2-C Step C-6 で整備) 全て click / aria-current / href 検証のみ → **CSS 変更の影響なし**:

- `mode-switching.spec.ts` — click + URL + aria-current
- `deep-link.spec.ts` — direct access + aria-current
- `sidebar-persistence.spec.ts` — navigation + URL preservation
- `mobile-navigation.spec.ts` — link selector + href + aria-current

### 8.3 Storybook の影響

- `PageNav.stories.tsx` (Phase 2-C Step C-5 で Phase 2-B Step 2 後追い修正済): Mock 実装を v2 同期する必要あり
- `BottomTabBar.stories.tsx`: 現行 Mock を v2 同期
- 新規 `NavBadge.stories.tsx` (Step D-5)
- `AiSidebar.stories.tsx` (Phase 2-C Step C-6 追加): 影響なし

### 8.4 Hidden regression の予防

Phase 2-B Step 3 の `mobile-navigation.spec.ts` silent skip 事故 / Phase 2-C Step C-5 の `PageNav.stories` tablist 遺産事故の教訓:

- Step D-2 完了時点で Storybook + test + E2E を全て走らせる
- mock.stories の class を実装側と grep で一致確認 (`getByRole('link')` セレクタ生存)
- `rules/architecture.md` の namespace / store grep checklist を D-5 i18n 追加時に参照

---

## 9. 手動確認シナリオ

### 9.1 視覚的一貫性

各 Step 完了時に以下を Tomoya が確認:

1. **Light / Dark 両テーマ**: 全 component が両モードで色コントラスト (WCAG AA = 4.5:1) を満たす
2. **ja / en 両 locale**: ラベル長の差 (例: ja "カレンダー" vs en "Calendar") でレイアウトが破綻しない
3. **Desktop / Mobile 両 viewport**: `375px` (iPhone SE) / `768px` (tablet) / `1440px` (desktop) で崩れない
4. **3 モード sidebar 切替**: Calendar → Stats → AI → Calendar で見出しスタイル一貫

### 9.2 インタラクション

1. **hover**: PageNav inactive タブ / BottomTabBar inactive タブ で color / bg 変化
2. **focus**: Tab キー順番移動 / ring 可視
3. **active click**: タブ切替時の width animation / pill fade
4. **reduced-motion**: macOS システム設定 "視覚効果を減らす" ON で transition 無効化
5. **keyboard navigation**: Tab / Enter / Space で全タブ到達・選択可能

### 9.3 レスポンシブ / a11y

1. **a11y-tree**: `role="navigation"` / `aria-label` / `aria-current="page"` が全パスで正しい
2. **amber badge aria**: screen reader で "β" / "NEW" が announce される
3. **touch target**: Mobile tab の `min-h-11` (44px) 確保

### 9.4 手動確認チェックリスト (Step D-2 完了時)

Step D-2 は「v2 方向性の分岐点」なので詳細チェック:

- [ ] Calendar タブ active: icon + label 展開、`bg-primary-state-selected`
- [ ] Calendar タブ inactive (Stats active 時): icon のみ、`w-8` 固定
- [ ] タブ切替時の width animation: 150-200ms
- [ ] hover 時: inactive タブに `bg-state-hover`
- [ ] focus-visible: Tab キーで ring 表示
- [ ] ja / en でラベル幅変化が PageNav 全体 width に影響しない
- [ ] Dark mode: active/inactive 視覚差維持
- [ ] reduced-motion: animation 無効

---

## 10. ロールバック戦略

### 10.1 Step 単独 revert

CSS 変更が主軸なので各 Step の `git revert` は安全:

- D-0 (docs): revert で mock 削除のみ、機能影響なし
- D-1 (tokens): 他 Step が依存している可能性 → D-5 / D-2 を revert してから
- D-2 (PageNav 基本): 単独 revert 可。ただし D-3 / D-5 (PageNav 変更) との競合に注意
- D-3 (transition 洗練): 単独 revert 可
- D-4 (BottomTabBar): 単独 revert 可
- D-5 (amber badge): 7 ファイル変更のため revert で全ての追加が消える。i18n key も消える
- D-6 (Sidebar 見出し): 単独 revert 可
- D-7 (stories): stories のみ、revert 完全安全

### 10.2 部分ロールバック

ある Step で Tomoya の視覚判断が NG の場合:

- 同じ Step 内で再調整 (推奨) — 視覚デザインは 1 発で決まらない前提
- 違和感が大きければ Step 全体を revert → 再設計

### 10.3 最悪ケース

v2 デザイン方針自体が NG と判明 → Phase 2-D 全体を revert (7 コミット)。`main` は Phase 2-C 完了時点 (`70ef2ed51`) に戻る。

---

## 11. リスクと対策

| #   | リスク                                      | 対策                                                                       | 検証                          |
| --- | ------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| R1  | mock 未コミットで方向性が発散               | Step D-0 で先にコミット (§0 Option α)                                      | mock 存在確認                 |
| R2  | 視覚デザインの主観性                        | Step ごとに Tomoya 視覚確認 gate / Storybook で比較                        | Step 手動確認                 |
| R3  | scope creep (改善が際限ない)                | §2 目標デザイン仕様を固定基準に / 逸脱は Phase 2-F 以降に deferred         | 設計書参照                    |
| R4  | animation 過剰化                            | `duration-150/200` のみ使用 / reduced-motion 対応 / framer-motion 不採用   | 手動 motion-reduce 確認       |
| R5  | amber badge の訴求過剰                      | β 表記 (Option β) で WIP を暗示 / launch 日時限 (Option α) は不採用        | UX 判断                       |
| R6  | i18n 漏れで MISSING_MESSAGE crash           | Step D-5 で `lint:i18n` + 両 locale grep (rules/architecture.md の事故例)  | `lint:i18n` pass              |
| R7  | 既存 test / E2E の hidden regression        | 各 Step 完了時に `test:run` + `test:e2e:smoke` 実行                        | CI green                      |
| R8  | Mobile 4 タブで width 不足 (ラベル長)       | Mobile はラベル常時表示 / 現行 `flex-1` 維持 / en でも fit 確認            | Mobile viewport 手動確認      |
| R9  | dark mode で amber badge コントラスト不足   | Step D-1 で dark mode 用トークン調整 / contrast checker (WCAG AA)          | Storybook dark theme          |
| R10 | `max-w-[Xpx]` 任意値で lint:tokens エラー   | §3.2 の `max-w-[120px]` を Tailwind デフォルト (`max-w-xs` 等) に代替      | `lint:tokens` pass            |
| R11 | PageNav のラベル長による隣接 squeeze 副作用 | active は `w-auto` / inactive は `w-8` 固定 → 外枠 `rounded-full` で収まる | ja / en 両 locale 視覚確認    |
| R12 | focus-visible ring が pill 外枠を突き破る   | `rounded-full` + `ring-offset` で内側 ring に調整                          | Storybook keyboard navigation |

---

## 12. 相談事項 (ユーザー判断が必要)

v2 デザインの視覚判断 + 技術判断を含む 7 項目。実装着手前に全て回答を確定する。

### A. mock HTML/PNG の扱い (§0 blocker)

- α: mock HTML を `docs/design/mocks/phase-2-d-refined.html` にコミット (推奨)
- β: PNG スクリーンショットを `docs/design/mocks/*.png` にコミット
- γ: mock をコミットせず §2 文章記述のみを基準にする
- **私のデフォルト提案**: α (self-documenting / 再利用可能)
- **【確定】Option δ: mock 不要、§2 文章記述を基準に進める (2026-04-23、Tomoya 判断)**
  - mock HTML が Tomoya の手元にないため γ ベースで iterative に polish
  - Step D-2 完了時点が方向性分岐点 (§9.4)

### B. PageNav active 背景トークン (§2.1)

- α: `bg-primary-state-selected` (Mobile と共有)
- β: `bg-muted` 強化 (Desktop 独自、L=0.90 相当の新トークン)
- γ: 既存 `bg-muted` のまま維持 (差が弱いが追加トークンなし)
- **私のデフォルト提案**: α (デザイン言語統合 / 既存トークン)

### C. amber バッジのトークン (§4.2)

- α: 既存 `bg-warning` (oklch(0.55 0.16 70)) を転用
- β: 新 `--accent-new` トークン追加 (oklch(0.65 0.18 70) 相当)
- **私のデフォルト提案**: α (最小変更 / warning との意味的混同は nav 配下に限定されるため問題なし)

### D. amber バッジの表示条件 + 表記 (§4.3)

- α: launch 後 30 日間限定で "NEW" 表示
- β: Watching AI 本実装まで恒久で "β" 表示 (推奨)
- γ: 常時 "NEW" 表示
- **私のデフォルト提案**: β (Phase 2-C Step C-3 の stub/WIP 整合)

### E. hover 時の label peek (§2.1 / §7.4)

inactive タブを hover した時にラベルを peek 表示するか:

- α: peek あり (width 展開 → hover 中はラベル表示 → leave で折り畳み)
- β: peek なし (hover は `bg-state-hover` の色変化のみ / tooltip で代替)
- **私のデフォルト提案**: β (peek は 2 段階の hover interaction になりアニメーション過剰化 / tooltip 方式が a11y 的にも明確)

### F. `max-w-[120px]` の任意値扱い (§3.2)

- α: 任意値 `max-w-[120px]` を例外許可 (design-system.md の禁止に反する)
- β: Tailwind デフォルト `max-w-xs` (20rem=320px) で代替 (ラベル max 長は実質 "カレンダー"=5 文字 / "Calendar"=8 文字なので 320px は過剰だが害なし)
- γ: 新 spacing token `--max-w-nav-label` を定義して `max-w-nav-label` で使用
- **私のデフォルト提案**: β (最小変更 / design-system 準拠)

### G. framer-motion 導入 (§3.1)

- α: 導入する (PageNav の width animation を motion.div で制御)
- β: 導入しない、Tailwind utilities のみで完結
- **私のデフォルト提案**: β (依存追加不要 / bundle size 増加なし / §3.1 の pattern で十分)

### H. Mobile tap フィードバック (§7.5)

- α: `active:scale-[0.98]` タップ時の微小 scale
- β: `active:bg-state-pressed` 背景濃度変化のみ
- γ: 現状維持 (フィードバックなし)
- **私のデフォルト提案**: β (scale は任意値 + iOS Safari で跳ねる挙動 / 背景変化が安全)

### I. Step 分割の妥当性 (§6)

7 Step 分割案:

- 統合案: D-2 + D-3 を 1 Step にまとめる (合計 6 Step)
- 細分案: D-5 を「NavBadge component」「PageNav 統合」「BottomTabBar 統合」の 3 Step に分割 (合計 9 Step)
- **私のデフォルト提案**: 7 Step (現案 / Phase 2-B / 2-C のパターン踏襲)

---

## 13. Phase 2-D 完了後の残課題

Phase 2-D で扱わない課題の記録:

| #   | 課題                                                        | 保留理由                             | 将来タスク                 |
| --- | ----------------------------------------------------------- | ------------------------------------ | -------------------------- |
| F1  | Watching AI 本実装 (stub 解消)                              | 機能実装 / design 範囲外             | Phase 3 以降               |
| F2  | features/ai 新設 (`_composition/` から昇格)                 | Phase 2-D は視覚範囲のみ             | Watching AI 着手時         |
| F3  | AI threads 一覧 UI (現 stub)                                | 機能実装                             | Phase 3 以降               |
| F4  | Storybook visual regression CI (Chromatic 等)               | インフラ追加 / Phase 2-D の scope 外 | 別 Epic                    |
| F5  | Sidebar 内 feature component の v2 整備                     | feature 側の scope                   | feature 別タスク           |
| F6  | PageNav の tooltip 追加 (inactive hover 時)                 | 相談事項 E で peek 不採用時の代替    | Phase 2-D 延長 or 別タスク |
| F7  | reduced-motion 設定の page-wide サポート                    | Phase 2-D は nav 配下のみ対応        | 別 Epic                    |
| F8  | Portal 方式 Sidebar 外殻共通化 (sidebar-redesign-plan §4.3) | Phase 2-C Option Y で解消済 / 不要化 | (撤回)                     |

---

## Critical Files

- [src/lib/components/shell/sidebar/PageNav.tsx](../../../../src/lib/components/shell/sidebar/PageNav.tsx) — Step D-2 / D-3 / D-5 で変更
- [src/lib/components/shell/sidebar/PageNav.stories.tsx](../../../../src/lib/components/shell/sidebar/PageNav.stories.tsx) — Step D-2 / D-7 で変更
- [src/app/[locale]/(app)/\_shell/BottomTabBar.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.tsx>) — Step D-4 / D-5 で変更
- [src/app/[locale]/(app)/\_shell/BottomTabBar.stories.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.stories.tsx>) — Step D-4 / D-5 / D-7 で変更
- [src/lib/components/shell/sidebar/NavBadge.tsx](../../../../src/lib/components/shell/sidebar/NavBadge.tsx) — **新規** (Step D-5)
- [src/lib/components/shell/sidebar/NavBadge.stories.tsx](../../../../src/lib/components/shell/sidebar/NavBadge.stories.tsx) — **新規** (Step D-5)
- [src/lib/components/shell/sidebar/index.ts](../../../../src/lib/components/shell/sidebar/index.ts) — barrel 更新 (Step D-5)
- [src/app/[locale]/(app)/\_shell/SidebarPageNav.tsx](<../../../../src/app/[locale]/(app)/_shell/SidebarPageNav.tsx>) — `aiBadge` prop 渡し (Step D-5)
- [src/app/[locale]/(app)/\_shell/CalendarSidebar.tsx](<../../../../src/app/[locale]/(app)/_shell/CalendarSidebar.tsx>) — セクション見出し統一 (Step D-6)
- [src/app/[locale]/(app)/\_shell/StatsSidebar.tsx](<../../../../src/app/[locale]/(app)/_shell/StatsSidebar.tsx>) — セクション見出し統一 (Step D-6)
- [messages/ja/sidebar.json](../../messages/ja/sidebar.json) / [messages/en/sidebar.json](../../messages/en/sidebar.json) — `navBadge` namespace 追加 (Step D-5)
- [src/lib/styles/tokens/colors.css](../../../../src/lib/styles/tokens/colors.css) — amber トークン追加 (Step D-1、相談事項 C 次第)

## 推定作業量

| 作業                      | 想定時間 (実作業 only / 視覚判断時間は除く)   |
| ------------------------- | --------------------------------------------- |
| ~~Step D-0 (mock)~~       | **0m (skip / 2026-04-23 確定)**               |
| Step D-1 (tokens)         | **0m (skip 候補 / §6.3)** 条件付き挿入で +30m |
| Step D-2 (PageNav 基本)   | 1h (実装 + stories 同期)                      |
| Step D-3 (transition)     | 30m (polish)                                  |
| Step D-4 (BottomTabBar)   | 30m (調整のみ)                                |
| Step D-5 (badge)          | 1.5h (新規 component + 統合 + i18n)           |
| Step D-6 (見出し統一)     | 45m (feature 調査込み)                        |
| Step D-7 (stories)        | 45m (variant 追加)                            |
| **合計 (当初)**           | ~~**5.5h**~~                                  |
| **合計 (D-0 skip)**       | **5.25h** (D-0 の 15m を差し引き)             |
| **合計 (D-0 + D-1 skip)** | **5h** (通常パス想定)                         |

視覚判断時間 + Tomoya の確認 gate を含めると実 wall time は 1-2 日想定。

## 目標モックへの到達度想定

Step D-7 完了時点で:

- **完全到達**: PageNav expanding tab / BottomTabBar v2 / amber badge / Sidebar 見出し統一 / transition 統一 → 80-90%
- **未到達**: mock で特定された細部 (色味微調整 / animation timing / micro-interaction) → Tomoya の視覚判断で iterative に polish
- **deferred**: Watching AI 本実装 / feature component v2 → Phase 3 以降

mock と比較して 95% 以上の到達は Step D-7 後の polish iteration 1-2 回で達成見込み。

---

## 完了報告フォーマット

Phase 2-D 完了時に以下を報告:

1. 全 Step コミット一覧 (SHA / メッセージ / 変更ファイル数)
2. 変更規模: 新規 / 修正 / 削除ファイル数、追加・削除行数
3. mock との到達度 (Tomoya 視覚判断 %)
4. Phase 2-C 成果との整合性 (routing / 3 モード dispatch / 4 タブ不変)
5. Phase 2-E / Phase 3 への引継ぎ項目
6. 残課題候補 (§13 F1-F8 の update)
