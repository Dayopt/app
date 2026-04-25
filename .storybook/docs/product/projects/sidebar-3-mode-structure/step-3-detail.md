# Phase 2-C Step C-3 詳細設計: AI モード stub 追加

> **策定日**: 2026-04-23
> **Parent**: [overview.md](./overview.md) §5
> **前提**: Phase 2-C Step C-1 + C-2 完了 (commit `a2c962f5e` / `e66c103fa` / `0c89531e3`)
> **Step**: 2-C-3 (未着手)
> **スコープ**: `(modes)/ai/` route 新設 + `AiSidebar` 充実 + i18n `ai` namespace 追加

## Context

overview.md §5 で決めた AI モード stub の品質水準に従い、実装前の詳細を固める。Step C-2 で `AiSidebar.tsx` を `_shell/` 配下に最小 stub として配置済。Step C-3 ではそれを 3 ブロック構成に充実させ、route (`(modes)/ai/`) を新設して URL 直打ちで到達可能にする。

**重要**: Step C-3 完了時点でも UI 経路 (BottomTabBar / PageNav) からの AI 到達は**できない** (Step C-4 / C-5 で追加)。手動確認は URL 直打ちのみ。

---

## 章立て

1. [現状確認と設計の出発点](#1-現状確認と設計の出発点)
2. [ディレクトリ構造 (Step C-3 完了後)](#2-ディレクトリ構造-step-c-3-完了後)
3. [配置方針: overview.md §5.1 からの修正](#3-配置方針-overviewmd-51-からの修正)
4. [i18n namespace 設計](#4-i18n-namespace-設計)
5. [AiSidebar の 3 ブロック構成](#5-aisidebar-の-3-ブロック構成)
6. [AI Main area の empty state](#6-ai-main-area-の-empty-state)
7. [threads/[threadId] stub の扱い](#7-threadsthreadid-stub-の扱い)
8. [feature-boundaries 影響](#8-feature-boundaries-影響)
9. [手動確認シナリオ](#9-手動確認シナリオ)
10. [Step 分割とリスク](#10-step-分割とリスク)
11. [相談事項](#11-相談事項-ユーザー判断が必要)

---

## 1. 現状確認と設計の出発点

### 調査で確定した事実

| 項目                                                                                           | 状態                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `(modes)/ai/` ディレクトリ                                                                     | **未作成**、`/ja/ai` は現在 404                              |
| `src/features/ai/`                                                                             | 未作成 (Phase 2-A §9 で「新設しない」確定)                   |
| `messages/{ja,en}/ai.json`                                                                     | 未作成                                                       |
| `APP_NAMESPACES` ([layout.tsx:32-46](<../../../../src/app/[locale]/(app)/layout.tsx#L32-L46>)) | 11 namespace 登録、`ai` 未登録                               |
| `_shell/AiSidebar.tsx`                                                                         | Step C-2 で最小 stub (11 行) 配置済、Step C-3 で書き換え対象 |
| `_shell/SidebarContent.tsx` dispatcher                                                         | 既に `'ai'` case を持つ (Step C-2 時点で先行投入済)          |
| `getModeFromPath('/ja/ai')`                                                                    | 既に `'ai'` を返す (unit test 済)                            |
| BottomTabBar / SidebarPageNav                                                                  | AI タブなし (Step C-4 / C-5 で追加)                          |

### 設計上の含意

- dispatcher と mode 判定は**既に AI 対応済**。Step C-3 は **route 実体 + content** のみに集中できる
- Step C-3 単体では UI 経路なし → URL 直打ち確認前提
- `src/features/ai/` 新設を誘惑されないよう、全ての AI 関連 component を `(modes)/ai/` と `_shell/` に閉じる

---

## 2. ディレクトリ構造 (Step C-3 完了後)

```
src/app/[locale]/(app)/
├── _shell/
│   ├── AiSidebar.tsx                    ★ Step C-2 stub を 3 ブロック構成に書き換え
│   ├── CalendarSidebar.tsx              (Step C-2 で作成済、不変)
│   ├── StatsSidebar.tsx                 (Step C-2 で作成済、不変)
│   └── SidebarContent.tsx               (Step C-2 で dispatcher 化済、不変)
├── layout.tsx                           ★ APP_NAMESPACES に 'ai' 追加
└── (modes)/
    ├── calendar/                        (Step C-1、不変)
    ├── stats/                           (Step C-1、不変)
    └── ai/                              ★ 新規 route
        ├── page.tsx                     AI モードトップ
        ├── _composition/
        │   └── AiMainContent.tsx        empty state (Eye + コピー)
        └── threads/
            └── [threadId]/
                └── page.tsx             master-detail の detail stub

messages/
├── ja/ai.json                           ★ 新規
└── en/ai.json                           ★ 新規
```

### 変更ファイル数

- **新規**: 6 (ja/en ai.json × 2 + (modes)/ai/page.tsx + AiMainContent.tsx + threads/[threadId]/page.tsx + ai/layout.tsx ※下記相談事項参照)
- **変更**: 2 (AiSidebar.tsx 書き換え + layout.tsx の APP_NAMESPACES)

---

## 3. 配置方針: overview.md §5.1 からの修正

parent plan ([overview.md §5.1](./overview.md#51-ディレクトリ構造)) では全 AI 関連 component を `(modes)/ai/_composition/` に置く想定だった。Step C-2 の実装で `AiSidebar` は `_shell/` に配置されたため、整合性を取る修正を反映する。

### 修正サマリ

| component                 | parent plan 想定                              | 実際の配置 (修正後)                                    | 理由                                                                                    |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `AiSidebar.tsx`           | `(modes)/ai/_composition/AiSidebar`           | **`_shell/AiSidebar.tsx`**                             | Option Y 下で SidebarContent dispatcher が `_shell/` から import する。同階層配置が自然 |
| `AiMainContent.tsx`       | `(modes)/ai/_composition/AiMainContent`       | 同 (変更なし)                                          | page.tsx が直接 import する Composition bridge                                          |
| `AiSoonList.tsx`          | `(modes)/ai/_composition/AiSoonList`          | **`_shell/AiSidebar.tsx` に inline**                   | Sidebar 専用の小さな list、独立ファイル化の利得小。YAGNI                                |
| `AiThreadPlaceholder.tsx` | `(modes)/ai/_composition/AiThreadPlaceholder` | **`(modes)/ai/threads/[threadId]/page.tsx` に inline** | 10 行以下の stub、独立ファイル不要                                                      |

### 修正根拠

- `_shell/` が Sidebar 関連 component の収容場所として既に確立 (`CalendarSidebar` / `StatsSidebar` / `SidebarPageNav` 等)
- `(modes)/ai/_composition/` は **Main area 関連のみ**に絞る (CalendarViewClient / StatsLayoutShell と同パターン)
- 小さな stub (Soon list / Thread placeholder) の独立ファイル化は可読性利得より認知負荷増加

---

## 4. i18n namespace 設計

### 4.1 方針

overview.md §8.1 の推奨に従い、**新規 namespace `ai` を作成**する。

理由:

1. `navigation.*` は既にタブラベル専用として機能 (`bottomTab.calendar` 等)。AI content は混同
2. Watching AI 本実装時にキーが大量追加される見込み → 独立 namespace で拡張性確保
3. 既存 namespace のサイズ肥大化を避ける

### 4.2 必要なキー一覧

**`messages/ja/ai.json`**:

```json
{
  "ai": {
    "sidebar": {
      "title": "Watching AI",
      "conversations": {
        "empty": "観察がここに並びます"
      },
      "soon": {
        "label": "予定",
        "weeklyReport": {
          "title": "週次レポート",
          "description": "今週の時間の使い方をまとめてお届けします"
        },
        "insights": {
          "title": "気づき",
          "description": "パターンから見つけた気づきを共有します"
        },
        "anomaly": {
          "title": "異常検知",
          "description": "いつもと違う兆しを静かにお知らせします"
        }
      }
    },
    "main": {
      "title": "Watching AI は準備中",
      "description": "あなたの時間の使い方を観察し、パターンを見つけて気づきをお届けします。"
    },
    "thread": {
      "placeholder": "このスレッドは準備中です"
    }
  }
}
```

**`messages/en/ai.json`**:

```json
{
  "ai": {
    "sidebar": {
      "title": "Watching AI",
      "conversations": {
        "empty": "Observations will appear here"
      },
      "soon": {
        "label": "Coming up",
        "weeklyReport": {
          "title": "Weekly report",
          "description": "Summarizes how you spent time this week"
        },
        "insights": {
          "title": "Insights",
          "description": "Shares patterns it notices"
        },
        "anomaly": {
          "title": "Anomaly detection",
          "description": "Quietly flags what looks different"
        }
      }
    },
    "main": {
      "title": "Watching AI is coming",
      "description": "Observes how you spend time, finds patterns, and shares what it notices."
    },
    "thread": {
      "placeholder": "This thread is coming soon"
    }
  }
}
```

### 4.3 copywriting.md 準拠チェック

| 基準                          | 判定 | 備考                                                                   |
| ----------------------------- | ---- | ---------------------------------------------------------------------- |
| 研究者トーン (淡々とした宣言) | ✅   | "〜します" / "Observes" / "Shares"                                     |
| 感嘆符なし                    | ✅   | 全キー確認                                                             |
| 煽りなし                      | ✅   | CTA なし、"絶対" / "最強" 等なし                                       |
| Pre-suasion (可能性を先に)    | ✅   | "Watching AI は準備中" は欠如 + "準備" で次を示唆                      |
| 「地図」メタファー            | ⚠️   | Main description には無理に入れない判断 (観察・パターン・気づきで十分) |

### 4.4 `APP_NAMESPACES` への追加

[src/app/[locale]/(app)/layout.tsx:32-46](<../../../../src/app/[locale]/(app)/layout.tsx#L32-L46>) の配列に `'ai'` を追加。

```typescript
const APP_NAMESPACES = [
  'badges',
  'common',
  'calendar',
  'entry',
  'plan',
  'record',
  'tags',
  'navigation',
  'settings',
  'sidebar',
  'error',
  'contact',
  'tour',
  'ai', // 新規
];
```

**grep チェック** (architecture.md の i18n 事故例回避):

```bash
grep -rnE "useTranslations\(['\"]ai['\"]|getTranslations\(['\"]ai['\"]" src .storybook
```

実装後、上記が AiSidebar / AiMainContent / page.tsx 等から参照されていることを確認。

---

## 5. AiSidebar の 3 ブロック構成

### 5.1 構造

```tsx
// _shell/AiSidebar.tsx の新構造 (擬似コード)
'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, FileText, Lightbulb } from 'lucide-react';

export function AiSidebar() {
  const t = useTranslations('ai.sidebar');

  return (
    <div className="flex flex-col gap-4 px-2">
      {/* ブロック 1: タイトル */}
      <h2 className="text-muted-foreground px-2 text-sm font-medium">{t('title')}</h2>

      {/* ブロック 2: 空 Conversations list */}
      <div className="px-2">
        <p className="text-muted-foreground text-sm">{t('conversations.empty')}</p>
      </div>

      {/* ブロック 3: Soon セクション */}
      <AiSoonList />
    </div>
  );
}

function AiSoonList() {
  const t = useTranslations('ai.sidebar.soon');

  const items = [
    { key: 'weeklyReport', Icon: FileText },
    { key: 'insights', Icon: Lightbulb },
    { key: 'anomaly', Icon: AlertCircle },
  ] as const;

  return (
    <div className="flex flex-col gap-2 px-2">
      <span className="text-muted-foreground text-xs uppercase">{t('label')}</span>
      {items.map(({ key, Icon }) => (
        <div
          key={key}
          className="text-muted-foreground flex items-start gap-2 py-1"
          aria-disabled="true"
        >
          <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-sm">{t(`${key}.title`)}</span>
            <span className="text-xs">{t(`${key}.description`)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 5.2 design-system 遵守チェック

| 基準                       | 準拠                                                 |
| -------------------------- | ---------------------------------------------------- |
| Color: semantic token のみ | `text-muted-foreground` のみ使用、hex / 直接色なし   |
| Spacing: 8px グリッド      | `gap-2` / `gap-4` / `px-2` / `py-1` のみ             |
| Icon size                  | `size-3.5` (14px、compact list 用)                   |
| Typography                 | `text-xs` / `text-sm` のみ                           |
| clickable 不可             | `aria-disabled="true"` + hover / cursor スタイルなし |

### 5.3 AiSoonList の独立ファイル化判断

**結論: inline (§3 で決定済)**。

約 25 行の list。独立ファイル化するメリット (再利用 / test 容易性) は現時点でゼロ (AiSidebar でしか使わない)。将来 Watching AI 本実装で Soon section を別の場所 (Onboarding 等) に流用する判断が出たら、その時点で抽出。

---

## 6. AI Main area の empty state

### 6.1 `(modes)/ai/page.tsx` (Server Component)

```tsx
// (modes)/ai/page.tsx (擬似コード)
import { getTranslations } from 'next-intl/server';

import { AiMainContent } from './_composition/AiMainContent';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });
  return { title: t('main.title') };
}

export default function AiPage() {
  return <AiMainContent />;
}
```

**prefetch**: なし (AI は stub で fetch なし)。Calendar / Stats の prefetch パターンは不要。

**Suspense**: 不要 (static content)。

### 6.2 `(modes)/ai/_composition/AiMainContent.tsx` (Client Component)

```tsx
// (modes)/ai/_composition/AiMainContent.tsx (擬似コード)
'use client';

import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function AiMainContent() {
  const t = useTranslations('ai.main');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <Eye className="text-muted-foreground size-10" aria-hidden="true" />
      <h1 className="text-foreground text-lg font-medium">{t('title')}</h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">{t('description')}</p>
    </div>
  );
}
```

### 6.3 design-system 遵守

- `Eye` アイコン: `size-10` (40px、EmptyState 規約準拠: `design-system.md` の Empty State セクション)
- Color: `text-muted-foreground` / `text-foreground` (semantic)
- Typography: `text-lg` / `text-sm` (標準)
- Spacing: `gap-4` / `px-4`
- `aria-hidden` on decorative icon
- `h-full` で親の高さいっぱい中央寄せ

**注**: 厳密には `EmptyState` component (`@/lib/components/common/EmptyState`) を使う選択肢もある。ただし EmptyState は "データが存在しない" 時の UI であり、AI の "準備中" は性質が異なる (そもそもデータ概念がない placeholder)。inline 実装を採用。

---

## 7. threads/[threadId] stub の扱い

### 7.1 Option 比較

| Option | 挙動                                              | メリット                                                                      | デメリット                                         |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| **α**  | stub として最小限の page.tsx を作る (推奨)        | Phase 2-A の master-detail 言及に応える、Mobile push nav の動線確保、404 回避 | 追加ファイル 1、約 15 行                           |
| **β**  | Step C-3 では作らない。Watching AI 本実装時に追加 | Step C-3 の scope が小さくなる                                                | `/ai/threads/xxx` が 404、master-detail 構造未成立 |

### 7.2 推奨: Option α

**理由**:

1. **コスト極小**: page.tsx 1 つ、約 15 行
2. **Phase 2-A の設計と整合**: master-detail パターンを Step C-3 で establish しておく
3. **404 回避**: Watching AI 本実装時に threadId リンクを通知で送る等した際、route 存在で挙動予測可能
4. **Mobile push nav 動線の検証**: Step C-4 で Mobile AI タブ追加後、push nav が機能するか確認可能

### 7.3 stub 実装案

```tsx
// (modes)/ai/threads/[threadId]/page.tsx (擬似コード)
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });
  return { title: t('main.title') };
}

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string; locale: string }>;
}) {
  await params; // threadId は将来使うが Step C-3 では不要
  const t = await getTranslations({ namespace: 'ai.thread' });

  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-muted-foreground text-sm">{t('placeholder')}</p>
    </div>
  );
}
```

**params のバリデーション**: 既存 `calendar/[nday]` / `stats/tags/[tagId]` は format バリデーションで `notFound()` を呼ぶ。Step C-3 では threadId を**何も検証しない** (任意文字列を受け入れ、stub を表示)。理由: threadId の format は Watching AI 本実装で確定、今はデザインを固定したくない。

---

## 8. feature-boundaries 影響

### 8.1 チェックリスト

- [ ] `_shell/AiSidebar.tsx` が `@/features/*` を import しない (stub、static content のみ)
- [ ] `(modes)/ai/_composition/AiMainContent.tsx` が `@/features/*` を import しない
- [ ] `(modes)/ai/page.tsx` が `@/features/*` を import しない
- [ ] `(modes)/ai/threads/[threadId]/page.tsx` が `@/features/*` を import しない
- [ ] `src/features/ai/` 新設しない
- [ ] `npm run lint:boundaries` pass (Cross-feature 0 / Self-imports 0)

### 8.2 将来の検討ポイント (Phase 2-D 以降、Step C-3 では着手しない)

Watching AI 本実装時:

- `src/features/ai/` 新設 → Layer 2 (feature-boundaries.md で予約済)
- stub ファイルを feature 配下に移動 + barrel export
- `(modes)/ai/_composition/` は Composition 専任に戻す (hook 集約等)

---

## 9. 手動確認シナリオ

### 9.1 URL 直打ちアクセス

- [ ] `/ja/ai` で描画される (Sidebar = AiSidebar の 3 ブロック + Main = Eye + 説明)
- [ ] `/en/ai` で描画される (英語翻訳で同構造)
- [ ] `/ja/ai/threads/abc123` で描画される (Sidebar 維持 + Main = thread stub)
- [ ] `/en/ai/threads/xxx` で描画される
- [ ] ページリロード (F5) で各 URL が正常再描画

### 9.2 Sidebar dispatch (Option Y の検証)

- [ ] Calendar → AI (URL 直打ち) → Stats → AI の順で、AiSidebar / CalendarSidebar / StatsSidebar が pathname dispatch で正しく切替
- [ ] React DevTools Profiler で `<Sidebar>` 外殻 / `<SidebarContent>` dispatcher / `<SidebarUtilities>` の再マウント **0 回**
- [ ] `<AiSidebar>` は Calendar/Stats → AI 遷移時にマウント (期待挙動)

### 9.3 翻訳

- [ ] ja / en 切替で Sidebar 3 ブロック全ての文字列が翻訳される
- [ ] Main area の Eye + タイトル + 説明が翻訳される
- [ ] thread stub の "準備中" メッセージが翻訳される
- [ ] MISSING_MESSAGE が console に出ない

### 9.4 Soon セクション

- [ ] 3 項目すべて disabled 見た目 (`text-muted-foreground`)
- [ ] hover しても clickable にならない (cursor pointer が出ない)
- [ ] 各項目のアイコン (FileText / Lightbulb / AlertCircle) が正しく描画

### 9.5 feature-boundaries / Storybook

- [ ] `npm run lint:boundaries` pass
- [ ] `npm run storybook` 起動成功 (既存 Sidebar.stories.tsx / BottomTabBar.stories.tsx 等に regression なし)
- [ ] MISSING_MESSAGE エラー (i18n namespace 追加漏れ) なし

### 9.6 Settings モード (fallback 維持)

- [ ] `/ja/settings` で CalendarSidebar が fallback 表示される (Step C-2 で確定した Option α 挙動が AI 追加で壊れていない)

---

## 10. Step 分割とリスク

### 10.1 Sub-step 分割の判断

**結論: 分割しない (1 Step / 1 commit)**。

理由:

- i18n 追加 + (modes)/ai/ route + AiSidebar 書き換えが互いに依存 (1 つだけ merge すると half-working: i18n キーなしで AiSidebar 書き換えると MISSING_MESSAGE、route なしで Sidebar 書き換えても AI 経路なし、等)
- 規模 ~150 行、blast radius は `(modes)/ai/` と `_shell/AiSidebar.tsx` に閉じる
- Step C-2 の 1 commit 方針と整合

### 10.2 リスクと対策

| #   | リスク                                                                | 対策                                                                                    |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1  | i18n 翻訳漏れ → MISSING_MESSAGE                                       | grep チェック (`useTranslations('ai')` の全参照 vs `ai.json` キー)、en/ja 両方作成      |
| R2  | `APP_NAMESPACES` への `'ai'` 追加忘れ                                 | commit 前に layout.tsx の diff を必ず確認                                               |
| R3  | `_shell/AiSidebar.tsx` と `_composition/AiMainContent.tsx` の配置混乱 | §3 の修正方針をコミットメッセージにも明記                                               |
| R4  | threads/[threadId] の threadId 想定外の値                             | Step C-3 では any 文字列受け入れ (validation なし)。本実装時に追加                      |
| R5  | i18n 自動検出 vs APP_NAMESPACES 配列との齟齬                          | 両方設定する (`request.ts` は auto-detect、`APP_NAMESPACES` は IntlProvider に渡す)     |
| R6  | AiMainContent の `h-full` が親の高さ想定と食い違う                    | MainContentWrapper の実装確認、stats/calendar の empty state で動いている挙動に合わせる |

---

## 11. 相談事項 (ユーザー判断が必要)

### 11-1. `(modes)/ai/layout.tsx` の作成有無

overview.md 相談事項 B では `(modes)/calendar/layout.tsx` を作らない確定。同原則を AI にも適用するか。

| Option | 挙動                                      | 採用判断                                               |
| ------ | ----------------------------------------- | ------------------------------------------------------ |
| **1a** | `(modes)/ai/layout.tsx` を作らない (推奨) | calendar と同じ方針、YAGNI、AI モード独自 shell は不要 |
| 1b     | 作る (children thru の最小 layout)        | 将来の拡張 placeholder、だが現時点で意味なし           |

**推奨: 1a**。

### 11-2. threads/[threadId] stub の作成

§7 で Option α (作る) 推奨済。

- **α 推奨**: 最小 stub を作る (master-detail 構造の establish、push nav 動線確保)
- β: 作らない (Watching AI 本実装時に同時作成)

### 11-3. Soon セクション 3 項目の確定

現在の提案 (overview.md §5.2 準拠):

| 項目         | アイコン      | ja 説明                                  | en 説明                                 |
| ------------ | ------------- | ---------------------------------------- | --------------------------------------- |
| 週次レポート | `FileText`    | 今週の時間の使い方をまとめてお届けします | Summarizes how you spent time this week |
| 気づき       | `Lightbulb`   | パターンから見つけた気づきを共有します   | Shares patterns it notices              |
| 異常検知     | `AlertCircle` | いつもと違う兆しを静かにお知らせします   | Quietly flags what looks different      |

**確定 or 変更希望ありますか?**

### 11-4. Main area 説明文 (tone 確認)

- ja: "あなたの時間の使い方を観察し、パターンを見つけて気づきをお届けします。"
- en: "Observes how you spend time, finds patterns, and shares what it notices."

copywriting.md の研究者トーン (淡々とした宣言、感嘆符なし) 準拠。「地図」メタファーは無理に入れない判断。**確定 or 変更希望ありますか?**

### 11-5. i18n namespace 名

- **a 推奨**: 新規 `'ai'` namespace (`ai.json`)
- b: 既存 `common.json` / `navigation.json` に追加

**推奨: a**。

### 11-6. Sidebar title "Watching AI" の表記

- 英語ブランド名として "Watching AI" を ja/en 両方で固定 (現在の提案)
- ja で "ウォッチング AI" カナ表記にする選択肢もあるが、Dayopt ブランディング方針次第

**確定 or 変更希望ありますか?**

---

## Critical Files (Step C-3 スコープ)

### 新規作成

- `messages/ja/ai.json`
- `messages/en/ai.json`
- `src/app/[locale]/(app)/(modes)/ai/page.tsx`
- `src/app/[locale]/(app)/(modes)/ai/_composition/AiMainContent.tsx`
- `src/app/[locale]/(app)/(modes)/ai/threads/[threadId]/page.tsx`

### 変更

- [src/app/[locale]/(app)/\_shell/AiSidebar.tsx](<../../../../src/app/[locale]/(app)/_shell/AiSidebar.tsx>) — stub (11 行) を 3 ブロック構成 (~70 行) に書き換え
- [src/app/[locale]/(app)/layout.tsx](<../../../../src/app/[locale]/(app)/layout.tsx>) — `APP_NAMESPACES` に `'ai'` を 1 行追加

### 不変 (確認のみ)

- `_shell/SidebarContent.tsx` (Step C-2 で dispatcher 化済、`'ai'` case 既に存在)
- `_shell/navigation-paths.ts` (`getModeFromPath` が既に `'ai'` 判定可能)
- `_shell/BottomTabBar.tsx` (Step C-4 で 4 タブ化、本 Step では不変)
- `_shell/SidebarPageNav.tsx` (Step C-5 で 3 タブ化、本 Step では不変)

---

## 推定作業量

| 工程                                                         | 時間         |
| ------------------------------------------------------------ | ------------ |
| `messages/{ja,en}/ai.json` 作成                              | 10 分        |
| `layout.tsx` の `APP_NAMESPACES` 更新                        | 2 分         |
| `(modes)/ai/page.tsx` 作成                                   | 10 分        |
| `_composition/AiMainContent.tsx` 作成                        | 15 分        |
| `threads/[threadId]/page.tsx` 作成                           | 10 分        |
| `_shell/AiSidebar.tsx` 書き換え (stub → 3 ブロック)          | 20 分        |
| typecheck / lint / lint:boundaries / build                   | 5 分         |
| unit test (該当なし、既存 `navigation-paths.test.ts` は不変) | -            |
| 手動確認 (URL 直打ち + Profiler + i18n + Storybook)          | 15 分        |
| path-limited add + `git diff --cached` 確認 + commit         | 5 分         |
| **計**                                                       | **約 90 分** |

---

## 次のアクション

1. 本設計書をレビュー
2. 相談事項 11-1 〜 11-6 のユーザー判断を確定
3. Step C-3 の実装プロンプトを詰める
4. 実装前に `git status` で clean (tag 関連 dirty のみ) 確認
