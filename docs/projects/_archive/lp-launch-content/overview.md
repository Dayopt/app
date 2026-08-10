---
status: done
last_verified: 2026-07-30
code: apps/web/src/features/marketing
---

# lp-launch-content — LP 監査・ローンチ前コンテンツ設計

ローンチ前 LP（apps/web トップページ）の監査結果と、確定コピー・セクション構成の設計書。実装 Issue（GitHub）の正となるドキュメント。ビジュアル方向性は [marketing/channels/lp.md(../../../marketing/channels/lp.md)、訴求方針は [business/messaging.md(../../../business/messaging.md) が正で、本書はそれらを LP のコンテンツ仕様に落とす。

---

## 1. 監査結果（2026-07-06 時点）

**活かせるもの:** Hero + How + Pricing の 3 セクション構成の軽さ / TSX モック（MockWindow + Plan/Track/Learn カルーセル）/ i18n 完備（`apps/web/messages/{en,ja}/marketing.json`）/ レスポンシブ実装 / Header・Footer・legal 一式。

**ローンチ前必須修正:**

| #   | 問題                                                                                                                                                  | 根拠                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A   | Hero「Own your time.」が確定戦略の既定ヘッドライン「Plan days you can actually keep.」と乖離                                                          | [business/messaging.md(../../../business/messaging.md) §7                                     |
| B   | Pricing の機能表記が架空（「最大3プロジェクト」「1GB/100GB ストレージ」「コミュニティサポート」— Dayopt に存在しない概念）                            | `packages/billing/src/plans.ts`、[product/specs/billing.md(../../../product/specs/billing.md) |
| C   | How の Learn pillar「AIがパターンを検出し、時間のP&Lを表示」— 実装はルールベース所見で、戦略も AI 非主軸。P&L メタファーは messaging.md §2 で深層限定 | `apps/product/src/features/review/lib/microInsights.ts`                                       |
| D   | 「Free for 14 days」表記 — 実装は `dayoptProTrialDays = 7`（Pro のみ）。Free に試用期間の概念はない                                                   | `packages/billing/src/pricing.ts`                                                             |
| E   | Free プランに「API アクセス」と記載 — 実装は MCP/API が Pro-gated                                                                                     | `apps/product/src/app/api/mcp/`（proProcedure）                                               |
| F   | Problem / FAQ / Final CTA が LP に不在。差別化（vs Google Calendar / Todo / トラッカー）と誤解解消の場がない                                          | page.tsx は Hero + How + Pricing のみ                                                         |
| G   | 実在する MCP サーバー（OAuth + entries.list）・iCalendar フィードが LP で一切訴求されていない                                                         | `apps/product/src/app/api/mcp/`、`/api/v1/calendar/[token]`                                   |
| H   | CTA 遷移先が不統一（Hero → `https://app.dayopt.com/signup` 外部、Pricing/Header → `/signup` web 内部。後者の実在性要検証）                            | `HeroSection.tsx` / `PricingSection.tsx`                                                      |

## 2. 設計方針

- **一文コンセプト（[business/strategy.md(../../../business/strategy.md)）を LP の背骨にする:** 「予定と実績のズレを毎日の学習に変え、『守れる計画』を立てられるようにする、いちばん軽いタイムボクシングツール」
- **messaging.md の二層構造に従う:** 表層（Hero）= 上位ジョブ「守れる計画」を平易に。深層（Problem〜How〜API/MCP）= ツール断片化・計画と実績の統合・開かれたデータ構造。
- **実装に存在するものだけを書く。** 架空機能・誇張・AI 前面化を全廃する。
- **AI の向きを逆にする:** 「Dayopt に AI が入っている」ではなく「あなたの AI エージェントから Dayopt のデータを扱える」（MCP）。
- 装飾・アニメーションは現状より増やさない。セクション追加はテキスト主体で軽く。

## 3. セクション構成（確定）

```
1. Hero            — 刷新コピー + 既存モックカルーセル（変更最小）
2. Problem         — 既存 ProblemSection を組み込み、コピー刷新
3. How it works    — 既存 HowSection 維持、Learn pillar のみコピー修正
4. Open by design  — 新設（API / MCP / iCal、テキスト主体の小セクション）
5. Pricing         — 機能表記を実プランへ修正、7日トライアル表記
6. FAQ             — 新設（5問、アコーディオンなしのシンプルなリスト）
7. Final CTA       — 新設（1見出し + 1ボタン）
```

- 独立した「Product UI」セクションは作らない。How の PlanVisual/TrackVisual/LearnVisual が担う（最小構成優先）。
- 「Concept」セクションは Problem の結び + How の導入文に吸収する。
- ローンチ時のビジュアルは既存 TSX モックを維持。実プロダクトスクリーンショット差し替えはローンチ後。

## 4. 確定コピー

### Hero（`marketing.json` の `hero.*`）

| キー           | ja                                                                                                                                       | en                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| headline.words | ["守れる計画を、", "立てられるように。"]（highlight: 後半）                                                                              | ["Plan", "days", "you", "can", "actually", "keep."]（highlight: "keep."）                                                                                     |
| subcopy        | 計画と実績を、ひとつのタイムラインに。ズレが見えるから、明日の計画がうまくなる。知的労働者のための、いちばん軽いタイムボクシングツール。 | Your plan and what actually happened, in one timeline. See where they drift — and get better at planning. The lightest timeboxing tool for knowledge workers. |
| ctaPrimary     | 無料で始める                                                                                                                             | Get started free                                                                                                                                              |
| ctaNote        | クレジットカード不要                                                                                                                     | No credit card required                                                                                                                                       |

「14日間無料」は全箇所削除。Pro の 7 日トライアルは Pricing 側でのみ言及する。

### Problem

- 見出し ja: 「予定はある。記録もある。つながっていないだけ。」 / en: "You have a plan. You have a record. They just never meet."
- 3項目（既存 ProblemSection の 3 カード構造を流用）:
  1. **仕事は散らばっていていい** — タスクは GitHub や Linear に、予定はカレンダーに、連絡は Slack に。それでいい。ただ「自分の時間をどう使うか」を決める場所が、どこにもない。
  2. **計画と実績が別の場所にある** — カレンダーは未来の予定を見せ、トラッカーは過去を記録する。ズレはどちらにも残らない。
  3. **振り返りが重すぎて続かない** — 振り返りが大事なのは分かっている。専用の儀式が必要なら、続かない。
- 結び 1 文: 「Dayopt は、タスクを管理する場所ではなく、時間の使い方を運用する場所です。」

### How it works（修正は Learn pillar のみ）

- title ja: 「毎週、計画がうまくなる」 / en: "Get better at planning"
- description ja: 「計画と実績の差分から、あなたのパターンを所見として提示。見積もりの精度が、週ごとに上がっていく。」 / en: "Dayopt turns the gap between plan and reality into simple insights. Your estimates get sharper week over week."
- 「AI」「P&L」の語を削除。headline / subtitle / Plan / Track pillar は現行維持。

### Open by design（新設）

- 見出し ja: 「あなたのデータは、開かれている」 / en: "Your data, open by design"
- 本文 ja: 「Dayopt の予定と実績は、あなたのものです。閉じたアプリに囲い込みません。」
- 3項目（すべて実装済み機能のみ）:
  1. **MCP サーバー** — あなたが使う AI エージェントから、予定と実績を直接参照できます。
  2. **iCalendar フィード** — Google Calendar などで Dayopt の予定を購読できます。
  3. **API ファースト** — データのエクスポートも、外部ツールとの連携も、あなたの自由です。
- CTA なし。図解・アニメーション不要、アイコン + テキストのみ。

### Pricing

- Free（最終リストは実装時に [product/specs/billing.md(../../../product/specs/billing.md) / proProcedure ゲートと照合）:
  - カレンダー（日・週・複数日ビュー）/ 計画と実績の記録 / 基本指標のレビュー / タグ
  - description ja: 「基本的な記録と振り返りは、ずっと無料でお使いいただけます」
- Pro（$5/月、年払い $48）:
  - すべてのレビュー指標 / 無制限タグ / API・MCP アクセス / データエクスポート
  - priceDaily「1日あたり約20円 / About 15¢ a day」は維持
  - トライアル注記: 「7日間の無料トライアル・クレジットカード不要」
- 「Recommended」バッジ・scale-105 の現行レイアウトは維持。

### FAQ（新設・5問）

1. **Google Calendar と何が違いますか？** — カレンダーは未来の予定を見せるものです。Dayopt は予定と実績を同じタイムラインに重ね、そのズレを次の計画に活かします。置き換えではなく併用できます（iCalendar フィードで購読可能）。
2. **Todo アプリの代わりになりますか？** — なりません。タスク一覧は GitHub や Linear に置いたままで大丈夫です。Dayopt が扱うのは「いつやるか」と「実際どうだったか」だけです。
3. **タイムトラッカーと何が違いますか？** — 記録を増やすことが目的ではありません。計画とセットで実績を残し、差分を見るための最小限の記録です。分単位の計測に疲れた人のためのツールです。
4. **AI 機能はありますか？** — 主軸にはしていません。振り返りの所見はルールに基づくもので、ブラックボックスはありません。一方で MCP に対応しており、あなたが使っている AI エージェントから Dayopt のデータを扱えます。
5. **API / MCP で何ができますか？** — 予定と実績の参照から始まり、順次広げていきます。iCalendar フィードでのカレンダー購読も可能です。

### Final CTA（新設）

- 見出し ja: 「まず、明日の計画をひとつ。」 / en: "Start with tomorrow."
- 本文 ja: 「あなたの時間の地図は、最初のブロックから始まります。」（「地図」メタファー準拠）
- CTA: 「無料で始める / Get started free」+ 注記「クレジットカード不要」

## 5. UI レイアウト・モバイル方針

- 1 カラム、余白広め、現行のセクション縦リズム（`py-20〜32`）を踏襲。新規セクションは既存 `SectionHeader` + `Container` + `Card` の組み合わせで組む（新規デザインパターンを作らない）。
- Problem: 既存 3 カードグリッド（`md:grid-cols-3`）をそのまま使う。
- Open by design: SectionHeader + 3 項目リスト（`md:grid-cols-3`、lucide-react 既存アイコン）。
- FAQ: 見出し + dl 形式の Q&A リスト。アコーディオン JS を追加しない。
- Final CTA: 中央寄せテキスト + Button 1 つ。
- モバイル: 既存ブレークポイント運用（sm/md/lg/xl）踏襲、新セクションは 1 カラム縦積み。Hero モックカルーセル（scroll-snap）維持。折りたたみ UI は入れない。

## 6. API / MCP の見せ方

- **向きを固定する:** 「Dayopt の AI」ではなく「あなたの AI から Dayopt を」。主語はユーザーとユーザーのエージェント。
- LP では「Open by design」セクション + FAQ 2 問 + Pricing の Pro 行のみ。専用ページ・コード例・図解はローンチ後（docs 側）。
- 「read-only」「entries.list のみ」のような実装フェーズの詳細は LP に書かない。「予定と実績の参照から始まり、順次広げていきます」の粒度に留める（将来を閉じない）。

## 7. 削るもの・入れないもの・禁止表現

**削る:**

- Pricing の架空 feature 行（プロジェクト数 / ストレージ / コミュニティサポート）
- 「Free for 14 days」表記（全箇所）
- How Learn pillar の「AI」「時間の P&L」表現
- 未使用の `SolutionSection`（HowSection と重複）と `FeaturesSection`（Accuracy Score / Energy Mapping / AI Reflection は架空・AI 前面）— コンポーネント削除は P2、LP に載せない判断は本書で確定

**入れない:**

- 「通知はありません」「繰り返しはありません」等の将来を閉じる否定表現
- ユーザー数・実績数などの social proof（データがない）
- 競合との詳細比較表（FAQ の 3 問で足りる）
- テスティモニアル・ロゴ壁・アニメーション追加・動画
- MissionSection（ローンチ LP には過剰。ブログ / About 向き）

**誤解されやすい表現（禁止リスト）:**

- 「Own your time」系の自己啓発トーン → トラッカー / 生産性ハックに見える
- 「AI がパターンを検出」→ AI アプリに見える（実装もルールベース）
- 「時間の P&L」を表層コピーに出す（messaging.md §2 で深層限定）
- 「すべてのツールを1つに」型の統合訴求 → Dayopt は統合管理しない
- 「記録しましょう」の反復 → トラッカーに見える。主語は常に「計画」側に置く

## 8. 優先度と実装順（起票済み Issue）

| Issue                                                 | 内容                                        | size | priority |
| ----------------------------------------------------- | ------------------------------------------- | ---- | -------- |
| [#1487](https://github.com/Dayopt/dayopt/issues/1487) | Hero コピーを既定ヘッドラインへ刷新         | S    | P0       |
| [#1488](https://github.com/Dayopt/dayopt/issues/1488) | How の AI・P&L 表現をルールベース表現へ修正 | S    | P0       |
| [#1486](https://github.com/Dayopt/dayopt/issues/1486) | Pricing の機能表記を実プランに修正          | S    | P0       |
| [#1489](https://github.com/Dayopt/dayopt/issues/1489) | 登録 CTA の遷移先を統一                     | S    | P0       |
| [#1490](https://github.com/Dayopt/dayopt/issues/1490) | Problem セクションを LP に組み込み          | M    | P0       |
| [#1491](https://github.com/Dayopt/dayopt/issues/1491) | FAQ セクション新設                          | M    | P0       |
| [#1492](https://github.com/Dayopt/dayopt/issues/1492) | Final CTA セクション新設                    | S    | P0       |
| [#1493](https://github.com/Dayopt/dayopt/issues/1493) | Open by design（API/MCP）セクション新設     | M    | P1       |
| [#1494](https://github.com/Dayopt/dayopt/issues/1494) | OG 画像・SEO メタ文言を新コピーに整合       | S    | P1       |
| [#1495](https://github.com/Dayopt/dayopt/issues/1495) | 未使用マーケセクションの整理                | S    | P2       |
| [#1496](https://github.com/Dayopt/dayopt/issues/1496) | 実プロダクトスクリーンショットへの差し替え  | M    | P2       |

推奨実装順: コピー・整合性修正 #1487 → #1488 → #1486 → #1489（相互独立で並行可）→ セクション追加 #1490 → #1491 → #1492（page.tsx を触るため直列）→ #1493 → #1494 → **ローンチ** → #1495 → #1496。

**共通の実装ノート:** コピー変更は `apps/web/messages/{en,ja}/marketing.json` の両言語同時更新。`pnpm lint:i18n` / `pnpm typecheck` / `pnpm lint` 必須。UI 変更は en/ja × desktop/mobile の 4 パターンを Playwright スクリーンショットで視覚確認するまでが完了。本書のコピーを正とし、実装時に差分が必要になった場合は本書を先に更新する。
