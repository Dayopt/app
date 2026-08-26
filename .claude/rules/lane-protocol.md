# レーン標準動作（lane protocol）

策定日: 2026-08-20（[#2228](https://github.com/Dayopt/dayopt/issues/2228)）

指揮台がレーン（worktree で実装を担当するセッション）を起動するたびに、着手手順・PR 規約・報告フォーマット・検証原則の**8 割が同一内容のまま毎回チップ prompt へコピーされていた**（2026-08-19 実測: 6 本のチップ prompt、各 40〜50 行）。この重複は (a) チップ執筆コストと (b) 版管理されない指示の drift（実際に裁可の巻き戻り事故の遠因になった）の 2 つの脆弱性を生む。

本ファイルはレーンの標準動作を一元化した正本。**チップ prompt はこのファイルへの参照 1 行 + 案件固有の注意だけで足りる**ようにする（下記§チップ prompt の標準形）。個々のルールの「なぜそうするか」は `.claude/rules/workflow.md` / `.claude/rules/orchestration.md` が正本のまま維持し、本ファイルはそれらを複製しない。

## 着手手順

1. `EnterWorktree` で `.claude/worktrees/` 配下に worktree を作成する
2. `git branch -m {agent}/{domain}-{action}[-issue番号]` で branch 名を規約へリネームする（`.claude/rules/workflow.md` §命名規則）。Claude Code の自動生成ランダム名のままにしない
3. 担当 issue 本文と dispatch コメント（指揮台が issue に残した束の構成・branch 名・同乗タスクの指示）を読む。issue コメントだけで届いた scope 変更・権限付与は send_message でのポインタ到達まで着手しない（`.claude/rules/orchestration.md` §裁可・指示の経路）
4. **着手時（branch リネーム直後）に Draft PR を即開く**（2026-08-20、[#2264](https://github.com/Dayopt/dayopt/issues/2264)）。commit が無ければ空 commit で開いてよい。対象 issue に付与済みの現行 milestone を PR 自身にも同時に付与する。Draft PR 一覧がそのままレーンのダッシュボードになり、盤面 issue §2 との突き合わせが楽になる
5. **Draft PR を開いた直後に、PR テンプレートの「復唱」「作業計画」「触るファイル領域」を記入する**（2026-08-26、[#2415](https://github.com/Dayopt/dayopt/issues/2415)）。復唱は**チケット本文のコピペ禁止** — 何を・なぜ・どこまでやるかを自分の言葉で書く。指揮台はレーン起動直後に復唱だけを読み、チケットとの齟齬があれば issue コメントで即訂正する。実装後に誤解が判明すると往復 1 日、復唱段階なら 5 分で潰せる。**コピペや言い換えで埋めると誤解検知の機能そのものが死ぬ**ため、埋まっていること自体は目的ではない

## PR 規約

- Draft PR は §着手手順 手順 4 のとおり着手時に開く。ローカル検証（`pnpm check` + pre-push フック）が済んだら、**指揮台の合図を待たずに自己判断で ready 化する**（2026-08-26 改訂、[#2415](https://github.com/Dayopt/dayopt/issues/2415)。初出は 2026-08-20、[#2263](https://github.com/Dayopt/dayopt/issues/2263)。`.claude/rules/orchestration.md` §レーン主導の push・ready化 が正本）。**draft 中は Docs Guard 以外の CI が走らない**ため、CI green の確認は ready 化の後になる
- 本文に `Closes #N` を対象 issue ごとに 1 行ずつ書く。epic や部分対応は `Refs #N`（`.claude/rules/workflow.md` §PR と issue の紐づけ）
- **保護対象の検出**: audit contract 保護対象（`scripts/production-config-audit.mjs` / 各 `production-build-gate.mjs` / `production-config-audit.yml`）に触れているかを確認し、該当する場合は ready 化前に指揮台へ申告する（trusted dispatch が要るため）。trusted dispatch の実行は指揮台が行う（`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 2）

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

push の実行は指揮台の合図を待たず自己判断で行う（2026-08-20 改訂、[#2263](https://github.com/Dayopt/dayopt/issues/2263)）。**追従（update-branch）だけは今も指揮台の合図待ち**（`.claude/rules/orchestration.md` §追従とマージ順の采配）。

### レビュー待ち報告

ローカル検証 → 自己判断で ready 化 → **ready 化で起動する CI**（Static Checks / Unit Tests / Docs Guard、保護対象該当時のみ Production Config Audit）を watch → green 確認、まで進めた時点で送る（2026-08-26 改訂、[#2415](https://github.com/Dayopt/dayopt/issues/2415)。`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 2）。push-ready 報告と同じ固定形に、CI green を確認した旨を添える。この報告が指揮台のクロスレビュー実施のトリガーになる。

**push 前セルフレビュー（`.claude/rules/workflow.md` §push 前の敵対的セルフレビュー）で実行した subagent の role 一覧と生出力を添付する**（策定日: 2026-08-25、[#2374](https://github.com/Dayopt/dayopt/issues/2374)）。要約しない — findings ゼロならその旨の原文をそのまま貼る。指揮台はこれを `pr-cross-review` スキル（`.claude/skills/pr-cross-review/SKILL.md` 手順 2〜3）の出発点として読む。自動委任条件（`.claude/rules/ai-behavior.md` §Read-only delegation）に非該当で subagent を回していない場合は「非該当」と明記する。

### fix round green 報告

クロスレビューの指摘に対応した時（**draft へ戻さず ready のまま** 1 round = 1 push で fix を積む）、CI green を再確認して送る（`.claude/rules/orchestration.md` §指揮台の merge シーケンス 手順 4）。ready のまま積むので CI は通常どおり走る（draft skip の影響を受けない）。

**報告送信は round 完了の一部であり、送っていない fix round は完了していない**（策定日: 2026-08-24、[#2355](https://github.com/Dayopt/dayopt/issues/2355)）。thread resolve / green 確認が終わったら、他の作業へ移る前に送る。2026-08-24、fix round・全 green・thread 3/3 resolve まで完了していたのに報告を送らず PR が指揮台の認知外で停止した実例がある（PR #2350。詳細は日次盤面 #2326 コメント列）。

**追従（update-branch）の「指揮台の合図待ち」は fix round 文脈でも適用される**（`.claude/rules/orchestration.md` §追従とマージ順の采配）。fix round 中に main が動いていても、レーンが自己判断で追従してはいけない。2026-08-24、PR #2350 のレーンが fix round 中に追従を自己実行した実例がある（後続 PR が無く実害はなかったが、逸脱として記録）。

## 停止条件

策定日: 2026-08-26（[#2415](https://github.com/Dayopt/dayopt/issues/2415)）

レーンは静かに詰まる。次のいずれかに当たったら、**試行を続けずに止めて報告する**。報告は §進捗報告 の 3 点固定型（何で止まっているか / 自分の推奨 / 待ち中に続行できる代替作業の有無）を使い、担当 issue へコメントする（`.claude/rules/orchestration.md` §レーンの連絡規律「止まる前に連絡」の具体化であり、複製ではない）。

- **同種のエラーに 3 回連続で失敗した。** 試行を中止し、「何を試したか・エラー内容・自分の仮説」を添えて指揮台の指示を待つ。3 回目と 4 回目の間に質的な差は生まれにくく、それ以降は同じ形の試行を繰り返して時間だけを消費する側に倒れる
- **scope 外のファイルを変更しないと解決できないと判明した。** PR テンプレートの「触るファイル領域」で申告した範囲がその scope。黙って広げず、停止して報告する（束ねの判断と writer 境界は指揮台が持つ。`.claude/rules/ai-behavior.md` §Writer ownership）

**エスカレーションは失敗ではなく正しい動作である。** 止まって報告したことを減点しない。逆に、止まるべき場面で試行を続けて時間を溶かすこと、および黙って scope を広げることの方が損失が大きい。この明文がないと、レーンは「自力で解決するべきだ」と推論して沈黙する側へ倒れる。

自己申告であるこの節に対し、機械側の二段目が朝編成ブリーフの「停滞疑いレーン」検出（`scripts/night-watch/morning-brief.mjs`）にあたる。**片方がもう片方の省略理由にならない** — 検出されるかどうかに関わらず、上記に当たったら自分から報告する。

## 検証の証跡原則

検証主張には実行コマンドと出力の要点（サマリー行の原文）を添える。「pass した」だけの報告を不可とする。パイプで exit code を隠す・turbo の cache 経由の偽グリーンなど、検証コマンドの成否を誤読しやすい罠は `docs/engineering/diagnostics.md` を参照する。「pre-existing / 環境問題」を主張する報告には同ページのプロトコルの実施結果を添付する。

## 1Password 不要のローカル実アプリ検証（策定日: 2026-08-20、[#2253](https://github.com/Dayopt/dayopt/issues/2253)）

worktree のレーンセッションは `pnpm dev`（op-run 前提）を起動できず、UI 確認が Storybook のみに縛られると認識されていたが、以下の経路でローカル Supabase を使った実アプリ検証が可能。Storybook が正本の位置づけは変わらないが、実アプリでの確認が要る場面（統合的な動作確認、Storybook で再現しにくい状態遷移）でこの手順を使う。

1. **Docker Desktop + `supabase start` が前提**（`supabase-local` MCP と同じ前提。§Before use は `.claude/rules/mcp-usage.md` 参照）
2. ローカル Supabase の env を直接注入する:
   ```bash
   eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
   ```
3. `:3000` の衝突を起動前に確認する（複数レーンが並走する場合、他レーンが既に使用中の可能性がある）:
   ```bash
   nc -z localhost 3000 && echo "使用中 — 指揮台へポート調整を依頼" || echo "空き"
   ```
4. env を直接渡して `dev:raw` を起動する（`.env` ファイルは読み書きしない — 引き続き禁止のまま）:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY pnpm --filter @dayopt/product dev:raw
   ```
5. 認証は `probe:setup`（service role のスローアウェイ user + storageState 生成）、または同型の手動 user 作成で行う
6. **検証後の後始末は必須**: スローアウェイ user の削除（`scripts/admin-delete-user.sh`）とサーバー停止

**注意**: ローカル env のキー（`ANON_KEY` 等）は公知値であり secret ではない（ローカル Supabase の固定シークレット）。ただし `.env` / `.env.local` 系ファイルの読み書き境界（`docs/operations/secrets.md` §AI エージェントの env ファイル境界）は変わらず、この手順でも触らない。検証コマンドの成否確認・偽グリーンの罠は `docs/engineering/diagnostics.md` を参照する。

## 条件付き事前 E2E

routes / auth / E2E spec に触れる PR は、push-ready 宣言前に影響 spec のローカル実走（1 worker）を必須にする。重量 CI で初めて失敗が判明すると、修正の後追い round が複数回発生する（PR #2222 で 13 fail → 5 round の実例）。ローカル実走なら大半を事前検出できる。

## チップ prompt の標準形

チップ prompt は次の要素だけで足りる（10 行以下目標）。全文の複製は行わない。

```
レーン{名}。{issue URL または束の構成}。
worktree を `.claude/worktrees/` 配下に作成し、branch 名は `{agent}/{domain}-{action}[-issue番号]`。
レーンプロトコル: `.claude/rules/lane-protocol.md` に従う（着手手順・復唱の記入・PR規約・報告テンプレート・停止条件・検証証跡原則・条件付き事前E2E）。
連絡規律: `.claude/rules/orchestration.md` §レーンの連絡規律 に従う（止まる前に連絡・User へ直接質問しない・節目で担当issueのコメントを読み直す・push/ready化/重量watchは自律的に進める・追従だけは指揮台の合図待ち・spawn_task は指揮台の専権のため使わない）。
{案件固有の注意（同乗タスク、既知の罠、触ってはいけない領域など）}
```

初出のレーン、またはこの規律が守られなかった直後のレーン再起動では、`.claude/rules/orchestration.md` §レーンの連絡規律 の全文を明示する（`.claude/rules/orchestration.md` 内の既存の例外規定と同じ扱い）。

## 適用対象外

手作業コンシェルジュレーン（`.claude/rules/orchestration.md` §手作業コンシェルジュレーン）は PR を作らず repo を書かないため、本ファイルの対象外。専用のチップ prompt 標準ブロックを別途持つ。
