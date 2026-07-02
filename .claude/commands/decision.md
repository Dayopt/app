---
description: docs/log/decisions/ に意思決定ログを新規作成する
---

# /decision

意思決定ログを `docs/log/decisions/NNN-slug.md` として作成する。

引数: `$ARGUMENTS`（slug。例: `/decision skip-recurring-events` → `skip-recurring-events`）

## 手順

1. `ls docs/log/decisions/ | grep -E '^[0-9]+' | sort -n | tail -1` で最大連番を確認し、+1 した3桁ゼロ埋め番号を `NNN` とする（`decisions/index.md` は連番外の `index.md` なので対象外）
2. slug が指定されていなければ、何を決めたかを 1 フレーズで問い返す
3. `docs/log/decisions/NNN-slug.md` を以下のテンプレート（`docs/README.md` §decisions のテンプレ、と同一）で作成する:

   ```markdown
   ---
   date: YYYY-MM-DD
   status: accepted # accepted | superseded
   ---

   # 決めたこと（1行）

   ## 背景・当時の前提

   ## 決定と理由

   ## 却下した選択肢と、なぜ捨てたか

   ## 影響・やること
   ```

4. 各セクションを対話の文脈から埋める。埋められない箇所はユーザーに問い返す（5分で書ける軽さを保つ。長い散文にしない）
5. ファイル作成後、`docs/log/decisions/index.md` の一覧表に行を追加する（該当する技術ADRの場合のみ。プロダクト判断のみの場合は index.md への追加は不要）
6. 確認不要。ファイル作成まで一気に実行する

## 守ること

- **番号は必ず最大値+1**。歯抜け・重複を作らない
- 一度作成した decision ファイルは書き換えない。訂正が必要になったら新しい `/decision` を実行し、古い方に `superseded_by: NNN-new-slug.md` を追記する（本文は書き換えない）
- 技術判断・プロダクト判断を区別せず同じ連番シリーズ・同じテンプレートを使う
