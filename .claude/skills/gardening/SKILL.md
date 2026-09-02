---
name: gardening
description: ユーザーが月次の改善ループ（gardening）の実施を明示依頼した時、または `/gardening` として明示起動された時に発動。`pnpm ai:usage` と `pnpm trace` の実測から AI 工場の 4 問に答え、変えるのは月に 1 つだけ決めて `docs/decisions.md` へ `結果(未):` 付きで残し、前月の `結果(未):` を回収し、シンプルルール 5 箇条と削除候補・security sweep を回す。日次の作業判断（`dispatch` skill の領域）や自動実行の設計では発動しない。
---

# 月次改善ループ（gardening）

目的は「仮説 → 1 か月運用 → 実測 → 判定」を **人が月 1 回 30 分で閉じる** こと。Uber の factory loop（Outcome 定義 → 運用 → trace 分析）の Dayopt 版で、benchmark は持たず本番を benchmark とし、月を試行の単位にする（`docs/decisions.md` 2026-09-02）。

**engine は月初に User が開くローカル session**。`ai:usage` が読む session ログはこの Mac にしか無く、Routine や GitHub Actions では走らせられない（2026-09-02 実測: gardening の Routine は存在せず、8 月は人が代行した 1 回のみ）。自動パートは持たない。

## When to Use

**明示発動型** — 月初に User が `/gardening` を起動した時だけ発動する。

- 月初の改善ループを回す時
- 前月に `結果(未):` 付きで書いた決定の判定期限が来た時
- 月の途中でも「変数を 1 つ変えたい」判断が出た時（その場合も本手順 1〜2 だけを回す）

## 手順（30 分）

0. **L0 計測**（数十秒、LLM は結果を読むだけ）
   - `pnpm ai:usage`（既定 = 前月の暦月）
   - 前月 merge PR のうち Codex P1 が付いたもの、ready 後の commit が 3 回を超えたものを `pnpm trace <PR>` で見る（候補は `gh pr list --state merged --search "merged:YYYY-MM-01..YYYY-MM-31" --json number` から）
1. **AI 工場の 4 問**に yes / no で答える（`routing` skill の目標状態との距離）
   - Haiku の構成比は上がったか（表 A）
   - 編集なしの Opus + Fable 件数は反証レビューの回数と同程度か（表 E）
   - Main（Opus / Fable）の Edit 中央値は 1 桁か（表 E Main session）
   - subagent の着手までの探索 turn は下がったか（表 E）
   - no が複数あっても **変えるのは 1 つ**。変えたら `decisions.md` に `結果(未):`（翌月または翌々月の判定条件）付きで 1 行追記する（`decision` skill）
2. **前月の `結果(未):` を回収する**。判定材料が揃っていれば `結果(YYYY-MM-DD):` 行を追記して恒久化 / 撤回を明記する。揃っていなければ期限を 1 行で延ばす
3. **判断層の検証**（`AGENTS.md` §シンプルルール）: ①今月このルールに戻った場面はあったか（1 度も戻らないルールは削る候補）②無言で破られたルールは無いか ③先月触らなかった機能はどれか（ルール 5。削除候補は `dispatch` intake で起票）
4. **外部レビューの class**: `trace` の Codex P1 / P2 で同じ構造の指摘が当月 2 回以上、または通算 2 回以上なら機械化（test / lint / CI）の issue を起票する
5. **security sweep**: cloud Supabase MCP をオンデマンド登録して `get_advisors`（security）、あわせて `pnpm security:check`。所見は issue、使用後に登録解除（`mcp-usage` skill）
6. **成果物**: ルール・skill・docs に変更があれば docs 束 PR（`claude/gardening-YYYY-MM`）。無ければ **無音**。journal ファイルも常設 issue も作らない（数値は `pnpm ai:usage --since` でいつでも再計算できる。残すのは判断だけで、それは `decisions.md` に入る）

四半期に 1 回（1 / 4 / 7 / 10 月）だけ、手順 6 の前に `docs-audit` skill と `audit-ai-config` skill を回す。`claude-security` の深掘りスキャン（数百万 token）は User の明示 opt-in がある時だけ、他のレーンを止めて単独で走らせる。

## When NOT to Use

- 日次の作業判断・issue の起票・sweep（`dispatch` skill の領域）
- 自動実行の設計や cron の追加（本 skill は engine を持たない設計）
- リリース作業（`releasing` skill の領域）

## 守ること

- **1 か月に 1 変数**。効いたかを帰属できない変更を重ねない
- **足したら 1 つ削る**。ルール・skill の行・L0 カタログの行はどれも同じ。2 か月使われない行は削る
- **数値を機械的に fail 扱いにしない**。4 問の no は判断の材料であって、それ自体で何かを止めない
- 判断は `decisions.md` に、所見は issue に。会話の中だけに置かない
