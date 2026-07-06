---
description: 各ドメインの log/ に時点ものの調査・監査・実験ログを新規作成する
---

# /note

時点ものの記録を `docs/{domain}/log/YYYY-MM-DD-slug.md` として作成する。調査・実験・監査・障害からの学びなど、書いた時点でしか意味を持たない内容を置く場所。

引数: `$ARGUMENTS`(domain と slug。例: `/note engineering bundle-size-audit` → `docs/engineering/log/2026-07-02-bundle-size-audit.md`)

## 命名の特例

以下のカテゴリは接頭辞を固定する(`docs/README.md` §書き方の約束 に準拠):

- ユーザーの声(感想・要望・不具合報告) → `YYYY-MM-DD-feedback-slug.md`(domain は基本 `product`)
- 障害の記録 → `YYYY-MM-DD-incident-slug.md`(domain は基本 `operations`)

`/note feedback-xxx` のように slug 側に `feedback-` / `incident-` を含めて渡してよい。

## 手順

1. domain が指定されていなければ、対話の文脈からどのドメイン(`business` / `product` / `marketing` / `engineering` / `operations` / `company`)の記録かを判定する。迷ったら問い返す
2. 今日の日付(`YYYY-MM-DD`)を確認する
3. slug が指定されていなければ、何についてのメモかを問い返す
4. `docs/{domain}/log/YYYY-MM-DD-slug.md` を以下の骨格で作成する:

   ```markdown
   ---
   status: frozen
   updated: YYYY-MM-DD
   ---

   # <タイトル>

   <冒頭1〜2行の要約。地図を経由せず grep で直接この文書に着地した読者にも文脈が伝わるように>

   ---

   (本文)
   ```

5. feedback の場合は「原文(そのまま)→ 文脈 → 解釈 → 対応」の順で書く
6. incident の場合は「起きた事実(時系列)→ 影響範囲 → 学び」を書く。対応手順そのものの更新は `operations/` 側に別途反映する(このファイルには書かない)
7. 確認不要。ファイル作成まで一気に実行する

## 守ること

- 1ファイル1トピック
- 一度作成した note は書き換えない。追記・訂正が必要なら新しい `/note` を作り、古い方の frontmatter に `status: superseded` を追記する
- ストックへ昇格すべき内容が見つかったら、その場で反映せず `/gardening` の対象としてメモに残す(月次でまとめて処理する)
