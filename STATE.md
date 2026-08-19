# STATE.md（最終更新: 2026-08-19 / 生成基点 main@61ec8288 / pnpm state:generate）

> STATE.md は判断のための現在地の地図であり、正本ではない。正本は GitHub issue と open PR。
> §2〜§5 は `pnpm state:generate` が機械生成する（手で編集しても次回生成で上書きされる）。
> §1 だけが手動更新（issue コメント経由の指示を受けて lane が編集する）。
> サイズ上限 100 行。詳細は CLAUDE.md §運用基盤（STATE.md）参照。

## 1. 北極星と今週の最優先

- V1.0 リリース: 2026-10-01
- 今週の最優先: epic #2181 完了後の仕上げ — dogfooding 修正束（#2233 ほか）と Inspector 右パネル化（#2215）を v0.35（期限 8/26）へ収束させる

## 2. 進行中レーン（open PR、機械生成）

<!-- STATE:GENERATED:LANES:START -->

（open PR なし）
<!-- STATE:GENERATED:LANES:END -->

## 3. 次にやるキュー（status:ready、機械生成）

<!-- STATE:GENERATED:QUEUE:START -->

1. [#2218](https://github.com/Dayopt/dayopt/issues/2218) chore(tags): 残余のtag系依存を撤去する（Step 5完了後）
2. [#2163](https://github.com/Dayopt/dayopt/issues/2163) chore(build): bundle budget の preview 補正を成分分解して再較正する（Sentry 分と Supaba…

<!-- STATE:GENERATED:QUEUE:END -->

## 4. 要判断（type:discussion の open issue、機械生成）

<!-- STATE:GENERATED:ESCALATIONS:START -->

- [ ] [#2236](https://github.com/Dayopt/dayopt/issues/2236) discussion(calendar): 予定/記録の重なり表示（左右分割）の見直しと表示フィルタの要否
- [ ] [#2160](https://github.com/Dayopt/dayopt/issues/2160) design(calendar): Plan/Record 2レーンの常時固定幅分割を見直すか判断する

<!-- STATE:GENERATED:ESCALATIONS:END -->

## 5. 直近の決定ログ（judgment:diverged、機械生成、直近 5 件）

<!-- STATE:GENERATED:DECISIONS:START -->

- 2026-08-19: [#2181](https://github.com/Dayopt/dayopt/issues/2181) epic: 分析をフルページへ戻し URL を /calendar と /report に統一する（Notion 型 Sidebar タブ）
- 2026-08-19: [#2195](https://github.com/Dayopt/dayopt/issues/2195) refactor(routing): 旧 route と右サイドパネルの残骸を削除する
- 2026-08-18: [#2205](https://github.com/Dayopt/dayopt/issues/2205) chore(ops): Claude Routines を使った夜間自律運用を段階導入する案を検討する

全履歴: [docs/decisions.md](docs/decisions.md)
<!-- STATE:GENERATED:DECISIONS:END -->
