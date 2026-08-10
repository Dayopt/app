---
name: decision
description: ユーザーが意思決定ログの作成を明示依頼した時、または `/decision` として明示起動された時に発動。domain と slug から `docs/{domain}/log/YYYY-MM-DD-slug.md` を `docs/_templates/decision.md` の骨格で作成する。技術判断・プロダクト判断・事業判断を区別せず同じテンプレートを使う。調査・監査ログの作成（note skill の領域）では発動しない。
---

# /decision

意思決定ログを `docs/{domain}/log/YYYY-MM-DD-slug.md` として作成する。

引数: `$ARGUMENTS`（domain と slug。例: `/decision engineering skip-recurring-events` → `docs/engineering/log/2026-07-03-skip-recurring-events.md`）

## When to Use

**明示発動型** — この skill はユーザーの explicit な意思決定ログ作成意図のみを契機に発動する（コード変化のみでは発動しない）。

- 「決定した」「決めた」「意思決定ログを作って」など、意思決定ログの作成が明示依頼された時
- `/decision` として明示的に起動された時
- domain・slug を伴う decision ログ作成が指示された時

## When NOT to Use

この skill は **explicit 意思決定ログ作成意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 時点ものの調査・監査・実験ログの作成 → `note` skill
- 月次の docs 鮮度・一貫性の保守 → `gardening` skill

## 手順

1. domain が指定されていなければ、対話の文脈からどのドメイン(`business` / `product` / `engineering` / `operations` / `company`)の判断かを判定する。迷ったら問い返す
2. slug が指定されていなければ、何を決めたかを 1 フレーズで問い返す
3. 今日の日付(`YYYY-MM-DD`)を確認する
4. `docs/{domain}/log/YYYY-MM-DD-slug.md` を [`docs/_templates/decision.md`](../../../docs/_templates/decision.md) の本文にある markdown 骨格で作成する

5. 各セクションを対話の文脈から埋める。埋められない箇所はユーザーに問い返す(5分で書ける軽さを保つ。長い散文にしない)
6. 確認不要。ファイル作成まで一気に実行する

## 守ること

- 一度作成した decision ファイルは書き換えない。訂正が必要になったら新しい `/decision` を実行し、古い方の frontmatter に新しいrepo-relative pathを`superseded_by`として追記する(本文は書き換えない)
- 技術判断・プロダクト判断・事業判断を区別せず同じテンプレートを使う。置き場所(ドメイン)だけで分類する
- 連番管理は不要(日付が一意性を担保する)。同日に複数決定があれば slug で区別する
