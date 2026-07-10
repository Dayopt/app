---
description: 並行レーン orchestration の指揮者運用 — tracking issue から worker へ issue を渡し、新規作業を issue 化し、定期棚卸しで gap を検出する
---

# /dispatch

feature 開発と並行する非 feature 作業を issue ベースで回す指揮者（conductor）の定常運用。**どのモデルでも実行できる**ことを前提に、判断基準をすべて本ファイルに明文化する。個人メモリや特定モデルの記憶に依存しない。

**正（source of truth）**: 現行の orchestration tracking issue（2026-07 時点は #1567）。レーン定義・凍結リスト・推奨着手順はそこを読む。本ファイルは「手順」、tracking issue は「状態」。

引数で操作を指定する: `/dispatch`（渡す）/ `/dispatch intake <内容>`（起票）/ `/dispatch sweep`（棚卸し）/ `/dispatch unfreeze`（凍結解除判定）。引数なしは操作 A。

## 操作 A: dispatch — issue を worker に渡す

1. tracking issue を読み、「今すぐ worker 可」から候補を選ぶ（ユーザー指定があればそれを優先）
2. **衝突チェック**: 候補 issue が触るファイル・ディレクトリを、(a) 進行中 feature の設計書（例: `docs/projects/time-model-split/` の該当 Step）の対象、(b) 他の in-progress issue（`status:in-progress` ラベル）の対象、と突合する。重なれば渡さず次の候補へ
3. **凍結チェック**: `status:blocked` が付いていないこと、tracking issue の凍結リストに載っていないことを確認
4. issue 本文を **handoff-quality** に補強する（下記テンプレート）。worker が repo 探索なしで着手できる密度が基準
5. `status:in-progress` ラベルを付け、tracking issue の checklist にコメントで dispatch 先（Sonnet / Codex / その他）を記録
6. worker への指示は issue URL + 「本文の受け入れ条件と検証コマンドに従う」だけで済む状態にする

### handoff-quality テンプレート（issue 本文に含める 4 要素）

```markdown
## 背景 — なぜやるか。関連 issue / docs / 過去 PR へのリンク

## やること — 番号付き手順。対象ファイル path を明記

## 注意 — 既知の罠、触ってはいけない領域、関連 skill（例: supabase skill のフロー）

## 検証 — pass すべきコマンド（pnpm check 等）と確認観点
```

### 規模別の渡し方

- size s/xs: 直接実装でよい。plan 不要
- size m/l: worker に plan を先に出させ、`/plan-review` を通してから実装
- spike / 設計判断を含む issue: worker に渡さない。最上位ティア（`.claude/rules/ai-behavior.md` のティア表参照）のセッションで実施

## 操作 B: intake — 新しい作業を issue 化する

作業依頼・発見事項・監査結果が issue の外にある状態を作らない。

1. `gh search issues` で既存 issue との重複を確認（close 済み含む）
2. 重複なら既存 issue に本文追記 or コメントで統合。新規なら handoff-quality で起票
3. ラベルは既存体系のみ使う: `type:*` / `priority:*` / `area:*` / `size:*` / `quality:security` / `ops` など。**新ラベルを作らない**
4. tracking issue の該当レーンに追記し、担当区分（worker 可 / 最上位ティア / 🔒 prod 操作）を付ける

## 操作 C: sweep — 定期棚卸しで gap を検出する

月次（`/gardening` と同時期）または大きな節目に実施。以下の「issue の外に作業が溜まりやすい場所」を機械的に確認し、見つけたら操作 B で起票する:

- [ ] Supabase advisors: `get_advisors`（security / performance）の WARN が issue 化されているか
- [ ] Dependabot security alerts: `gh api repos/Dayopt/dayopt/dependabot/alerts?state=open` が 0 件か
- [ ] `docs/operations/log/` の監査・incident ログ末尾の「残タスク」が issue 化されているか
- [ ] NOT_PLANNED で close された issue の中身が、実は未完了のまま受け皿を失っていないか
- [ ] 生成系スクリプト（`api:spec` / `types:generate` / `rls:snapshot`）が現在も exit 0 で通るか
- [ ] open PR で 2 週間以上動きがないものの扱い（rebase / close / 引き継ぎ）

## 操作 D: unfreeze — 凍結解除の判定

tracking issue の凍結リストにある issue は、記載された解除条件（例: time-model-split Step 8 cutover 完了）を満たしたときのみ解除する。

1. 解除条件の達成を設計書・merge 済み PR で確認する
2. 凍結 issue の `status:blocked` を外し、**着手前に設計を現状に合わせて見直す**コメントを残す（凍結中に前提が変わっているため、本文の対象ファイル・手順は書き直し前提）
3. tracking issue の凍結リストからレーンへ移す

## tracking issue が消化されたら

checklist が全て閉じたら tracking issue を close し、次の棚卸し（操作 C をフル実施）を起点に後継 tracking issue を同じ構成（レーン定義 / 凍結リスト / 着手順 / 運用ルール）で新設する。本ファイル冒頭の issue 番号を更新する。
