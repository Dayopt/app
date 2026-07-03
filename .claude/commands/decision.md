---
description: 各ドメインの log/ に意思決定ログを新規作成する
---

# /decision

意思決定ログを `docs/{domain}/log/YYYY-MM-DD-slug.md` として作成する。

引数: `$ARGUMENTS`（domain と slug。例: `/decision engineering skip-recurring-events` → `docs/engineering/log/2026-07-03-skip-recurring-events.md`）

## 手順

1. domain が指定されていなければ、対話の文脈からどのドメイン(`business` / `product` / `marketing` / `engineering` / `operations` / `company`)の判断かを判定する。迷ったら問い返す
2. slug が指定されていなければ、何を決めたかを 1 フレーズで問い返す
3. 今日の日付(`YYYY-MM-DD`)を確認する
4. `docs/{domain}/log/YYYY-MM-DD-slug.md` を [`docs/_templates/decision.md`](../../docs/_templates/decision.md) のテンプレートで作成する:

   ```markdown
   ---
   status: current
   updated: YYYY-MM-DD
   ---

   # 決めたこと(1行)

   ## 背景・当時の前提

   ## 決定と理由

   ## 却下した選択肢と、なぜ捨てたか

   ## 影響・やること
   ```

5. 各セクションを対話の文脈から埋める。埋められない箇所はユーザーに問い返す(5分で書ける軽さを保つ。長い散文にしない)
6. 確認不要。ファイル作成まで一気に実行する

## 守ること

- 一度作成した decision ファイルは書き換えない。訂正が必要になったら新しい `/decision` を実行し、古い方の frontmatter に `status: superseded` を追記する(本文は書き換えない)
- 技術判断・プロダクト判断・事業判断を区別せず同じテンプレートを使う。置き場所(ドメイン)だけで分類する
- 連番管理は不要(日付が一意性を担保する)。同日に複数決定があれば slug で区別する
