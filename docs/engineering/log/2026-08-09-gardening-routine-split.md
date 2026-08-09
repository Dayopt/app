---
status: frozen
date: 2026-08-09
---

# ガーデニングを Routine 分離し、session ログを廃止する

## 背景・当時の前提

- 月次ガーデニングは 10 ステップの一括儀式で、ユーザーが `/gardening` を打つことだけが発動点だった。前回実施は 2026-07-14 で、2026-08-09 時点で 26 日間未実施
- 2026-08-09 に「issue 化されていない作業」を read-only subagent 5 系統で棚卸ししたところ、主要な発見（公開 docs の en/ja 非対称 7 ページ、リリースノート blog 16 バージョン分未執筆、NOT_PLANNED close された #1560 の受け皿喪失）は**すべて既存ガーデニングのステップ 7・8 が拾う設計だった**。チェックリストの設計は正しく、発動が人間の記憶に依存していたことが失敗点
- repo の規約自身が「機械で強制できるものは機械へ（止まるのが最強）」（workflow.md §Pause point）と定めており、ガーデニングだけがその原則の例外だった
- session ログ（`/session-end`）の唯一の消費者は月次ガーデニングの蒸留で、ガーデニングが止まると読まれない在庫になる。同日の subagent 調査でも、根拠として使われたのは issue・git log・decision ログ・specs のみで、session ログが参照された場面は無かった

## 決定と理由

**1. ガーデニングの発動アーキテクチャを反転する。** 検出・調査・下書き（旧ステップ 1〜4・6〜10 相当）は毎月 1 日 09:00 JST の Routine（Claude Code cloud scheduled trigger、fresh session）が自動実施し、成果物を draft PR + issue + レビュー待ちリストに着地させる。人間パート（`/gardening`）は価値判断だけ（旧ステップ 5 の判断層・実行層検証、superseded 裁定、削除候補確定、`/claude-security` 起動）。手順の正本は `.claude/commands/gardening.md` に置き、Routine prompt はそこを指すだけにする（手順変更が repo 内で完結する）

**2. `/session-end` を廃止する。** 一次情報ログ（decision / note / feedback / incident）は現行どおり残す。廃止するのは二次記録の session ログだけ。journal は Routine が前月の merge 履歴・closed issue/PR・各ドメイン log から合成する（session ログを中間形式として経由しない）

## 却下した選択肢と、なぜ捨てたか

- **`last_verified` の stale 検出を CI の常時警告にする** — Routine が月次で検出すれば足りる。常時警告は PR ごとのノイズになり、docs 変更と無関係な PR にも載る
- **PR マージ時に journal へ 1 行追記する** — `branch:finish` への結合が増える割に、Routine が git 履歴から月次合成すれば同じ情報を後から作れる。YAGNI
- **session ログを自動生成に置き換える** — 消費者がいない記録を自動化しても在庫が増えるだけ。記録は一次情報に限る

## 運用

- Routine 名: `monthly-gardening-sweep`（cron `0 0 1 * *` UTC = 毎月 1 日 09:00 JST、fresh session）。変更・停止は `list_triggers` → `update_trigger` / `delete_trigger`
- 故障時 fallback は CLAUDE.md §Docs 運用責務 のとおり: 当月 5 日を過ぎて journal の draft PR が無ければ Routine 故障を疑い、手動で代行する
- 既存の session ログ・journal（2026-07 以前）は frozen のまま残す。削除も改変もしない
- Routine の出力は必ず issue / draft PR / レビュー待ちリストに着地させる。「読まれない在庫」を新たに作らないことが Routine 化の前提条件
