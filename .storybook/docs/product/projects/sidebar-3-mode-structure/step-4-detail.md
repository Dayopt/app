# Phase 2-C Step C-4 詳細設計: BottomTabBar 4 タブ化

> **策定日**: 2026-04-23
> **Parent**: [overview.md](./overview.md) §6
> **前提**: Phase 2-C Step C-1 / C-2 / C-3 完了 (commit `a2c962f5e` / `e66c103fa` / `0c89531e3` / `972802e7f`)
> **Step**: 2-C-4 (未着手)
> **スコープ**: Mobile BottomTabBar を 3 → 4 タブに拡張 (AI 追加)

## Context

Step C-3 で `(modes)/ai/` route が実在になり、URL 直打ちで到達可能になった。Step C-4 で Mobile ユーザーに UI 経路を提供する。Phase 2-B Step 3 の Link 化基盤を活かして、tabs 配列に AI エントリを追加するだけの局所変更。

**影響範囲**: `_shell/BottomTabBar.tsx` と関連する test / storybook / i18n のみ。BottomTabBar を呼び出す `mobile-layout.tsx` は変更不要。

---

## 章立て

1. [現状の BottomTabBar 構造](#1-現状の-bottomtabbar-構造)
2. [AI タブ追加仕様](#2-ai-タブ追加仕様)
3. [getActiveTabFromPath の拡張](#3-getactivetabfrompath-の拡張)
4. [タブ幅と押しやすさの検証](#4-タブ幅と押しやすさの検証)
5. [test / storybook の更新](#5-test--storybook-の更新)
6. [getModeFromPath との関係整理](#6-getmodefrompath-との関係整理)
7. [手動確認シナリオ](#7-手動確認シナリオ)
8. [リスクと対策](#8-リスクと対策)
9. [Sub-step 分割の判断](#9-sub-step-分割の判断)
10. [相談事項](#10-相談事項-ユーザー判断が必要)

---

## 1. 現状の BottomTabBar 構造

**ファイル**: [src/app/[locale]/(app)/\_shell/BottomTabBar.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.tsx>) (151 行)

### 現状のタブ定義 (3 タブ)

| id         | ラベル (`t()` キー)             | アイコン              | href 生成                                        |
| ---------- | ------------------------------- | --------------------- | ------------------------------------------------ |
| `calendar` | `navigation.bottomTab.calendar` | `CalendarDays`        | `buildCalendarPath(...)` (動的、viewType + date) |
| `stats`    | `navigation.bottomTab.stats`    | `BarChart3`           | `buildStatsPath(...)` (動的、granularity + date) |
| `account`  | `navigation.bottomTab.account`  | `UserCircle` + Avatar | 静的 `/${locale}/settings`                       |

### 構造上の特徴

- **Phase 2-B Step 3 で Link 化済**: 全タブが `<Link prefetch aria-current>` (button からの移行完了)
- **動的 href**: `useMemo` + `buildCalendarPath` / `buildStatsPath` で calendar / stats の viewType / date 保持
- **Account タブは Avatar 表示**: 他タブはアイコンのみ、Account のみ `<Avatar>` (画像 or イニシャル fallback)
- **レイアウト**: `flex h-14 items-center justify-around` + 各タブ `flex-1` で均等配分
- **アイコン**: `size-5` (20px) + `strokeWidth={isActive ? 2.5 : 1.5}`
- **active 表示**: Pill 背景 (`bg-primary-state-selected`) + `text-primary` + font-medium
- **hidden**: `useHideOnScroll` で下スクロール時に `translateY` で退避

### 呼び出し側

- [src/app/[locale]/(app)/\_shell/mobile-layout.tsx:93](<../../../../src/app/[locale]/(app)/_shell/mobile-layout.tsx#L93>) のみ
- `<BottomTabBar hidden={hidden} />` 形式、props は `hidden` boolean のみ
- MainContentWrapper の `pb-16` で余白確保 (tab bar 高さ 56px ≤ 64px 余白)

---

## 2. AI タブ追加仕様

### 2.1 タブエントリ

| id   | ラベル (`t()` キー)              | アイコン | href                 |
| ---- | -------------------------------- | -------- | -------------------- |
| `ai` | `navigation.bottomTab.ai` (新規) | `Eye`    | 静的 `/${locale}/ai` |

### 2.2 ラベル

**推奨: "AI" (ja/en 共通の英字略称)**

| 候補                  | ja           | en       | 評価                                                                 |
| --------------------- | ------------ | -------- | -------------------------------------------------------------------- |
| **"AI"** (推奨)       | AI           | AI       | 最短 2 文字、4 タブ横幅の圧迫なし、言語共通で一貫性あり              |
| "Watching"            | Watching     | Watching | 英字 8 文字、Mobile で切れる可能性                                   |
| "ウォッチング" (カナ) | ウォッチング | Watching | 6 文字カナ、他タブ (2-4 文字漢字/カナ) より長い                      |
| "気づき"              | 気づき       | Insights | 機能名としては良いが現時点では AI の観察全体を指す広義の名が望ましい |

### 2.3 アイコン: `Eye` (確定)

- `IconConventions.mdx` L67-69 で Watching AI 用に予約済
- Step C-3 の Main empty state / 将来の PageNav でも Eye 使用 → 全面統一
- lucide-react から既存 import を BottomTabBar.tsx に追加するだけ

### 2.4 配置順

**推奨: Calendar / Stats / AI / Account**

根拠:

1. **iOS / Material ガイド**: 関連タブをグループ化、最重要 → 左、設定系 → 右
2. **使用頻度順**: Calendar (最も頻繁) → Stats (分析) → AI (観察)、左 3 つは "時間の観察" グループ
3. **Account は右端慣例**: 多くのアプリで Account/Profile は右端 (ユーザー期待と整合)
4. **Step C-5 の PageNav 3 タブ配置との整合**: Desktop でも Calendar / Stats / AI で同順

### 2.5 href 生成

**静的 `/${locale}/ai` で十分**。

理由:

- AI モードには state (viewType / granularity / date 等) がない (Step C-3 で stub)
- 将来 Watching AI 本実装で state が入る場合は動的 href に変更するが、現時点では YAGNI
- `useMemo` 不要 (依存配列なし、string concatenation のみ)

### 2.6 i18n キー追加

`messages/{ja,en}/navigation.json` に `navigation.bottomTab.ai` 追加:

| locale | 値     |
| ------ | ------ |
| ja     | `"AI"` |
| en     | `"AI"` |

**注**: AI タブの active 判定用の aria-label 等で別キーが必要なら追加検討 (現状の実装では `label` のみで `<Link>` が自動で accessible name を持つため追加不要)。

---

## 3. getActiveTabFromPath の拡張

### 3.1 現状のロジック (L20-30)

```typescript
type TabId = 'calendar' | 'stats' | 'account';

function getActiveTabFromPath(pathname: string): TabId {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (pathWithoutLocale.startsWith('/settings')) return 'account';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return 'calendar';
}
```

### 3.2 拡張後

```typescript
type TabId = 'calendar' | 'stats' | 'ai' | 'account';

function getActiveTabFromPath(pathname: string): TabId {
  // locale prefix 除去処理は同じ
  if (pathWithoutLocale.startsWith('/settings')) return 'account';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  if (pathWithoutLocale.startsWith('/ai')) return 'ai'; // 新規
  return 'calendar';
}
```

### 3.3 判定順序の検証

**重要**: 判定順序は `/settings` → `/stats` → `/ai` → default (`/calendar`)。

- `/ai/threads/xxx` → `/ai` prefix match → `'ai'` ✓
- `/settings/ai` のような誤 match なし (Settings が先に match)
- `/stats/ai` のような pathname はプロダクトに存在しない (scope 問題なし)
- `startsWith` なので `/ai` 単体でも `/ai/threads/xxx` でも両方 match

### 3.4 unit test 追加候補

`navigation-paths.test.ts` は `_shell/` 配下の共通 util 用。`getActiveTabFromPath` は現状 BottomTabBar.tsx 内部関数なので、以下 2 択:

- **Option A (推奨)**: BottomTabBar.test.tsx 内で黒箱テスト (aria-current 属性で確認) → 既存パターン踏襲
- Option B: `getActiveTabFromPath` を navigation-paths.ts に抽出 + unit test → scope 拡大

**推奨: Option A**。既存テストに AI タブ active 確認ケース 1 つ追加するだけで済む。

---

## 4. タブ幅と押しやすさの検証

### 4.1 最小画面幅 (iPhone SE、375px) での試算

| 条件                 | 3 タブ (現状)   | 4 タブ (Step C-4 後)        |
| -------------------- | --------------- | --------------------------- |
| 1 タブ幅             | ~125px          | ~93px                       |
| アイコン幅           | 20px (`size-5`) | 20px                        |
| ラベル幅             | 可変 (text-xs)  | 可変 (text-xs)              |
| タッチターゲット最小 | 125 × 56px      | 93 × 56px (44px 要件満たす) |

### 4.2 ラベル切れの懸念検証

`text-xs` (12px) でのラベル表示幅試算:

| locale | ラベル     | 文字数 | おおよその幅 (px) |
| ------ | ---------- | ------ | ----------------- |
| ja     | カレンダー | 5      | ~60               |
| ja     | 統計       | 2      | ~24               |
| ja     | AI         | 2      | ~20               |
| ja     | アカウント | 5      | ~60               |
| en     | Calendar   | 8      | ~55               |
| en     | Stats      | 5      | ~35               |
| en     | AI         | 2      | ~15               |
| en     | Account    | 7      | ~50               |

**判定**: 最長ラベル (ja "カレンダー" / "アカウント" ~60px) でも 93px 幅に収まる。**tab bar 高さ h-14 維持で問題なし**。

### 4.3 tab bar 高さの判断

**推奨: h-14 (56px) 維持**。

- 4 タブでも押しやすさ (44x44px タッチターゲット) を満たす
- 既存レイアウトの `pb-16` (64px 余白) と整合
- iOS 標準 tab bar (49pt ≈ 49px) よりやや大きめだが良好な範囲
- 高さを変える変更は `mobile-layout.tsx` の `pb-16` も同時変更が必要で blast radius 増加 → 避ける

---

## 5. test / storybook の更新

### 5.1 BottomTabBar.test.tsx の更新

現状 3 test cases:

1. page navigation semantics (tablist でない、link で aria-current)
2. pathname 由来の active 判定 (stats で active)
3. calendar return URL の date 保持

**追加 test cases**: 4. AI タブが link として存在し href="/ja/ai" 5. `/ja/ai` pathname で AI タブが aria-current="page" 6. `/ja/ai/threads/xxx` でも AI タブが aria-current="page"

**変更範囲**: 既存 3 cases は AI タブ追加で行数が増えても動作不変。新規 3 cases を追加のみ。

### 5.2 BottomTabBar.stories.tsx の更新

**現状の issue 発見**: `MockBottomTabBar` は L43 で `<button>` を使用している。実装は Phase 2-B Step 3 で `<Link>` 化済みだが、**stories が Phase 2-B Step 3 更新漏れ** の状態。

Step C-4 で同時対応候補:

- **Option X (推奨)**: Step C-4 スコープ内で同時修正 (4 タブ化 + button → link 整合)
- Option Y: Step C-4 は AI タブ追加のみ、button → link は別タスク

**推奨: Option X**。Storybook の mock が実装から乖離していると将来の視覚 regression 検知が効かない。AI タブ追加と同コミットで整合性を戻す。追加作業量 ~5 分。

**追加するストーリーバリアント**:

- `AiActive`: AI タブが active

`AllPatterns` に AI Active パターンを追加。

### 5.3 mobile-navigation.spec.ts (E2E)

**Step C-4 では触らない**。E2E の 4 タブ対応は Step C-6 (E2E smoke 拡張) にまとめる。Step C-4 のゲートは test (unit) + Storybook + 手動確認。

---

## 6. getModeFromPath との関係整理

### 6.1 責務の違い

| 関数                   | 返り値                                       | 用途                              |
| ---------------------- | -------------------------------------------- | --------------------------------- |
| `getModeFromPath`      | `'calendar' \| 'stats' \| 'ai' \| 'other'`   | Sidebar dispatch (SidebarContent) |
| `getActiveTabFromPath` | `'calendar' \| 'stats' \| 'ai' \| 'account'` | BottomTab active state            |

**`other` と `account` の意味的違い**:

- `other` (Sidebar): "モード外" → CalendarSidebar fallback
- `account` (BottomTab): "Settings はタブ化されている" → Account タブ active

### 6.2 統合の可否検討

`getActiveTabFromPath` 内部で `getModeFromPath` を呼ぶ refactor は可能だが、

- `getModeFromPath` は `/settings` を `'other'` に分類、`getActiveTabFromPath` は `/settings` を `'account'` に分類
- 変換マップ (`'other' → 'account'` 等) を入れると認知負荷増加
- YAGNI: 2 関数とも 10 行程度、重複コストは小さい

**判断: 統合しない。現状の責務分離を維持**。

### 6.3 将来の余地

Phase 2-D 以降で navigation state の扱いが変わる時 (例: Sidebar の collapsed state を URL に持つ等) に再評価する。

---

## 7. 手動確認シナリオ

### 7.1 Mobile viewport での 4 タブ表示

- [ ] Mobile viewport (375px / 414px) で 4 タブが均等配分で表示
- [ ] アイコン (CalendarDays / BarChart3 / Eye / UserCircle+Avatar) がはっきり見える
- [ ] ラベル (カレンダー / 統計 / AI / アカウント) が切れない
- [ ] tab bar 高さ h-14 のまま縦方向もはみ出し / 余白過多なし
- [ ] iPhone SE (375px) でのレイアウト崩れなし

### 7.2 AI タブの動作

- [ ] AI タブ tap で `/ja/ai` に遷移
- [ ] 遷移後、AI タブが active (Pill 背景 + text-primary + aria-current)
- [ ] Calendar / Stats / Account タブは active 解除
- [ ] 遷移先の Sidebar は AiSidebar (Desktop view では) ※ Mobile では Sidebar 非表示

### 7.3 pathname 同期

- [ ] URL 直打ち `/ja/ai` → BottomTab で AI タブ active
- [ ] URL 直打ち `/ja/ai/threads/test123` → AI タブ active (prefix 判定)
- [ ] `/ja/settings` → Account タブ active (regression check)
- [ ] `/ja/calendar/day` → Calendar タブ active (regression check)
- [ ] `/ja/stats/review` → Stats タブ active (regression check)

### 7.4 Hidden 挙動の維持

- [ ] Mobile で下スクロール → BottomTabBar が auto-hide (translateY)
- [ ] 上スクロール or ページ遷移で再表示
- [ ] AI タブだけ挙動が違うなどの regression なし

### 7.5 Inspector と tab bar の z-index

- [ ] Calendar で Inspector 開く時に BottomTabBar の挙動が従来通り (AI タブ追加で z-index 衝突しない)

### 7.6 i18n

- [ ] ja / en 切替で全 4 タブのラベルが翻訳
- [ ] MISSING_MESSAGE エラーなし (新規 `navigation.bottomTab.ai` キーが ja/en 両方に存在)

---

## 8. リスクと対策

| #   | リスク                                                   | 対策                                                                                                             |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1  | タブ幅狭化で press ミスが増える                          | §4.1-4.2 で検証済、93px × 56px = 5208px² のタッチ領域確保。44x44px 要件満たす                                    |
| R2  | en "Calendar" (8 文字) が ja "カレンダー" より先に切れる | `text-xs` 12px × 8 文字 ≈ 55px、93px 幅で余裕あり。text-overflow: ellipsis なしだが問題域                        |
| R3  | `getActiveTabFromPath` で判定順序バグ                    | §3.3 で順序検証済、unit test 相当のケース (AI active) を test.tsx に追加                                         |
| R4  | `navigation.bottomTab.ai` キー追加忘れで MISSING_MESSAGE | ja / en 両方に追加、commit 前に grep 確認                                                                        |
| R5  | Storybook `MockBottomTabBar` が button のまま            | §5.2 で同時修正 (Option X)                                                                                       |
| R6  | Account の Avatar 表示と AI の Eye アイコンで視覚不揃い  | Account は従来通り Avatar (他タブとの差別化意図的)。AI は普通の Icon + pill 背景で既存 Calendar / Stats と同扱い |

---

## 9. Sub-step 分割の判断

**結論: 分割しない (1 Step / 1 commit)**。

理由:

- i18n 追加 + tab 追加 + test 追加 + storybook 修正が相互依存
- i18n キーなしで tab 追加すると MISSING_MESSAGE
- test なしで tab 追加すると regression 検知不能
- Storybook mock 修正を分けると同一コミットで整合性取れない
- 規模 ~50 行、blast radius は `_shell/BottomTabBar*` + `navigation.json × 2` に閉じる

---

## 10. 相談事項 (ユーザー判断が必要)

### 10-1. AI タブのラベル

- **a 推奨**: "AI" (ja/en 共通)
- b: "Watching" (英語のみ、ja はカナ表記 "ウォッチング")
- c: 他の候補

### 10-2. AI タブのアイコン

- **Eye (確定)**: IconConventions.mdx 予約済、Step C-3 と統一

### 10-3. タブ配置順

- **Calendar / Stats / AI / Account (推奨)**: iOS 慣例、Account 右端
- 代替: Calendar / AI / Stats / Account 等もあるが利点不明

### 10-4. tab bar 高さ

- **h-14 維持 (推奨)**: 4 タブでも十分、blast radius 小
- 代替: h-16 に上げる (mobile-layout の `pb-16` も同時変更必要)

### 10-5. Storybook MockBottomTabBar の button → link 修正

- **X 推奨**: Step C-4 で同時修正 (Phase 2-B Step 3 の更新漏れ整合)
- Y: 別タスクで対応

### 10-6. `getActiveTabFromPath` の unit test

- **A 推奨**: BottomTabBar.test.tsx 内で aria-current ベースの黒箱 test
- B: navigation-paths.ts に util 抽出して unit test (scope 拡大)

---

## Critical Files (Step C-4 スコープ)

### 変更

- [src/app/[locale]/(app)/\_shell/BottomTabBar.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.tsx>) — tabs 配列に AI エントリ追加、`TabId` 型拡張、`getActiveTabFromPath` に 'ai' case 追加、`Eye` import
- [src/app/[locale]/(app)/\_shell/BottomTabBar.test.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.test.tsx>) — AI タブの test case 追加 (3 件)
- [src/app/[locale]/(app)/\_shell/BottomTabBar.stories.tsx](<../../../../src/app/[locale]/(app)/_shell/BottomTabBar.stories.tsx>) — `AiActive` variant 追加 + `MockBottomTabBar` の `<button>` → `<a>` 相当整合
- [messages/ja/navigation.json](../../messages/ja/navigation.json) — `bottomTab.ai: "AI"` 追加
- [messages/en/navigation.json](../../messages/en/navigation.json) — `bottomTab.ai: "AI"` 追加

### 不変

- `mobile-layout.tsx` (BottomTabBar 呼び出し側、props 変更なし)
- `navigation-paths.ts` (`getActiveTabFromPath` は BottomTabBar 内部関数のまま)
- `getModeFromPath` (§6 で統合しない判断、Sidebar 側で独立維持)

---

## 推定作業量

| 工程                                                                     | 時間         |
| ------------------------------------------------------------------------ | ------------ |
| i18n キー追加 (ja/en × 1 キーずつ)                                       | 3 分         |
| `BottomTabBar.tsx`: tabs 配列 + TabId + getActiveTabFromPath 更新        | 10 分        |
| `BottomTabBar.test.tsx`: AI タブ test 3 件追加                           | 10 分        |
| `BottomTabBar.stories.tsx`: `MockBottomTabBar` link 化 + `AiActive` 追加 | 10 分        |
| typecheck / lint / lint:boundaries / build / test                        | 5 分         |
| 手動確認 (Mobile viewport + URL 遷移 + i18n)                             | 10 分        |
| path-limited add + `git diff --cached` + commit                          | 5 分         |
| **計**                                                                   | **約 50 分** |

---

## 次のアクション

1. 本設計書をレビュー
2. 相談事項 10-1 〜 10-6 のユーザー判断を確定
3. Step C-4 の実装プロンプトを詰める
