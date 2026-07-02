# LP実装仕様書 (v2)

marketing repo → web repo へのハンドオフ文書。
LPの各セクションについて、メッセージの方向性・コピー候補・翻訳キー・実装指示を定義する。

> プロダクトの最上位コンセプトは [`docs/strategy/concept.md`](./concept.md) を参照（2026-07-02 策定）。本仕様書は未実装のドラフトであり、次回 LP 作業（`apps/web/messages/*.json` 等の実装）で concept.md の決定を反映して確定させる。

---

## ステータス概要

| セクション | コピー方向 | 実装状態 | 未決定事項                     |
| ---------- | ---------- | -------- | ------------------------------ |
| Hero       | 確定       | 要更新   | 日本語ヘッドラインの最終コピー |
| Problem    | 確定       | 要更新   | なし                           |
| Solution   | 確定       | 要更新   | P/Lメタファーの具体表現        |
| Proof      | 確定       | 新規作成 | なし                           |
| Features   | 確定       | 要更新   | 各Featureの見せ方              |
| Pricing    | 確定       | 変更なし | なし                           |

---

## 設計思想

### ストーリーライン

読者の感情の旅: **モヤモヤ → 共感 → 「これだ」 → 納得 → 行動**

### メッセージ二層構造

| 層   | 内容                                        | 対象                       |
| ---- | ------------------------------------------- | -------------------------- |
| 表層 | 上位ジョブを平易な言葉で                    | 誰にでも響く               |
| 深層 | 中位〜下位ジョブのディテール、P/Lメタファー | 「わかってる人」がうなずく |

### JTBD → セクションマッピング

| JTBDレイヤー | LPセクション       |
| ------------ | ------------------ |
| 上位（Why）  | Hero               |
| 中位（What） | Problem + Solution |
| 下位（How）  | Features           |

### 基本原則

- 1:1アテンション比率（1ページ = 1ゴール）
- モバイルファースト
- 実際のUI画像を使用
- 詳細: [lp.md](?path=/docs/strategy-lp-design--docs)

---

## セクション別仕様

### 1. Hero

**目的**: 上位ジョブを平易な言葉で語り、「自分のことだ」と感じさせる。

**JTBD**: 上位（計画を守れるようにしたい）

**ヘッドライン** [DECIDED: 2026-07-02]（[concept.md](./concept.md) 準拠）:

- 英語: **"Plan days you can actually keep."**
- 日本語: 「守れる計画」を軸に据える。直訳ではなく同じJTBDに刺さる自然な日本語を次回 LP 作業で確定する

旧A〜D案（Own your time. / Make every hour intentional. / See where your time actually goes. / Your time. By design.）は不採用。特にC案は「ズレの可視化」を主訴求にしており、concept.md §2「ズレを見せるのは手段であって売り物ではない」と矛盾する。

**サブヘッド方向**: Before→Afterの変化を1文で。「予定と実績のズレを理解し、守れる計画を立てられるようになる」Dayopt固有の価値。

**CTA**: 「無料で始める」/ "Start Free"

**ビジュアル**: Hero直下にプロダクトのスクリーンショット/モックアップ。現行のAppPreviewMockupを実際のスクリーンショットに置換予定。

**翻訳キー**: `marketing.hero.*`

**現行との差分**:

- 現行: "ひとつのワークフロー。毎日、少しずつ良く。" → v2方向に全面書き換え
- サブヘッドも全面書き換え

**コンポーネント**: Hero部分は `page.tsx` にインライン（既存構造を維持）

---

### 2. Problem

**目的**: 共感を喚起し「自分のことだ」と思わせる。サイクルが回せない焦りを言語化。

**JTBD**: 中位（実際に何に時間を使ったか見たい / 時間の配分を自分で決めたい）

**コピー方向**:

上位ジョブ（サイクルが回せない）から入る。道具の断片化（下位ジョブ）は結果として触れるが、入口にしない。

- 問題1: **計画しても計画通りにならない** — 1日の設計が10時には崩れている
- 問題2: **何にどれだけ使ったか分からない** — 1日が終わって説明できない
- 問題3: **改善の手がかりがない** — 計画→記録→分析のサイクルが回らない

**見出し方向**: 「こんな経験ありませんか？」形式（現行を踏襲）

**翻訳キー**: `marketing.problem.*`

**現行との差分**:

- 現行item1「計画はカレンダー、タスクは別アプリ」→ ツール断片化の話が先に来ている。v2ではサイクル不全から入る
- 問題の切り口をJTBD中位に合わせて再構成

**コンポーネント**: `ProblemSection.tsx`

---

### 3. Solution

**目的**: 「意図と実態を1つのタイムラインで重ねる」というDayopt固有の解決策を示す。P/Lメタファー投入。

**JTBD**: 中位→下位への橋渡し

**コピー方向**:

3ステップ構造は維持。ただし各ステップの説明をJTBDに沿って再構成。

- **Plan（設計する）**: 自分で1日を設計する。時間のP/Lの「予算」に相当。
- **Record（記録する）**: 実際の時間を記録する。P/Lの「実績計上」。ワンタップで。
- **Insight（知る）**: 計画と実態のギャップが見える。P/Lの「決算レポート」。

**P/Lメタファーの投入** [UNDECIDED]:

- セクションのサブヘッドで軽く触れる案: 「自分の時間の収支を見る」
- 各ステップの説明に織り込む案: Plan=予算、Record=実績、Insight=決算

**翻訳キー**: `marketing.solution.*`

**現行との差分**:

- ステップ名: execute → record、reflect → insight に変更検討
- P/Lメタファーの新規投入
- 旧Missionセクションの「なぜ作ったか」要素をサブヘッドに吸収

**コンポーネント**: `SolutionSection.tsx`

---

### 4. Proof（新設）

**目的**: 「実際にこう見える」を見せて納得させる。言葉ではなくプロダクト画面で語る。

**コピー方向**:

最小限のテキスト + 大きなプロダクトスクリーンショット。

- 見出し: 「実際の画面」/ "See it in action" 程度
- 1-2行の補足テキストのみ

**見せるべき画面** [DECIDED: 2026-07-02]:

カレンダー上のオーバーレイ（予定と実績が同じタイムラインに重なって見える画面）。1 Entry モデルの視覚的ペイオフであり、スクリーンショット1枚で差別化が伝わる（[concept.md §5](./concept.md)）。統計/インサイト画面は補助的に添える程度に留め、メインでは使わない（レポート機能の印象を強めすぎない）。

**翻訳キー**: `marketing.proof.*`（新規追加）

**コンポーネント**: 新規作成（`ProofSection.tsx`）

---

### 5. Features

**目的**: 下位ジョブ（How）に応える具体的な機能紹介。「だからこのツールなのか」と確信させる。

**JTBD**: 下位（予定と実績を1つの場所で管理したい）

**コピー方向**:

3つの機能に絞る（現行の精度スコア・AI振り返りを再構成。in-app AI は作らない方針のため AI インサイトは差し替え）:

- **精度スコア**: 意図と実行のギャップを数値化。「鏡」としての位置づけを維持（[concept.md §5](./concept.md) の作成時フィードフォワードの実装）
- **パターン分析**: 自分のリズム・傾向を発見（ルールベース統計）
- **MCP/API連携**: 自分の AI（Claude / ChatGPT）に接続して、記録データから横断的な考察を得られる。in-app AI 機能ではない

**見出し方向**: 「Dayoptが違う理由」（現行を踏襲可）

**翻訳キー**: `marketing.features.*`

**現行との差分**:

- 機能名・説明の微調整
- P/Lメタファーとの接続を意識した表現へ

**コンポーネント**: `FeaturesSection.tsx`

---

### 6. Pricing

**目的**: シンプルに。障壁を下げる。

**コピー方向**: 現行を維持。大きな変更なし。

- Free: $0 / 基本機能
- Pro: $5/月 / 全指標無制限 + MCP/APIアクセス（in-app AI ではない）

**翻訳キー**: `marketing.pricing.*`（変更なし）

**コンポーネント**: `PricingSection.tsx`

---

### 7. FAQ（追加検討）[UNDECIDED]

LP戦略（lp.md）のベストプラクティスに基づき、購入障壁を取り除くFAQセクションの追加を検討。

候補Q:

- データはどこに保存される？
- Googleカレンダーとの連携は？
- 無料プランの制限は？
- 解約は簡単？

---

### 8. Final CTA（追加検討）[UNDECIDED]

Heroと同じCTAをページ末尾に再配置。LP戦略のベストプラクティス。

---

## 未決定事項一覧

| ID  | 項目                          | 状態                                                     | 参照セクション                                                           |
| --- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| U1  | コアメッセージ / ヘッドライン | [DECIDED: 2026-07-02] "Plan days you can actually keep." | Hero                                                                     |
| U2  | P/Lメタファーの具体表現       | サブヘッド案 / ステップ織り込み案（未決）                | Solution                                                                 |
| U3  | Proofで見せるプロダクト画面   | [DECIDED: 2026-07-02] カレンダー上のオーバーレイ         | Proof                                                                    |
| U4  | アクセントカラー              | 未決                                                     | [visual-direction.md](?path=/docs/strategy-brand-visual-direction--docs) |
| U5  | FAQセクション追加             | 追加 / 見送り（未決）                                    | FAQ                                                                      |
| U6  | Final CTA追加                 | 追加 / 見送り（未決）                                    | Final CTA                                                                |
| U7  | 各Featureの見せ方             | スクリーンショット / アイコン+テキスト（未決）           | Features                                                                 |

決定時は ADR を `journal/decisions/` に記録し、該当箇所の `[UNDECIDED]` を `[DECIDED: YYYY-MM-DD]` に更新する。

---

## 翻訳キーマッピング

lp-spec.md のセクション → `messages/{en,ja}/marketing.json` のキー対応。

| セクション | 翻訳キー                                              | 状態                 |
| ---------- | ----------------------------------------------------- | -------------------- |
| Hero       | `marketing.hero.title` / `.subtitle` / `.cta`         | 既存（書き換え）     |
| Problem    | `marketing.problem.title` / `.items.*`                | 既存（書き換え）     |
| Solution   | `marketing.solution.title` / `.subtitle` / `.steps.*` | 既存（書き換え）     |
| Proof      | `marketing.proof.title` / `.subtitle`                 | **[NEW]**            |
| Features   | `marketing.features.grid.*` / `.items.*`              | 既存（微調整）       |
| Pricing    | `marketing.pricing.*`                                 | 既存（変更なし）     |
| FAQ        | `marketing.faq.*`                                     | **[NEW]** 追加検討中 |
| Final CTA  | `marketing.finalCta.*`                                | **[NEW]** 追加検討中 |

削除:

- `marketing.mission.*` — Mission セクション廃止に伴い不要に

---

## 実装先

- **ページ**: `~/Desktop/web/src/app/[locale]/(marketing)/page.tsx`
- **翻訳ファイル**: `~/Desktop/web/messages/{en,ja}/marketing.json`
- **コンポーネント**: `~/Desktop/web/src/features/marketing/components/`

---

## 🔗 関連ドキュメント

📖 **メッセージング設計**: [brand/messaging.md](?path=/docs/strategy-brand-messaging--docs) — JTBD、コアメッセージ、ブランドパーソナリティ
📖 **ターゲットペルソナ**: [brand/persona.md](?path=/docs/strategy-brand-persona--docs) — 顧客像と行動パターン
📖 **ビジュアルディレクション**: [brand/visual-direction.md](?path=/docs/strategy-brand-visual-direction--docs) — タイポグラフィ・カラー・イメージ
📖 **LP戦略（汎用）**: [lp.md](?path=/docs/strategy-lp-design--docs) — ベストプラクティス・技術要件
📖 **価値提案**: [brand/value-proposition.md](?path=/docs/strategy-brand-value-proposition--docs) — STC/RTB
📖 **ブランドキャラクター**: [brand/brand-character.md](?path=/docs/strategy-brand-character--docs) — トーン・パーソナリティ
