---
status: current
last_verified: 2026-07-23
---

# Writing Style — B1 基準

Docs / Blog / Release notes を書くすべての AI と人間が従う文章基準。プロダクト思想「軽い・早い・少ない」を文章にも適用する（#1438）。

文章まわりの正本は 4 つに分かれる。**書き方の機械的ルールは本ファイルが正本**。

- 本ファイル — 文の書き方（B1 基準、短文、AI 臭の排除）
- `docs/marketing/voice.md` — 何を書くか（3 本柱・6 原則）
- [copywriting.md](./copywriting.md) — アプリ内 UI 文言のトーン・CTA 階層
- `docs/ai/docs-policy.md` — Docs / Blog / Release notes の役割分担

> Simple, not childish.
> 短く、具体的で、初見でも迷わない文章にする。

## 原則

- **Light** — 1 文を短くする。飾りを削る
- **Fast** — main point を最初に書く。読者を待たせない
- **Minimal** — 1 文に 1 つの主旨。要らない文は書かない

読みやすさの基準は **日本語・英語ともに B1 相当**。中学〜高校レベルの語彙で、初見の読者がつまずかずに読めること。

- **Docs**: B1 を厳守する。目的は、ユーザーが早く理解してすぐ使えること。文章の味より理解速度を優先する
- **Blog / Release notes**: B1 を基本にする。設計思想や背景を書く時だけ、必要な範囲で B2 寄りの表現を許可する。その場合も長文・抽象語・曖昧な SaaS 表現は避ける

## 日本語のルール

- 短い文で書く。読点が 3 つ以上続いたら文を分ける
- 具体語を使う。「効率化」「最適化」より「〇〇の手順が 2 回から 1 回になる」
- 1 文 1 意図。「〜であり、〜だが、〜のため」の連結をしない
- 長い名詞句を避ける。「時間記録データ活用促進のための機能」→「記録した時間を活かす機能」
- 抽象的なビジネス表現を避ける。「シームレスに連携」「生産性を最大化」は書かない
- **全角コロン「：」をテキスト中で使わない**（AI 生成テキストの典型パターン）。「〇〇できます：」は「〇〇できます。」で終えてリストを始める。「注意点：」は見出しにする。`（例：2週間ごと）` のような括弧内の補足だけ許容
- frontmatter の `description` は体言止めで結ぶ（「〇〇のガイド」）。「紹介します」「解説します」のようなメタ宣言を書かない
- トーン（研究者ペルソナ、感嘆符の扱い）は [copywriting.md](./copywriting.md) に従う

## 英語のルール

- Short sentences. One idea per sentence.
- Common words. Prefer "use" over "utilize", "help" over "facilitate".
- Clear subject and verb. Say who does what.
- Active voice. "Dayopt saves your record" — not "your record is saved".
- Avoid vague SaaS words: empower, leverage, seamless, robust, optimize, streamline, supercharge, unlock.

## Bad / Good examples

### 日本語

| Bad                                                                                          | Good                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| タイムボクシング機能を活用することで、時間管理プロセス全体のシームレスな最適化が実現できます | 予定を時間枠に割り当てると、1 日の使い方が見えます |
| データドリブンな意思決定を促進するインサイト機能                                             | 先週の記録と比べて、今週の傾向を表示します         |
| 本機能はユーザーエクスペリエンスの向上を目的として実装されました                             | 保存が 1 クリックで終わるようになりました          |

### English

| Bad                                                                             | Good                                    |
| ------------------------------------------------------------------------------- | --------------------------------------- |
| Leverage our robust analytics to seamlessly optimize your productivity workflow | See where your time went this week      |
| This feature empowers users to unlock deeper insights                           | This chart shows your focus time by day |
| The record creation process has been streamlined for an enhanced experience     | Creating a record now takes one click   |

## 最終チェック

書き終えたら [review-checklist.md](./review-checklist.md) で確認する。Docs / Blog / Release notes の役割分担は [docs-policy.md](./docs-policy.md) に従う。
