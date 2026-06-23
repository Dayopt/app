# Dayopt ドメイン用語集

Dayopt固有のドメイン概念とコードベースで使用される用語の定義。

> Storybook用語（CSF, Meta, Story 等）は [Storybook 公式用語集](./storybook-glossary.md) を参照。

---

## エントリ関連

### Entry（エントリ）

Dayoptの中心モデル。計画（旧 Plan）と記録（旧 Record）を統合した「時間ブロック」。

- DB: `entries` テーブル
- 型: `src/features/entry/types/entry.ts`
- 旧名称: `Plan`, `Record`（コードベースで見かけたら `Entry` に読み替える）

### EntryState（エントリ状態）

エントリの時間位置から自動導出される3値。DBカラムではない。

| 状態       | 条件                           | 編集可否                       |
| ---------- | ------------------------------ | ------------------------------ |
| `upcoming` | `start_time > now`             | 全フィールド編集可             |
| `active`   | `start_time <= now < end_time` | 一部フィールド編集可           |
| `past`     | `end_time <= now`              | 読み取り専用（実績記録のみ可） |

- 算出関数: `getEntryState()` — `src/features/entry/lib/entry-status.ts`
- ADR: [ADR-005 時間不変原則](adr/005-time-immutability-principle.md)

### EntryOrigin（エントリ起源）

エントリがどのように作られたかを示す分類。

| 値          | 説明                                   |
| ----------- | -------------------------------------- |
| `planned`   | 事前に計画として作成された             |
| `unplanned` | アドホックに作成された（予定外の作業） |

### FulfillmentScore（達成度スコア）

エントリ完了後にユーザーが付ける1-5の主観的達成度。Stats機能で集計される。

| スコア | 意味                   |
| ------ | ---------------------- |
| 1      | 全く達成できなかった   |
| 2      | あまり達成できなかった |
| 3      | まあまあ               |
| 4      | 概ね達成               |
| 5      | 完全に達成             |

---

## 時間管理

### TimeBoxing（タイムボクシング）

時間枠を先に決めてからタスクを割り当てる手法。Dayoptのコアコンセプト。
タスクの完了を目標にするのではなく、決めた時間内でベストを尽くすことに焦点を当てる。

### Time Immutability（時間不変原則）

「Time waits for no one」 — 過去は変更できないという原則。

- 過去のエントリの `start_time` / `end_time` は変更不可
- 実績（`actual_start` / `actual_end` / `fulfillment_score`）は記録可能
- UI: 過去ブロックは disabled 表示 + ロジックガードの二重防御
- ADR: [ADR-001](adr/001-unified-block-model.md), [ADR-005](adr/005-time-immutability-principle.md)

---

## ユーザー属性

### Chronotype（クロノタイプ）

ユーザーの生体リズムに基づく生産性パターン。4タイプ:

| タイプ            | 特徴                | ピーク時間帯     |
| ----------------- | ------------------- | ---------------- |
| Lion（ライオン）  | 早起き型            | 朝               |
| Bear（クマ）      | 標準型（人口の55%） | 午前中〜昼       |
| Wolf（オオカミ）  | 夜型                | 午後〜夜         |
| Dolphin（イルカ） | 不規則型            | 短い集中バースト |

- Onboarding時にクイズで判定
- Stats のエネルギーマップで可視化
- 型: `src/types/chronotype.ts`

### ProductivityZone（生産性ゾーン）

クロノタイプから導出される時間帯別の集中度レベル。カレンダー背景色で視覚表現。

---

## UI機能

### Tag（タグ）

エントリの活動分類。コロン(`:`)区切りで階層を表現（最大2階層）。

- 例: `仕事:開発`, `学習:英語`, `運動`
- 各タグにカラーとアイコンを設定可能（10色パレット）
- Feature: `src/features/tags/`

### Palette（パレット）

サイドバーに表示される「よく使うブロック」のクイック挿入機能。
頻度 × 最終使用日のスコアリングで自動ランク付け。1タップで現在時刻にエントリを作成。

- Feature: `src/features/palette/`

### Inspector（インスペクタ）

カレンダー上のエントリをクリックした際に開く詳細パネル。
時間変更、タグ付け、ノート、達成度記録などを行う。

- Component: `src/features/entry/components/inspector/`

---

## アーキテクチャ用語

### Feature Layer（機能レイヤー）

DAG構造の依存関係を持つ機能分類:

| レイヤー      | 依存可能な対象 | 含まれる機能                              |
| ------------- | -------------- | ----------------------------------------- |
| Layer 0       | なし（基盤）   | Tags, Chronotype                          |
| Layer 1       | Layer 0 のみ   | Entry                                     |
| Layer 2       | Layer 0, 1     | Calendar, Stats, Search, History, Palette |
| Cross-cutting | 制約なし       | Settings, Auth, Notifications             |

- ADR: [ADR-002](adr/002-feature-sliced-architecture.md)
- ESLint: `lint:boundaries` で強制

### Composition Layer

異なるFeatureのコンポーネントを組み合わせる層。`src/app/` のページコンポーネントが担う。
Feature同士は直接importできないため、ページ層で合成する。

### Barrel Export

各Featureの `index.ts` で公開するAPIのみが外部からアクセス可能。
deep import（`@/features/entry/hooks/useEntry`）は禁止。

---

## ビジネス用語

### Subscription Status（サブスクリプション状態）

| ステータス | 説明                       |
| ---------- | -------------------------- |
| `free`     | 無料プラン                 |
| `trialing` | 7日間のProトライアル中     |
| `active`   | Pro有料プラン（月額/年額） |
| `past_due` | 支払い遅延                 |
| `canceled` | 解約済み                   |

- 決済: Stripe Checkout + Customer Portal
- 機能制限: `proProcedure` で Pro専用APIをガード
