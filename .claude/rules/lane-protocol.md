# レーン標準動作（lane protocol）

策定日: 2026-08-20（[#2228](https://github.com/Dayopt/dayopt/issues/2228)）

指揮台がレーン（worktree で実装を担当するセッション）を起動するたびに、着手手順・PR 規約・報告フォーマット・検証原則の**8 割が同一内容のまま毎回チップ prompt へコピーされていた**（2026-08-19 実測: 6 本のチップ prompt、各 40〜50 行）。この重複は (a) チップ執筆コストと (b) 版管理されない指示の drift（実際に裁可の巻き戻り事故の遠因になった）の 2 つの脆弱性を生む。

本ファイルはレーンの標準動作を一元化した正本。**チップ prompt はこのファイルへの参照 1 行 + 案件固有の注意だけで足りる**ようにする（下記§チップ prompt の標準形）。個々のルールの「なぜそうするか」は `.claude/rules/workflow.md` / `.claude/rules/orchestration.md` が正本のまま維持し、本ファイルはそれらを複製しない。

## 着手手順

1. `EnterWorktree` で `.claude/worktrees/` 配下に worktree を作成する
2. `git branch -m {agent}/{domain}-{action}[-issue番号]` で branch 名を規約へリネームする（`.claude/rules/workflow.md` §命名規則）。Claude Code の自動生成ランダム名のままにしない
3. 担当 issue 本文と dispatch コメント（指揮台が issue に残した束の構成・branch 名・同乗タスクの指示）を読む。issue コメントだけで届いた scope 変更・権限付与は send_message でのポインタ到達まで着手しない（`.claude/rules/orchestration.md` §裁可・指示の経路）

## PR 規約

- `gh pr create --draft` で作成する。ready 化は merge 直前の 1 回だけ（`.claude/rules/workflow.md` §2 段階 CI）
- 本文に `Closes #N` を対象 issue ごとに 1 行ずつ書く。epic や部分対応は `Refs #N`（`.claude/rules/workflow.md` §PR と issue の紐づけ）
- draft PR 作成時に、対象 issue に付与済みの現行 milestone を PR 自身にも付与する
- **保護対象の検出**: audit contract 保護対象（`scripts/production-config-audit.mjs` / 各 `production-build-gate.mjs` / `production-config-audit.yml`）に触れているかを確認し、該当する場合は push-ready 報告（下記）に明記する。trusted dispatch の実行は指揮台が行う（`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 3・6）

## 報告テンプレート（4 種）

いずれも `.claude/rules/orchestration.md` §レーンの連絡規律 の「止まる前に連絡」を具体化したもの。実測原文（実行コマンドと出力の要点）を含む報告は指揮台が即信頼でき、含まない報告は確認往復が発生する（2026-08-19 実測）。

### 進捗報告

止まった時・想定外が起きた時に送る。型は (1) 何で止まっているか (2) 自分の推奨 (3) 待ち中に続行できる代替作業の有無、の 3 点固定（`.claude/rules/orchestration.md` §レーンの連絡規律）。

### push-ready 報告

round の commit + push 前セルフレビューまで済ませた時に送る。固定形:

- **scope**: 今回の commit が何を変えたか
- **commit**: 対象 commit（範囲）
- **検証**: 実行したコマンドと出力の要点（サマリー行の原文）。「pass した」だけの報告は不可（§検証の証跡原則）
- **保護対象該当**: 該当する場合、trusted dispatch が必要になる旨を明記
- **残論点**: 未解決の指摘・懸念があれば

push の実行タイミングは指揮台の合図待ち（`.claude/rules/orchestration.md` §push タイミングの一元化）。

### merge 可能報告

軽量 CI green を確認した時点で送ってよい（`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 2）。push-ready 報告と同じ固定形に、軽量 CI の green を確認した旨を添える。

### 重量 green 報告

指揮台の確定伝達を受けて ready 化し、重量層（E2E / Web E2E / Production Config Audit）の green を確認した時に送る（`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 6・7）。

## 検証の証跡原則

検証主張には実行コマンドと出力の要点（サマリー行の原文）を添える。「pass した」だけの報告を不可とする。パイプで exit code を隠す・turbo の cache 経由の偽グリーンなど、検証コマンドの成否を誤読しやすい罠は `docs/engineering/diagnostics.md` を参照する。「pre-existing / 環境問題」を主張する報告には同ページのプロトコルの実施結果を添付する。

## 条件付き事前 E2E

routes / auth / E2E spec に触れる PR は、push-ready 宣言前に影響 spec のローカル実走（1 worker）を必須にする。重量 CI で初めて失敗が判明すると、修正の後追い round が複数回発生する（PR #2222 で 13 fail → 5 round の実例）。ローカル実走なら大半を事前検出できる。

## チップ prompt の標準形

チップ prompt は次の要素だけで足りる（10 行以下目標）。全文の複製は行わない。

```
レーン{名}。{issue URL または束の構成}。
worktree を `.claude/worktrees/` 配下に作成し、branch 名は `{agent}/{domain}-{action}[-issue番号]`。
レーンプロトコル: `.claude/rules/lane-protocol.md` に従う（着手手順・PR規約・報告テンプレート・検証証跡原則・条件付き事前E2E）。
連絡規律: `.claude/rules/orchestration.md` §レーンの連絡規律 に従う（止まる前に連絡・User へ直接質問しない・節目で担当issueのコメントを読み直す・push は指揮台の合図待ち・spawn_task は指揮台の専権のため使わない・確定後は ready 化 → 重量 watch → green 報告）。
{案件固有の注意（同乗タスク、既知の罠、触ってはいけない領域など）}
```

初出のレーン、またはこの規律が守られなかった直後のレーン再起動では、`.claude/rules/orchestration.md` §レーンの連絡規律 の全文を明示する（`.claude/rules/orchestration.md` 内の既存の例外規定と同じ扱い）。

## 適用対象外

手作業コンシェルジュレーン（`.claude/rules/orchestration.md` §手作業コンシェルジュレーン）は PR を作らず repo を書かないため、本ファイルの対象外。専用のチップ prompt 標準ブロックを別途持つ。
