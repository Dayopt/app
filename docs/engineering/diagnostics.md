---
status: current
last_verified: 2026-08-20
---

# 誤診断防止プロトコル（不可解な失敗の切り分け手順）

2026-08-19 の 1 日で、レーンの重大な誤診断が 3 件発生し、いずれも Main の独立再検証で棄却された（[#2229](https://github.com/Dayopt/dayopt/issues/2229)）。全て同一クラス: **「クリーンな基準状態 + 単一変数」の対照実験をせずに切り分け結論を出した。** それぞれ調査往復 1〜3 回分のコストが出ており、再発性は十分にある。

「pre-existing」「型システムの限界」「環境の問題」と主張する前に、本ページのプロトコルを実施する。特に `dispatch` skill（旧 orchestration.md、#2479 で再編） §矛盾報告の独立再検証 が対象とする主張（真なら不可逆または大規模な対応を引き起こすもの）ほど、このプロトコルの実施結果を報告に添える。

## プロトコル

### 1. クリーン基準の確立

「pre-existing」「型システムの限界」「環境の問題」と主張する前に、fresh worktree（または全 stash + cache 削除）で基準を実測する。**dirty tree 上の切り分けは無効。** 自分の未コミット変更が残った状態で「これは元から壊れていた」と結論づけると、自分の変更由来の症状を環境のせいにしてしまう。

### 2. 単一変数の原則

「この 1 変更だけ」をクリーン基準に適用して再現確認する。他の変更が乗った上での実験は交絡する。複数の疑わしい変更を同時に戻す・加えるのではなく、1 つずつ isolate する。

### 3. cache の排除

`tsbuildinfo` / turbo cache / `.next` を疑い、削除してから再実測する。turbo の cached typecheck は偽グリーンを返す（[turbo-typecheck-stale-cache 相当の既知挙動](#既知の罠との関連)）。「検査が通った」の報告は、cache 経由の無検査応答である可能性を常に疑う。

### 4. exit code はパイプに通さない

`cmd | tail` の `$?` は `tail` のものであり、`cmd` 自体の成否ではない。検証コマンドの結果はパイプせずファイルへリダイレクトしてから中身を読むか、`set -o pipefail` を前置する。exit code だけで「通った」と報告しない — 出力末尾のサマリー行を直接読む。

### 5. 編集直後はファイル実体を Read で確認する

この repo の PostToolUse formatter hook は、保存時に**未使用に見える import を無言で剥がす**。import 追加とその使用箇所追加が別々の編集ステップに分かれていると、中間状態で import だけが整形対象になり消える。「新しく足した処理が何も出力しない」「無関係な既存ファイルまで壊れる」といった症状が出たら、まず該当ファイルを Read で読み直し、追加した import が実際に残っているかを確認する。

新規 import + それを使う変更（intersection member の追加など）は、可能な限り**同一の Write / Edit 呼び出しでまとめる**。2 回に分けると、間に formatter hook が挟まって片方だけが消える。

**2026-08-24、`.prettierrc` の `organizeImportsSkipDestructiveCodeActions: true`（#2362）でこの根本原因（`prettier-plugin-organize-imports` による無言の import 除去）自体を止めた。** PostToolUse hook・pre-commit の `lint-staged`・エディタ保存のすべての `prettier --write` 呼び出しに一括適用される（sort/combine は不変、removal だけを止める公式オプション）。以後、真に未使用な import は `noUnusedLocals`（`tsconfig.base.json` および各 app の tsconfig）が typecheck error として顕在化させるため、「無言で消える」クラスの再発は原理的に起きない。上記の同一 Write/Edit 呼び出しでまとめる規律は、他の理由（未使用にすら見えない一時的な構文不整合など）による混乱を避ける一般的な良い習慣として引き続き有効だが、本節が記録する具体的な事故クラスへの対処としては設定変更で閉じている。

## 実例集

症状 → 誤診 → 真因の順で記録する。同じ症状を見た将来のレーンは、まずここを確認する。

### 実例 1: i18n `Messages` 型の「union 展開上限」説（[#2208](https://github.com/Dayopt/dayopt/issues/2208)）

- **症状**: `apps/product/src/lib/i18n/messages.d.ts` の `Messages` intersection 型へ新規 namespace（`report.json`）を登録したところ、`pnpm exec tsc --noEmit` で無関係な既存ファイル（`day/page.tsx` の `t('views.day')` など）まで大量に型エラー化した
- **誤診 1（当初）**: 「`Messages` 型が TypeScript の union/template literal 型展開の上限に極めて近く、どんな 1 キー追加でも型が `never` へ潰れる」。既存 namespace（`calendar.json`）へのキー追加でも再現すると報告した
- **独立検証**: Main が clean main + `calendar.json` への 1 キー追加で `exit 0` を確認。誤診 1 は REFUTED
- **誤診 2（訂正後）**: 「1 キー追加」ではなく「16 個目の distinct import を `messages.d.ts` に足す操作そのもの」が原因、と主張を狭めた
- **第 2 次独立検証**: 隔離 worktree で「16 個目の新規 import + intersection member 追加」を実測 → `exit 0`、エラーゼロ。誤診 2 も REFUTED
- **真因**: PostToolUse formatter hook による import の無言除去。import 追加の編集を先に行うと、formatter hook が「未使用 import」として剥がし、その後 intersection に member を足すと未解決識別子を参照する intersection になり、`Messages` 型全体が error 型化 → アプリ内の全 `t()` 呼び出しが広範囲に型エラー化した
- **確定した再現手順**: `messages.d.ts` を Write ツールで一括書き換え（import 追加 + intersection member 追加を 1 回の書き込みで同時に行う）→ Read で import・member とも残っていることを確認 → tsbuildinfo 削除 → `tsc --noEmit` → `exit 0`。**新規 import と intersection member の追加を同一の Write / Edit 呼び出しでまとめれば、16 個目でも安全に通る**
- **教訓**: 「型システムの限界」「〇個目で崩壊する閾値」という説明は、editor の副作用（formatter hook）を疑う前に飛びついた早すぎる結論だった。上記プロトコル §5 の直接の根拠

### 実例 2: `tsc` 22 件エラーは main 由来の pre-existing、という誤診

- **症状**: 作業ブランチで `pnpm exec tsc --noEmit` を実行すると 22 件のエラーが出た
- **誤診**: `git stash` で自分の変更を退避して比較した結果と照らし、「main 由来の pre-existing エラーであり自分の変更とは無関係」と報告した
- **真因**: 実態は自分自身の削除漏れ（`messages.d.ts` の該当エントリを消し忘れていた）で、`stash` を使った比較自体が stale cache（turbo の cached typecheck）と交絡し、正しい差分比較になっていなかった
- **教訓**: `stash` 前後の比較は cache を挟むと無意味になる。「pre-existing」の主張は、cache を排除した clean 基準（fresh worktree 等）での実測でしか裏付けられない。上記プロトコル §1・§3 の直接の根拠

## 既知の罠との関連

本ページのプロトコルは、個々のツール固有の既知の罠（cache の偽グリーン化、パイプの exit code、formatter hook の import 剥がし）を防ぐための**共通の手順**として整理したもの。ツール固有の詳細は各所の docs / rules を参照する:

- turbo typecheck の cache 挙動: 本ページ §3
- パイプ経由の exit code: 本ページ §4
- formatter hook の import 剥がし: 本ページ §5、実例 1（[#2208](https://github.com/Dayopt/dayopt/issues/2208)）

## レーンへの適用

`AGENTS.md §レーン運用` §検証原則 から本ページを参照する。「pre-existing / 環境問題」を主張する報告には、このプロトコルの実施結果（どのステップを実行し、どう確認したか）を添付する。
