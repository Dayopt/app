---
name: note
description: ユーザーが調査・実験・監査・障害からの学びなど時点ものの記録作成を明示依頼した時、または `/note` として明示起動された時に発動。domain と slug から `docs/{domain}/log/YYYY-MM-DD-slug.md` を作成する。feedback / incident は接頭辞固定の命名特例を適用する。意思決定ログの作成（decision skill の領域）では発動しない。
---

# /note

時点ものの記録を `docs/{domain}/log/YYYY-MM-DD-slug.md` として作成する。調査・実験・監査・障害からの学びなど、書いた時点でしか意味を持たない内容を置く場所。

引数: `$ARGUMENTS`(domain と slug。例: `/note engineering bundle-size-audit` → `docs/engineering/log/2026-07-02-bundle-size-audit.md`)

## When to Use

**明示発動型** — この skill はユーザーの explicit な時点ものログ作成意図のみを契機に発動する（コード変化のみでは発動しない）。

- 「メモを残して」「調査ログを作って」など、時点ものの記録作成が明示依頼された時
- `/note` として明示的に起動された時
- ユーザーの声や障害の記録を feedback- / incident- prefix で残すよう指示された時

## When NOT to Use

この skill は **explicit 時点ものログ作成意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 恒久的な意思決定の記録 → `decision` skill
- 月次の docs 鮮度・一貫性の保守 → `gardening` skill

## 命名の特例

以下のカテゴリは接頭辞を固定する(`docs/README.md` §書き方 に準拠):

- ユーザーの声(感想・要望・不具合報告) → `YYYY-MM-DD-feedback-slug.md`(domain は基本 `product`)
- 障害の記録 → `YYYY-MM-DD-incident-slug.md`(domain は基本 `operations`)

`/note feedback-xxx` のように slug 側に `feedback-` / `incident-` を含めて渡してよい。

## 手順

1. domain が指定されていなければ、対話の文脈からどのドメイン(`business` / `product` / `engineering` / `operations` / `company`)の記録かを判定する。迷ったら問い返す
2. 今日の日付(`YYYY-MM-DD`)を確認する
3. slug が指定されていなければ、何についてのメモかを問い返す
4. `docs/{domain}/log/YYYY-MM-DD-slug.md` を以下の骨格で作成する:

   ```markdown
   ---
   status: frozen
   date: YYYY-MM-DD
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
- 一度作成した note は書き換えない。追記・訂正が必要なら新しい `/note` を作り、古い方の frontmatter に新しいrepo-relative pathを`superseded_by`として追記する
- ストックへ昇格すべき内容が見つかったら、その場で反映せず `/gardening` の対象としてメモに残す(月次でまとめて処理する)
