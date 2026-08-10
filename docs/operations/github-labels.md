---
status: current
last_verified: 2026-08-10
code: .github/dependabot.yml
---

# GitHub ラベル運用（namespace:value）

## 最上位ルール

- ラベル名は `namespace:value`。
- ラベル自体の「名前」と「説明（Description）」を運用ルールの正本とし、色は参照用にのみ使う。
- ここは現行運用の参照先（SSOT）で、運用手順は `.github/` 配下の設定/ワークフローと整合させる。
- 未知のラベルを AI が推測して作成しない。
- `priority:` は 0/1 個、`status:` は 0/1 個を付与する（通常 1 個）。
- `size:` は **deprecated**（2026-08-10、#1912。編成時に issue 本文から毎回判定する方式へ移行）。新規 issue に付けない。既存 issue からは剥がさない。
- `risk:` は 0/1 個。`judgment:` は複数の issue / PR に付くが 1 件あたり 1 個。
- `type:`、`area:`、`quality:` は複数可。
- 技術名、担当者名、Workflow名、Phase、実装ファイル種別をラベル化しない。
- 新しいラベルが必要な場合は、既存 namespace（`type` / `priority` / `status` / `area` / `scope` / `quality` / `risk` / `judgment`）では表現できないことを確認したうえで判断する。

## 正規ラベル一覧

### type

- `type:feature`
- `type:refactor`
- `type:docs`
- `type:test`
- `type:bug`
- `type:spike`
- `type:discussion`
- `type:chore`

### priority

- `priority:p0`
- `priority:p1`
- `priority:p2`
- `priority:p3`

### status

- `status:ready`
- `status:in-progress`
- `status:review`
- `status:blocked`
- `status:watching`

### area

- `area:frontend`
- `area:backend`
- `area:database`
- `area:ui`
- `area:search`
- `area:settings`
- `area:calendar`
- `area:auth`
- `area:inbox`
- `area:tag`
- `area:infrastructure`
- `area:operations`
- `area:analytics`
- `area:billing`
- `area:deployment`

### size（deprecated）

新規 issue に付けない（最上位ルール参照）。既存 issue の記録として残る:

- `size:xs`
- `size:s`
- `size:m`
- `size:l`
- `size:xl`

### scope

- `scope:epic`

### risk

- `risk:authority` — issue の実行自体に `EXPLICIT AUTHORITY` の不可逆操作を含む場合のみ付与。運用は `.claude/skills/dispatch/SKILL.md` 操作 B

### judgment

- `judgment:diverged` — Fable の推奨と User の判断が分かれた記録。月次で判定を追記したら外す。運用は `.claude/rules/orchestration.md` §判断ジャーナル

### quality

- `quality:security`
- `quality:performance`
- `quality:accessibility`
- `quality:monitoring`
- `quality:cost`

## Dependabot ラベル（推奨）

- npm 更新: `type:chore`
- GitHub Actions 更新: `type:chore` + `area:infrastructure`
