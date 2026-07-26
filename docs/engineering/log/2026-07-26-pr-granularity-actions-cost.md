---
status: frozen
date: 2026-07-26
---

# PR 粒度の既定を「1 issue = 1 PR」から「機能のまとまり単位で束ねる」へ反転する

## 背景・当時の前提

repo は 2026-07-24 に private 化し（[#1732](https://github.com/Dayopt/dayopt/pull/1732)）、同時に CI の粗い無駄は取り切った（11 job → 4 job、Docs Guard 4 job → 1 job、quality-gate aggregator 廃止、Dependabot monthly 化）。翌日 [#1735](https://github.com/Dayopt/dayopt/pull/1735) で main push CI も廃止した。

ただしこの一連の判断は commit message と YAML の inline コメントにしか残っておらず、decision ログが無い。本ログでその baseline も合わせて記録する。

粗い無駄を取り切った後に残った最大のコスト変数は **PR 本数そのもの**だった。Actions API で実測（2026-07-24〜25、job ごと 1 分切り上げ・Linux 1x）:

| workflow                      | job 数 | 実測 wall-clock                                    | 課金分/run |
| ----------------------------- | ------ | -------------------------------------------------- | ---------- |
| `ci.yml`                      | 4      | static 3.4 / e2e 2.5 / build&test 6.1 / web 3.2 分 | 18         |
| `integration.yml`             | 1      | 2.9 分                                             | 3          |
| `docs-guard.yml`              | 1      | 34 秒                                              | 1          |
| `production-config-audit.yml` | 1      | 15 秒                                              | 1          |
| `release.yml`                 | 1      | median 3.1 分                                      | 4          |

- PR あたりの CI run は **1.75 回**（21 時間で PR 起因 21 run / 12 branch）。`concurrency: cancel-in-progress` が効くため、コストは push 回数ではなく **PR 本数**にほぼ比例する
- **PR 1 本 ≈ 44 課金分**。直近 30 日の merge 済み 151 PR で **≈ 6,650 分/月**（Free 枠 2,000 分、超過 $0.008/分で月 $35 前後）
- `branch:finish` の up-to-date gate により、他 PR が main に入るたび追従 push と CI 再実行が要る。**並行 PR N 本で追加 CI が O(N²)** に効く

コストだけの話ではない。個人開発で内部レビュー（read-only subagent）を前提にできる以上、PR を小さく保つ便益より、本数に比例するコストと運用オーバーヘッドの方が大きいという運用判断が主で、課金がその forcing function になった。

## 決定と理由

**PR は機能のまとまり単位で束ねるのを既定とし、サイズを理由に分割しない。** 分割は安全性由来のみに限る（不可逆 migration の隔離 / code removal と destructive migration の混在回避 / 独立して検証・revert したい変更）。canonical は `.claude/rules/workflow.md` §PR 粒度。

新しい仕組みの発明ではなく **既定の反転**である。[#1657](https://github.com/Dayopt/dayopt/pull/1657) が #1534 / #1535 を 1 PR に束ねた実績が既にあり、当時は「1 issue = 1 PR の意図的な例外」としてユーザーの明示指示を根拠にしていた。その例外を既定にし、分割する側に理由を求める形にした。

束ねた PR はレビュー負荷が上がるため、**複数 issue / 複数 Step を束ねた PR には merge 前の read-only subagent クロスレビューを必須**にした（人間の目視だけに依存しない）。

あわせて CI 側で 2 つ入れた:

- **coverage 廃止**: `apps/product/vitest.config.ts` に `coverage.thresholds` が無く artifact upload も無いため、生成したレポートは runner 破棄とともに捨てられていた。実行するテストは完全に同一（どちらも `--project unit run`。ローカル実測で 243 files / 2278 tests が一致）。**ただしコスト削減効果は実測で確認できなかった**。見積もりを 2 回下方修正している:

1. 当初: `Product unit tests with coverage` step が 215 秒だったため「その大半が計装コスト」と推定し、課金 7 → 4 分（3 分減）と見積もった
2. ローカル実測: coverage あり 155.1 秒 / なし 141.6 秒で差は 13.4 秒（9.5%）。課金 7 → 6 分（0〜1 分減）に修正
3. **CI 実測（PR #1738）: 課金分は 7 → 7 分で変化なし**。step 自体も 215 秒 → 259 秒と逆に増えた。ai-review の追加テストは `test:scripts` 側なので product job には影響しない。runner 変動（1 サンプルずつの比較）が計装コストを完全に上回っている

したがって**この変更のコスト削減は 0 と見なす**。採用理由は「閾値 gate も artifact upload も無く、誰も読まないレポートを毎回生成していた」という一点に置く。実行するテストは完全に同一（ローカルで 243 files / 2278 tests の一致を確認）で検証内容の損失がゼロなので、削減が無くても入れる価値はあるが、**課金削減の根拠には使えない**

- **docs 専用 `paths-ignore`**: docs / rules のみの変更で 4 job を走らせない。公開 MDX（`apps/web/content/**`）や hooks の `.sh` を巻き込まないよう対象を最小限に絞った。直近 52 merge のうち docs / rules のみは 5 件（10%）だが、うち 1 件は `.sh` を含むため実効は 6〜10% 程度

この 2 つを実測で詰めた結果、**CI 側に残っていた削減余地はほぼ無かった**。coverage 廃止は 0、paths-ignore は docs のみの PR（直近 52 merge 中 5 件）に限られる。#1732 の job 統合で粗い無駄は取り切れており、**削減の主レバーは PR 本数（≈50%）以外に無い**という結論が、当初の想定より強い形で確定した。

見積もりを 2 回下方修正したこと自体が教訓になる。CI の step 時間から「その大半が X のコスト」と推定するのは、runner 変動を考えると根拠として弱い。今後 CI 最適化を検討する時は、**変更前後を同条件で複数回計測してから**判断する。

`paths-ignore` の前提として `scripts/git/finish-branch.sh` に **「成功した check が 1 件も無ければ停止」** のガードを追加した。既存の failure / pending 判定は `statusCheckRollup` が空だと両方 0 件になり、「CI が 1 本も走っていない PR」を green と区別できないまま素通りしていた。private + Free plan では GitHub 側の required check 強制が効かないため、このスクリプトが唯一の防波堤になる。job 名（絵文字入り）へのハードコードは rename に弱いので、名前に依存しない形にした。

### supersede の範囲

[2026-07-10-parallel-lanes-orchestration.md](./2026-07-10-parallel-lanes-orchestration.md) の **決定 3 の「1 issue = 1 PR = 1 worker セッション。同一 feature dir の並行 dispatch 禁止」の 1 行だけ**を supersede する。同ログの決定 1（refactor 凍結）・決定 2（issue 補充）・レーン定義は有効なまま。凍結リストと着手順の正は引き続き tracking issue #1567。

## 却下した選択肢と、なぜ捨てたか

実測でコスト削減効果が無い / 小さいと分かったもの:

| 案                            | 実測                                                      | 却下理由                                                 |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Playwright ブラウザキャッシュ | install step は e2e 26 秒 / web 25 秒                     | 復元コストと相殺し、1 分切り上げでは削減 0〜1 分         |
| e2e + web job の統合          | 削減 ~1 分/run（全体の 4%）                               | e2e が直列化し wall-clock 3.2 → 5.1 分。check 名も変わる |
| `release.yml` の wait 短縮    | median 3.1 分（70 分は timeout 上限であって実測ではない） | そもそもコスト源ではない。production 経路なので別途      |

**draft PR 運用**（`if: draft == false` + `types: ready_for_review`）は残り約 40% の効果が見込めるが見送った。理由は 3 つ: (a) draft にするだけでは `pull_request` は発火するため job-level `if` が必須、(b) job skip で作られる `conclusion: skipped` の check は上記ガードでも「成功 0 件」側に落ちるか素通りするかの設計判断が別途要る、(c) `Production Config Audit` は required status なので個別対応が要る。安全側の設計が固まってから再検討する。

**`integration.yml` の paths 絞り込み**は、現状 CI と 1:1 で発火しており削減余地はあるが、絞りすぎると migration / RLS の検証を落とすため今回は触らない。

## 影響・やること

- 今後の PR は epic 全体 / 関連 issue 複数を 1 branch・1 PR に束ねる。branch 名の issue 番号は代表 issue または epic 番号を使う
- `dispatch` skill の衝突チェックは「渡さない」から「同一 worker に束ねる」へ変わった。束ねた場合の size 判定は合計で行う
- `plan-critic` の over-engineering flag は 1 plan の Goal からの逸脱だけを見る。複数 plan が同一 PR に同居すること自体は flag しない
- **要確認（外部設定）**: CodeQL は repo 内に workflow ファイルが無いが `docs/engineering/infra.md` は「継続」と記載している。GitHub の default setup で有効なら private repo では Actions 分数を消費する。GitHub 設定画面での確認が要る
- **事後確認**: `paths-ignore` の実効は docs のみの PR で確認する（本 PR は `ci.yml` を含むため skip されない）
- tracking issue #1567 の運用ルール記載は、本決定に合わせて更新する
