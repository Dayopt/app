---
status: frozen
updated: 2026-07-10
---

# 並行レーン orchestration の策定と refactor 凍結判断

feature 開発（time-model-split）と同時に進める非 feature 作業を 5 レーン（Feature / Refactor / Security・Ops / LP・Content / Watch）に整理し、tracking issue #1567 に固定した。指揮者（Fable セッション）が dispatch と順序を管理し、実装は worker（Sonnet / Codex）が行う体制。

---

## 決定 1: 衝突 refactor の凍結

repo-refactor 棚卸し（#1536）のうち R-09（#1524）/ R-12（#1527）/ R-13（#1528）/ R-14（#1529）/ R-28（#1544）を **time-model-split Step 8 cutover 完了まで凍結**した（`status:blocked` 付与）。

**理由**: これらは calendar / entry / review の巨大ファイル分割・cross-feature import 解消であり、time-model-split Step 5-7（calendar 2 レーン化 / 作成・編集フロー / Review 差分再定義）が書き換える領域とファイル単位で衝突する。書き換え予定のファイルを先に分割するのは二度手間で、merge conflict のコストだけが残る。refactor の目的（長期で最適であり続ける）にとっても、新しい plans/logs 構造が確定してから分割する方が正しい切り方になる。

**例外・連動**:

- R-27（#1543、stats サーバー所属 spike）は Step 4（statistics service）の設計入力になるため **Step 4 着手前に実施**
- R-25（#1541、Supabase 型生成漏れ）は stats RPC 型を触るため Step 4 前に済ませる
- R-10（#1525、日付フォーマッタ集約）は凍結対象ファイルに触れる範囲を除外した段階 PR で進行可

## 決定 2: issue 化されていなかった残骸の補充

検証の上 3 件を起票し、1 件を既存 issue に統合した:

- #1564 — Supabase security advisors **WARN 24 件**の棚卸し（全件 `SECURITY DEFINER` × `p_user_id` パターン。一部は 2026-07-04 の migration でガード済みだが体系的な検証がない）。I-16（#1312）close 時の持ち越し分
- #1565 — `api:spec` ジェネレータ故障の修復（2026-06-15 から `buildErrorResponses` で TypeError、2026-07-10 再現確認。openapi.json が手作業編集運用になっている）
- #1566 — Sentry 運用整備（alert / Vercel integration 責務 / quota・inbound filter・dashboard。#1006 が NOT_PLANNED close で受け皿がなかった）
- #1558 に pre-deploy 監査ログ（2026-07-08）の残タスク 2 件（Preview long-lived secrets / Development encrypted secrets の見直し）を統合

dependabot 放置 PR（#1033/#1034/#1035）は gap 候補だったが merged 済みと確認し、対象外とした。

## 決定 3: 運用ルール（トークン効率）

- 1 issue = 1 PR = 1 worker セッション。同一 feature dir の並行 dispatch 禁止
- dispatch 時に指揮者が issue 本文を handoff-quality（受け入れ条件・対象ファイル・検証コマンド完結）に補強してから worker に渡す
- plan-review は size m/l のみ。worker の PR は別系統 agent がクロスレビュー
- Sonnet / Codex への個別割り当ては設計しない（ユーザー側で決める）。issue には「worker 可 / Fable / 🔒 prod 操作」の 3 区分だけ付ける

## 参照

- Tracking: #1567（レーン定義・凍結リスト・着手順の正）
- 凍結注記: #1536 コメント + 凍結 5 issue の `status:blocked`
- time-model-split 設計書: `docs/projects/time-model-split/overview.md`
