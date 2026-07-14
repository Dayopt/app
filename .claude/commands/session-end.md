---
description: 当日の作業要点を docs/engineering/log/ の日付付きログに記録する
---

# /session-end

今日の作業を振り返り、`docs/engineering/log/YYYY-MM-DD-session.md` にセッションログを書く。作業ログは横断的な開発作業のため engineering ドメインに集約する(business/product 固有の意思決定は別途 `/decision` で当該ドメインに記録する)。

> 月次ロールアップ(`docs/engineering/log/YYYY-MM-01-journal.md`)への蒸留はここでは行わない。月次で `/gardening` がまとめて行う(session ログを月末に読み返して journal 相当のログへ蒸留する設計。日次で書くと粒度が細かすぎ、月次で読み返す時に重複整理が必要になるため)。

## 1. 情報収集

- `git log --oneline --since="00:00" --all` で今日のコミットを取得(monorepo 全体。apps/product / apps/web / apps/storybook / packages を含む)
- `git diff --stat $(git log --since="00:00" --format=%H | tail -1)^..HEAD` で変更規模を把握
- 既存のセッションログがあれば `docs/engineering/log/*-session.md` を確認し、書式を踏襲する

## 2. セッションログ

出力先: `docs/engineering/log/YYYY-MM-DD-session.md`

以下の構造で、事実と規約だけを簡潔に書く。散文・感想・論評は一切不要(それは月次ロールアップの役割)。

```yaml
---
status: frozen
date: YYYY-MM-DD
---

date: YYYY-MM-DD
commits: N
areas: [触った機能領域]

decisions:
  - 今日決めた設計判断(「何を選んだか」だけ。理由は不要。理由が要る決定は /decision へ)

conventions:
  - 以降ずっと守るルール(AGENTS.md / .claude/rules/ 昇格候補)

breaking:
  - 廃止したファイル・API・パターン

learned:
  - 今日発見した技術的事実(フレームワークの挙動など)

tried_and_failed:
  - 試して不採用にしたアプローチ(同じ袋小路を防ぐ)

files_of_note:
  - path/to/file # 変更意図や「削除候補」等のメモ

next:
  - [ ] 明日以降やること・未完了タスク
```

### フィールドの必須/optional

- **必須**: `date`, `commits`, `areas`, `decisions`, `next`
- **optional**: `conventions`, `breaking`, `learned`, `tried_and_failed`, `files_of_note`

該当がなければ optional フィールドは省略する。空配列 `[]` で埋めない。

## 守ること

- セッションログには主観を入れない(散文・感想は書かない)
- `conventions` と `learned` は特に丁寧に書く。月次ロールアップ・ガーデニングで最も参照される
- 確認不要。日付付きファイルの作成まで一気に実行する。同日ファイルがすでに存在する場合は書き換えず、内容を表す別slugのnoteを新規作成する
- ユーザーの声・障害が今日あった場合はこのコマンドとは別に `/note` で `feedback-` / `incident-` prefix のメモを残す(AGENTS.md の責務セクション参照)
