---
status: frozen
date: 2026-08-17
---

# Axiom をサブプロセッサーとして privacy.mdx に追記し、30 日通知の時計を開始した

## 背景・当時の前提

`docs/operations/monitoring.md` §Log Drains（Axiom）が定める Drain 作成手順は、Axiom が Vercel Log Drains 経由で runtime / build ログ（アプリの構造化ログに加え、Vercel 自身の request log を含みうる）を保管・検索する新規サブプロセッサーであることを前提にしていた。privacy.mdx の subProcessors 節は「新しいサブプロセッサーの導入は少なくとも 30 日前に通知する」と約束済みのため、この通知を済ませないまま Drain を作成すると公開ポリシー違反になる（2026-08-14 の内製クロスレビューで P1 指摘として検出、#1701 Phase 3 の残作業として着手保留になっていた）。

あわせて、Log Drain が運ぶ Vercel 自身の request log には iCal feed の URL（`/api/v1/calendar/{token}.ics`、token が path に入る長期 bearer credential）や OAuth callback の `code` / `state`（query）が含まれうるため、path / query を送信対象に含めるかどうかも Drain 作成前に確定させる必要があった。

## 決定と理由

指揮台 Fable が User 承認を得て、以下 2 点を確定した（[#1701 コメント](https://github.com/Dayopt/dayopt/issues/1701#issuecomment-5311774981)）:

1. **送信フィールド**: request log の **path / query は Drain 対象から除外する**。iCal feed token（path 内の長期 bearer credential）と OAuth code/state（query）が Axiom へ恒久記録されるのを構造的に避けるため。デバッグ用途は Sentry + アプリの構造化ログでカバーし、不足が実測されたら除外の緩和を別途判断する
2. **legal 前提の着手**: privacy.mdx（`apps/web/content/legal/{ja,en}/privacy.mdx`）の subProcessors 節へ Axiom を追記し、30 日前通知の時計をこの追記の production 公開日から起算する。Drain の実作成はその 30 日後以降に User が実施する（`EXPLICIT AUTHORITY`、monitoring.md の手順どおり）

## 却下した選択肢と、なぜ捨てたか

- **request log の path / query も含めて送る**: デバッグ時の利便性は上がるが、iCal token という長期 bearer credential を第三者 store（Axiom）へ恒久記録することになり、feed 利用者のカレンダー閲覧権が漏洩した場合の被害範囲が repo 外へ広がる。デバッグは既存の Sentry + 構造化ログで足りると判断した
- **Drain 作成後に事後通知する**: privacy.mdx の既存の約束（少なくとも 30 日前の事前通知）に反するため不可

## 影響・やること

- `apps/web/content/legal/{ja,en}/privacy.mdx` の subProcessors 節に Axiom エントリを追加し、`lastUpdated` を更新（本 PR）
- `apps/web/src/app/[locale]/(marketing)/legal/_components/legal-standard-document.tsx` の `PRIVACY_SECTIONS` 内 subProcessors の list keys に `axiom` を追加（本 PR。追加しないと data に書いても描画されない）
- `docs/operations/monitoring.md` §Log Drains（Axiom）手順 1・2 を、確定した内容（除外方針・legal 前提着手済み）に更新（本 PR）
- 30 日時計の起点はこの変更が **production へ deploy された日**（merge 日ではない）。Drain 作成（monitoring.md 手順 3 以降）は起点から 30 日以上空けてから、User が `EXPLICIT AUTHORITY` として実施する
