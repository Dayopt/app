# Dayopt Glossary — UI 用語集

Dayopt の UI で使う言葉の正解一覧。翻訳ファイル（messages）を編集する際は必ずここを確認する。

**関連ドキュメント**:

- 禁止表記の一覧 → [`docs/glossary/forbidden-terms.md`](./forbidden-terms.md)
- 実装ガイド → [`docs/guides/i18n.md`](../guides/i18n.md)
- Storybook用語（CSF, Meta, Story等） → [`docs/glossary/storybook.md`](./storybook.md)

このファイルは UI で使う言葉の正解一覧（コピー用語集）と、コードベースのドメイン概念定義（コード用語集）の両方をまとめる。UI文言を書く/翻訳する時は「UI 用語集」、コードの型やDBカラムを扱う時は「ドメイン・コード用語集」を参照する。両者で同じ概念（Entry, Tag, TimeBoxing等）を指す場合は UI 表記側を正とし、コード用語集側は実装詳細（DBカラム名・型・ADR参照）のみを持つ。

---

## 凡例

| 列           | 説明                             |
| ------------ | -------------------------------- |
| Concept      | コードベース内の概念名（英語）   |
| ja           | UI で使う日本語表記（確定）      |
| en           | UI で使う英語表記（確定）        |
| UIでの使い方 | どんな文脈で使うか               |
| 禁止表記     | 使ってはいけない代替表現         |
| 移行状況     | 現在のメッセージファイルとの差分 |

---

## 主要用語

| Concept            | ja             | en       | UIでの使い方                                         | 禁止表記                 | 移行状況                                                    |
| ------------------ | -------------- | -------- | ---------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| entry              | エントリ       | Entry    | 計画・記録を持つ時間ブロック                         | タスク, ブロック（単独） | 一部 `タスク` 表記が残存（calendar.json, navigation.json）  |
| plan (record side) | 予定           | Plan     | エントリの計画側の時間                               | 計画（名詞）             | —                                                           |
| record             | 記録           | Record   | 実際に発生した時間（UI 表示）                        | —                        | —                                                           |
| actual             | 実績           | Actual   | DB/API 寄りの技術用語。**UI では原則「記録」を使う** | —                        | calendar.json に混在（技術的文脈では許容）                  |
| tag                | タグ           | Tag      | 1エントリ1タグで分類する属性                         | ラベル, カテゴリ         | contact.json に `カテゴリ` が残存                           |
| review             | 振り返り       | Review   | ページ名・機能名                                     | レビュー                 | —                                                           |
| account            | アカウント     | Account  | 設定ページ名                                         | 設定（ページ名として）   | —                                                           |
| sign in            | サインイン     | Sign in  | 認証アクション                                       | ログイン                 | 移行中（auth.json, navigation.json が `ログイン` を使用）   |
| sign out           | サインアウト   | Sign out | 認証解除アクション                                   | ログアウト               | 移行中（auth.json, navigation.json が `ログアウト` を使用） |
| timebox            | タイムボックス | Timebox  | 時間を区切って作業する手法（説明文脈）               | —                        | —                                                           |

---

## 詳細ノート

### entry / エントリ

DB の `entries` テーブルに対応する中心モデル。計画（予定）と記録の両側を持つ。

- UI: 「エントリ」
- 禁止: 「タスク」（GTD 文脈の作業リスト項目と混同する）、「イベント」（カレンダーの外部 event と混同する）
- ただし **外部カレンダー連携の文脈**では「イベント」が正しい場合がある（Google Calendar の event = イベント）

### actual / 実績

DB の `actual_start` / `actual_end` カラム名、および計算値の技術用語。

- UI 表示では原則「記録」に揃える
- **「予定と実績の比較」のような UI 文言では「実績」は許容**（比較コンテキストで「記録」にすると「予定と記録」となり読みにくい）
- コードコメント・変数名では `actual` / `実績` を使い続けてよい

### sign in / サインイン（移行中）

現状: auth.json と navigation.json が「ログイン/ログアウト」を使用している。

新規追加するキーは「サインイン/サインアウト」を使う。既存キーはまとめて Phase 2（messages 整理）で移行する。

---

## 確認コマンド

```bash
# 禁止表記が messages に含まれていないか確認
pnpm copy:check
```

---

## ドメイン・コード用語集

Dayopt固有のドメイン概念とコードベースで使用される用語の定義。UI表記ではなく、DBカラム名・型・ADR参照などの実装詳細を扱う。

### エントリ関連

#### Entry（エントリ）

Dayoptの中心モデル。計画（旧 Plan）と記録（旧 Record）を統合した「時間ブロック」。UI表記は「エントリ」（[UI用語集](#主要用語)参照）。

- DB: `entries` テーブル
- 型: `src/features/entry/types/entry.ts`
- 旧名称: `Plan`, `Record`（コードベースで見かけたら `Entry` に読み替える）

#### EntryState（エントリ状態）

エントリの時間位置から自動導出される3値。DBカラムではない。

| 状態       | 条件                           | 編集可否                       |
| ---------- | ------------------------------ | ------------------------------ |
| `upcoming` | `start_time > now`             | 全フィールド編集可             |
| `active`   | `start_time <= now < end_time` | 一部フィールド編集可           |
| `past`     | `end_time <= now`              | 読み取り専用（実績記録のみ可） |

- 算出関数: `getEntryState()` — `src/features/entry/lib/entry-status.ts`
- ADR: [ADR-015 時間不変原則](../decisions/015-time-immutability-principle.md)

#### EntryOrigin（エントリ起源）

エントリがどのように作られたかを示す分類。

| 値          | 説明                                   |
| ----------- | -------------------------------------- |
| `planned`   | 事前に計画として作成された             |
| `unplanned` | アドホックに作成された（予定外の作業） |

#### FulfillmentScore（達成度スコア）

エントリ完了後にユーザーが付ける1-5の主観的達成度。Stats機能で集計される。

| スコア | 意味                   |
| ------ | ---------------------- |
| 1      | 全く達成できなかった   |
| 2      | あまり達成できなかった |
| 3      | まあまあ               |
| 4      | 概ね達成               |
| 5      | 完全に達成             |

### 時間管理

#### TimeBoxing（タイムボクシング）

時間枠を先に決めてからタスクを割り当てる手法。Dayoptのコアコンセプト。
タスクの完了を目標にするのではなく、決めた時間内でベストを尽くすことに焦点を当てる。UI表記は「タイムボックス」（[UI用語集](#主要用語)参照）。

#### Time Immutability（時間不変原則）

「Time waits for no one」 — 過去は変更できないという原則。

- 過去のエントリの `start_time` / `end_time` は変更不可
- 実績（`actual_start` / `actual_end` / `fulfillment_score`）は記録可能
- UI: 過去ブロックは disabled 表示 + ロジックガードの二重防御
- ADR: [ADR-011](../decisions/011-unified-block-model.md), [ADR-015](../decisions/015-time-immutability-principle.md)

### ユーザー属性

#### Chronotype（クロノタイプ）

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

#### ProductivityZone（生産性ゾーン）

クロノタイプから導出される時間帯別の集中度レベル。カレンダー背景色で視覚表現。

### UI機能

#### Tag（タグ）

エントリの活動分類。コロン(`:`)区切りで階層を表現（最大2階層）。UI表記は「タグ」（[UI用語集](#主要用語)参照）。

- 例: `仕事:開発`, `学習:英語`, `運動`
- 各タグにカラーとアイコンを設定可能（10色パレット）
- Feature: `src/features/tags/`

#### Palette（パレット）

サイドバーに表示される「よく使うブロック」のクイック挿入機能。
頻度 × 最終使用日のスコアリングで自動ランク付け。1タップで現在時刻にエントリを作成。

- Feature: `src/features/palette/`

#### Inspector（インスペクタ）

カレンダー上のエントリをクリックした際に開く詳細パネル。
時間変更、タグ付け、ノート、達成度記録などを行う。

- Component: `src/features/entry/components/inspector/`

### アーキテクチャ用語

#### Feature Layer（機能レイヤー）

DAG構造の依存関係を持つ機能分類:

| レイヤー      | 依存可能な対象 | 含まれる機能                              |
| ------------- | -------------- | ----------------------------------------- |
| Layer 0       | なし（基盤）   | Tags, Chronotype                          |
| Layer 1       | Layer 0 のみ   | Entry                                     |
| Layer 2       | Layer 0, 1     | Calendar, Stats, Search, History, Palette |
| Cross-cutting | 制約なし       | Settings, Auth, Notifications             |

- ADR: [ADR-012](../decisions/012-feature-sliced-architecture.md)
- ESLint: `lint:boundaries` で強制

#### Composition Layer

異なるFeatureのコンポーネントを組み合わせる層。`src/app/` のページコンポーネントが担う。
Feature同士は直接importできないため、ページ層で合成する。

#### Barrel Export

各Featureの `index.ts` で公開するAPIのみが外部からアクセス可能。
deep import（`@/features/entry/hooks/useEntry`）は禁止。

### ビジネス用語

#### Subscription Status（サブスクリプション状態）

| ステータス | 説明                       |
| ---------- | -------------------------- |
| `free`     | 無料プラン                 |
| `trialing` | 7日間のProトライアル中     |
| `active`   | Pro有料プラン（月額/年額） |
| `past_due` | 支払い遅延                 |
| `canceled` | 解約済み                   |

- 決済: Stripe Checkout + Customer Portal
- 機能制限: `proProcedure` で Pro専用APIをガード
