---
status: current
last_verified: 2026-07-12
---

# Dayopt Glossary — 用語集

Dayopt の UI で使う言葉の正解一覧(コピー用語集)と、コードベースのドメイン概念定義(コード用語集)、禁止表記の一覧をまとめる。翻訳ファイル(messages)を編集する際は必ずここを確認する。AIとの共通言語。

- 実装ガイド → [`docs/engineering/i18n.md`](../engineering/i18n.md)
- Storybook用語(CSF, Meta, Story等) → [`docs/engineering/storybook.md`](../engineering/storybook.md)

UI文言を書く/翻訳する時は「UI 用語集」、コードの型やDBカラムを扱う時は「ドメイン・コード用語集」を参照する。両者で同じ概念(Plan, Record, Tag, TimeBoxing等)を指す場合は UI 表記側を正とし、コード用語集側は実装詳細(DBカラム名・型・decision参照)のみを持つ。

---

## UI 用語集

### 凡例

| 列           | 説明                             |
| ------------ | -------------------------------- |
| Concept      | コードベース内の概念名(英語)     |
| ja           | UI で使う日本語表記(確定)        |
| en           | UI で使う英語表記(確定)          |
| UIでの使い方 | どんな文脈で使うか               |
| 禁止表記     | 使ってはいけない代替表現         |
| 移行状況     | 現在のメッセージファイルとの差分 |

### 主要用語

| Concept   | ja             | en       | UIでの使い方                                              | 禁止表記                          | 移行状況                                                  |
| --------- | -------------- | -------- | --------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| plan      | 予定           | Plan     | 独立エンティティとしての予定。まだやっていない時間        | 計画(名詞), エントリ              | —                                                         |
| record    | 記録           | Record   | 実際に使った時間。1 Plan に複数紐づく。予定外の記録もある | 実績(UI では原則不使用), エントリ | —                                                         |
| timeblock | ブロック       | Block    | Plan / Record の総称。カレンダー上の時間ブロック全般      | タスク, エントリ                  | 一部 `タスク` 表記が残存(calendar.json, navigation.json)  |
| tag       | タグ           | Tag      | 1ブロック1タグで分類する属性                              | ラベル, カテゴリ                  | contact.json に `カテゴリ` が残存                         |
| review    | 振り返り       | Review   | ページ名・機能名                                          | レビュー                          | —                                                         |
| account   | アカウント     | Account  | 設定ページ名                                              | 設定(ページ名として)              | —                                                         |
| sign in   | サインイン     | Sign in  | 認証アクション                                            | ログイン                          | 移行中(auth.json, navigation.json が `ログイン` を使用)   |
| sign out  | サインアウト   | Sign out | 認証解除アクション                                        | ログアウト                        | 移行中(auth.json, navigation.json が `ログアウト` を使用) |
| timebox   | タイムボックス | Timebox  | 時間を区切って作業する手法(説明文脈)                      | —                                 | —                                                         |

### 詳細ノート

#### plan / 予定

DB の `plans` テーブルに対応する独立エンティティ。これからやる時間の宣言。

- UI: 「予定」
- 禁止: 「計画」(名詞としては使わない。動詞「計画する」は文脈により可)、「エントリ」(旧モデルの呼称。ADR-025 で廃止)
- 過去の Plan は時間凍結。title / tag / note のみ訂正可

#### record / 記録

実際に使った時間を表す独立エンティティ。1 つの Plan に複数の Record が紐づけられる(1:N)。Step 9a では物理 `logs` テーブルを adapter 経由で読み、#1579 で `records` へ rename する。

- UI: 「記録」
- 禁止: 「実績」(UI では原則不使用。技術用語・比較文脈では許容)、「エントリ」(旧モデルの呼称)
- `plan_id` があれば「予定に対する記録」、なければ「予定外の記録」

#### 未記録 / やらなかった / 予定外

Review で区別する3つの状態:

- **未記録の予定** — 過去の Plan で Record がなく、`skipped_at` も未設定。「まだ記録していない」
- **やらなかった予定** — Plan に `skipped_at` があるもの。実績集計からは除外するが計画履歴は残す
- **予定外の記録** — Record に `plan_id` がないもの。予定していなかったが記録した時間

いずれも判定ラベルではなく静かなマーカーで表示する(コピーライティング原則「判定せず数字で示す」)。

#### sign in / サインイン(移行中)

現状: auth.json と navigation.json が「ログイン/ログアウト」を使用している。

新規追加するキーは「サインイン/サインアウト」を使う。既存キーはまとめて Phase 2(messages 整理)で移行する。

### 確認コマンド

```bash
# 禁止表記が messages に含まれていないか確認
pnpm copy:check
```

---

## 禁止表記一覧

`pnpm copy:check` がスキャンする禁止語の定義。追加した禁止語は `scripts/i18n/check-glossary.ts` がスキャンする。新規追加した messages キーにこれらの語が含まれている場合は**警告**(現在はリファクタリング移行中のため exit 0)。既存の違反は `pnpm copy:check` で確認し、Phase 2(messages 整理)で順次修正する。

### タスク(UI でのブロック呼称として)

**推奨**: ブロック
**理由**: GTD のタスクリスト項目と混同する。Dayopt のブロックはタスクではなく時間ブロック。
**例外**: データエクスポート・法的文書での「タスクデータ」等の技術的文脈では許容

### エントリ(旧モデルの呼称として)

**推奨**: ブロック、または文脈に応じて予定 / 記録
**理由**: ADR-025 で Entry 単一モデルは廃止され、Plan(予定)/ Record(記録)に分割された。「エントリ」は旧モデルの呼称であり、新規追加では使わない。
**例外**: 過去の意思決定ログ(ADR-011 等)や migration コメント内での歴史的言及では許容

### ラベル(タグの代替として)

**推奨**: タグ
**理由**: Dayopt のタグは 1 ブロック 1 タグの分類単位。「ラベル」は複数付けられる印象を与える。

### カテゴリ(タグの代替として)

**推奨**: タグ
**理由**: 「カテゴリ」はツリー状の分類を連想させる。Dayopt のタグはフラットな単一分類。
**例外**: 問い合わせフォームの「問い合わせカテゴリ」等、タグとは独立した文脈では許容

### レビュー(振り返りページ名として)

**推奨**: 振り返り(ja)/ Review(en)
**理由**: 「レビュー」はコードレビューや評価を連想させる。Dayopt のページ名は「振り返り(Review)」で統一。

### 移行中(新規追加を禁止、既存は移行待ち)

以下は現在のメッセージファイルに多く残存しているが、新規追加では使わない。

| 禁止語     | 推奨語       | 残存ファイル               |
| ---------- | ------------ | -------------------------- |
| ログイン   | サインイン   | auth.json, navigation.json |
| ログアウト | サインアウト | auth.json, navigation.json |

### スキャン対象外(誤検知防止)

以下は禁止語に**含まない**(文脈によっては正しい使い方があるため):

| 語句     | 理由                                                                      |
| -------- | ------------------------------------------------------------------------- |
| イベント | 外部カレンダー連携の文脈(Google Calendar イベント)では正しい              |
| 実績     | DB/API 技術用語としての使用は許容。「予定と実績の比較」等の比較文脈も許容 |
| 計画     | 動詞「計画する」「計画を立てる」は文脈に応じて使用可                      |
| ブロック | タイムブロッキング手法の説明文脈では正しい                                |

---

## ドメイン・コード用語集

Dayopt固有のドメイン概念とコードベースで使用される用語の定義。UI表記ではなく、DBカラム名・型・意思決定ログ参照などの実装詳細を扱う。

### Plan / Record 関連

#### Plan(予定)

これからやる時間の宣言。独立エンティティ。UI表記は「予定」([UI用語集](#主要用語)参照)。

- DB: `plans` テーブル
- source: `manual` / `external_calendar` / `api`(作成時に確定する不変の provenance)
- `skipped_at` があれば「やらなかった」予定

#### Record(記録)

実際に使った時間。独立エンティティ。1 つの Plan に複数の Record が紐づく(1:N)。UI表記は「記録」([UI用語集](#主要用語)参照)。

- DB: `logs` テーブル（移行中。公開名は Record、#1579 で `records` へ rename）
- `plan_id`(nullable): あり = 予定に対する記録、なし = 予定外の記録
- source: `manual` / `from_plan` / `auto_migrated` / `external_calendar` / `api`
- `fulfillment_score` は Record 側のみが持つ属性(Plan にはない)

#### TimeblockState(ブロック状態)

Plan / Record の時間位置から自動導出される3値。DBカラムではない。

| 状態       | 条件                       | 備考                                          |
| ---------- | -------------------------- | --------------------------------------------- |
| `upcoming` | `start_at > now`           | Plan のみ取りうる(未来の Record は存在しない) |
| `active`   | `start_at <= now < end_at` | 進行中                                        |
| `past`     | `end_at <= now`            | Plan は時間凍結、Record は訂正可              |

- 算出関数: `getTimeblockState()` — `src/features/timeblock/lib/timeblock-status.ts`
- 意思決定ログ: [時間不変原則](../product/log/2026-03-10-time-immutability-principle.md)、[ADR-025](log/2026-07-09-time-model-split.md)

#### 2レーン表示

Calendar は Plan レーンと Record レーンを横並びで表示する。

- **Plan レーン**: アウトライン・淡色(控えめ)
- **Record レーン**: 塗り・主役(「Dayopt は実際に何が起きたかを見せる」を画面に反映)

#### 保存先ルール

ブロック作成・編集時に保存先を選ぶ UI は存在しない。`end_at > now` なら Plan、`end_at <= now` なら Record として一意に決まる。境界をまたぐ編集で表示チップが自動的に切り替わる。

#### FulfillmentScore(達成度スコア)

Record に対してユーザーが付ける1-5の主観的達成度。Stats機能で集計される。Plan には存在しない(予定の時点では達成度を測れないため)。

| スコア | 意味                   |
| ------ | ---------------------- |
| 1      | 全く達成できなかった   |
| 2      | あまり達成できなかった |
| 3      | まあまあ               |
| 4      | 概ね達成               |
| 5      | 完全に達成             |

### 時間管理

#### TimeBoxing(タイムボクシング)

時間枠を先に決めてからタスクを割り当てる手法。Dayoptのコアコンセプト。
タスクの完了を目標にするのではなく、決めた時間内でベストを尽くすことに焦点を当てる。UI表記は「タイムボックス」([UI用語集](#主要用語)参照)。

#### Time Immutability(時間不変原則)

「Time waits for no one」 — 過去は変更できないという原則。

- 過去 Plan の `start_at` / `end_at` は変更不可(title / tag / note のみ訂正可)
- Record は過去の記録そのものなので、時間・タグ・note・`fulfillment_score` を訂正可能
- UI: 過去 Plan は disabled 表示 + ロジックガードの二重防御
- 意思決定ログ: [ADR-025](log/2026-07-09-time-model-split.md)、[時間不変原則](../product/log/2026-03-10-time-immutability-principle.md)

### ユーザー属性

#### Chronotype(クロノタイプ)

ユーザーの生体リズムに基づく生産性パターン。4タイプ:

| タイプ          | 特徴              | ピーク時間帯     |
| --------------- | ----------------- | ---------------- |
| Lion(ライオン)  | 早起き型          | 朝               |
| Bear(クマ)      | 標準型(人口の55%) | 午前中〜昼       |
| Wolf(オオカミ)  | 夜型              | 午後〜夜         |
| Dolphin(イルカ) | 不規則型          | 短い集中バースト |

- Onboarding時にクイズで判定
- Stats のエネルギーマップで可視化
- 型: `src/types/chronotype.ts`

#### ProductivityZone(生産性ゾーン)

クロノタイプから導出される時間帯別の集中度レベル。カレンダー背景色で視覚表現。

### UI機能

#### Tag(タグ)

ブロックの活動分類。コロン(`:`)区切りで階層を表現(最大2階層)。UI表記は「タグ」([UI用語集](#主要用語)参照)。

- 例: `仕事:開発`, `学習:英語`, `運動`
- 各タグにカラーとアイコンを設定可能(10色パレット)
- Feature: `src/features/tags/`

#### Palette(パレット)

サイドバーに表示される「よく使うブロック」のクイック挿入機能。
頻度 × 最終使用日のスコアリングで自動ランク付け。1タップで現在時刻にブロックを作成。

- Feature: `src/features/palette/`

#### Inspector(インスペクタ)

カレンダー上のブロック(Plan / Record)をクリックした際に開く詳細パネル。
時間変更、タグ付け、ノート、達成度記録などを行う。

- Component: `src/features/timeblock/components/editor/`

### アーキテクチャ用語

#### Feature Layer(機能レイヤー)

DAG構造の依存関係を持つ機能分類:

| レイヤー      | 依存可能な対象 | 含まれる機能                              |
| ------------- | -------------- | ----------------------------------------- |
| Layer 0       | なし(基盤)     | Tags, Chronotype                          |
| Layer 1       | Layer 0 のみ   | Timeblock                                 |
| Layer 2       | Layer 0, 1     | Calendar, Stats, Search, History, Palette |
| Cross-cutting | 制約なし       | Settings, Auth, Notifications             |

- 意思決定ログ: [feature-sliced architecture](../engineering/log/2026-02-26-feature-sliced-architecture.md)
- ESLint: `lint:boundaries` で強制

#### Composition Layer

異なるFeatureのコンポーネントを組み合わせる層。`src/app/` のページコンポーネントが担う。
Feature同士は直接importできないため、ページ層で合成する。

#### Barrel Export

各Featureの `index.ts` で公開するAPIのみが外部からアクセス可能。
deep import(`@/features/timeblock/hooks/useTimeblock`)は禁止。

### ビジネス用語

#### Subscription Status(サブスクリプション状態)

| ステータス | 説明                     |
| ---------- | ------------------------ |
| `free`     | 無料プラン               |
| `trialing` | 7日間のProトライアル中   |
| `active`   | Pro有料プラン(月額/年額) |
| `past_due` | 支払い遅延               |
| `canceled` | 解約済み                 |

- 決済: Stripe Checkout + Customer Portal
- 機能制限: `proProcedure` で Pro専用APIをガード
