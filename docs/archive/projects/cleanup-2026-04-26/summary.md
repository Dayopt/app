# cleanup-2026-04-26 クローズサマリー

クローズ日: 2026-04-27

状態: **部分完了で中断**

> **overview**: [overview.mdx](./overview.mdx)。実行ログと entry ごとの判断は overview を正とする。

## Project ゴール

`src/` を dead code、barrel export、cast residue、Storybook gap、JSDoc drift の観点で監査し、機械的に安全な cleanup を進める。参照が動的なファイルや設計判断を伴う項目は、削除を強行せず停止条件に従って分離する。

## 到達点

| 区分                  | 結果                                                        |
| --------------------- | ----------------------------------------------------------- |
| 監査                  | C-001〜C-057 を列挙                                         |
| barrel cleanup        | C-005〜C-018、C-068〜C-076 を実施                           |
| 連鎖して孤立した file | C-062〜C-067 を削除                                         |
| Storybook             | C-041 を追加                                                |
| API / route docs      | C-058〜C-061 を追加                                         |
| 完了 entry            | **33 件**                                                   |
| 変更規模              | cleanup **-1,116 行** / docs **+260 行** / story **+38 行** |

実行当時の細分化された 41 commit は後続の squash / batch 取り込み後の現在の履歴では個別 SHA を参照できない。現在追跡可能な docs 履歴は次のとおり。

| SHA        | 日付       | 役割                                  |
| ---------- | ---------- | ------------------------------------- |
| `7550e81e` | 2026-04-26 | cleanup overview を含む当日状態を記録 |
| `e54b3c96` | 2026-04-27 | v0.27.0 時点の最終実行ログを記録      |
| `43b2b969` | 2026-05-21 | docs を Storybook 配下へ集約          |
| `0f6ef04d` | 2026-06-15 | 散文 docs の配置整理                  |

## 技術的成果

- feature / lib barrel から未参照 re-export を削減し、公開面を縮小
- barrel cleanup 後に外部参照が消えた wrapper、hook、grid helper を追加削除
- `api-overview.mdx` と `app-routes.mdx` の原型を追加し、API と route group の責務を一覧化
- knip の検出をそのまま削除根拠にせず、Next.js / next-intl の動的参照と意図的 scaffolding を false positive として切り分け
- 連続 skip と design decision 発生時に停止する運用を実際に適用

## 中断理由

残りは機械的 cleanup ではなく、mock 戦略や feature 公開面の設計判断を必要とした。

- C-019〜C-029: 実体 export の削除は型 import・外部参照の再監査が必要
- C-042〜C-056: initializer / provider / mutation component の Storybook mock 方針が未確定
- C-057: JSDoc drift 70 file は独立 project 相当
- C-001〜C-004: 動的参照または当時の scaffolding による knip false positive

その後 AI、chronotype、tour など複数 feature が削除されており、当時の残件をそのまま再開することはできない。

## ハマり点 / 学び

- 静的解析の unused 判定は、framework config や動的 import を含む repository では削除証明にならない
- barrel export を先に減らすと、相互参照だけで残っていた孤立 file が次の knip 実行で見える
- UI を持たない initializer に Story を必須化すると、価値より mock 維持コストが上回る場合がある
- 長期 cleanup は granular commit を後から追跡できる形で PR に残す。ローカル commit を batch 取り込みすると close-out の証拠が弱くなる

## 引き継ぎ

再開する場合は旧 C 番号を消化するのではなく、現行 main で `knip` と参照検索を取り直して新しい project として起票する。特に Storybook gap は「描画可能な user-facing component」に対象を絞り、provider / initializer は unit test で扱う方針を先に確定する。
