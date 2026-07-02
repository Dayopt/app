---
description: 当日の作業要点を docs/sessions/ に記録し latest.md を更新する
---

# /session-end

今日の作業を振り返り、`docs/sessions/YYYY-MM-DD.md` にセッションログを書き、`docs/sessions/latest.md` を更新する。

> 日記（`docs/journal/YYYY-MM.md`）への蒸留はここでは行わない。月次で `/gardening` がまとめて行う（sessions/ を月末に読み返して journal/ へ蒸留する設計。日次で journal に書くと粒度が細かすぎ、月次で読み返す時に重複整理が必要になるため）。

## 1. 情報収集

- `git log --oneline --since="00:00" --all` で今日のコミットを取得（monorepo 全体。apps/product / apps/web / apps/storybook / packages を含む）
- `git diff --stat $(git log --since="00:00" --format=%H | tail -1)^..HEAD` で変更規模を把握
- 既存のセッションログがあれば `docs/sessions/` を確認し、書式を踏襲する

## 2. セッションログ

出力先: `docs/sessions/YYYY-MM-DD.md`

以下の構造で、事実と規約だけを簡潔に書く。散文・感想・論評は一切不要（それは journal/ の役割）。

```yaml
date: YYYY-MM-DD
commits: N
areas: [触った機能領域]

decisions:
  - 今日決めた設計判断（「何を選んだか」だけ。理由は不要。理由が要る決定は /decision へ）

conventions:
  - 以降ずっと守るルール（AGENTS.md / .claude/rules/ 昇格候補）

breaking:
  - 廃止したファイル・API・パターン

learned:
  - 今日発見した技術的事実（フレームワークの挙動など）

tried_and_failed:
  - 試して不採用にしたアプローチ（同じ袋小路を防ぐ）

files_of_note:
  - path/to/file # 変更意図や「削除候補」等のメモ

next:
  - [ ] 明日以降やること・未完了タスク
```

### フィールドの必須/optional

- **必須**: `date`, `commits`, `areas`, `decisions`, `next`
- **optional**: `conventions`, `breaking`, `learned`, `tried_and_failed`, `files_of_note`

該当がなければ optional フィールドは省略する。空配列 `[]` で埋めない。

### latest.md の更新

セッションログを `YYYY-MM-DD.md` に書いた後、同じ内容を `sessions/latest.md` に上書きコピーする（`latest.md` のみ append-only ガードの例外で上書き可）。AGENTS.md / rules からのポインタが常に最新セッションを指すために必要。

## 守ること

- セッションログには主観を入れない（散文・感想は書かない）
- `conventions` と `learned` は特に丁寧に書く。月次の journal 蒸留・ガーデニングで最も参照される
- 確認不要。ファイル作成 → latest.md 更新 → コミットまで一気に実行する
- ユーザーの声・障害が今日あった場合はこのコマンドとは別に `/note` で `feedback-` / `incident-` prefix のメモを残す（AGENTS.md の責務セクション参照）
