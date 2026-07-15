---
status: current
last_verified: 2026-07-15
code: .github/dependabot.yml
---

# GitHub ラベル運用（namespace:value）

## 最上位ルール

- ラベル名は `namespace:value`。
- ラベル自体の「名前」と「説明（Description）」を運用ルールの正本とし、色は参照用にのみ使う。
- ここは現行運用の参照先（SSOT）で、運用手順は `.github/` 配下の設定/ワークフローと整合させる。
- 未知のラベルを AI が推測して作成しない。
- `priority:` は 0/1 個、`status:` は 0/1 個を付与する（通常 1 個）。
- `size:` は最大 1 個。
- `type:`、`area:`、`quality:` は複数可。
- 技術名、担当者名、Workflow名、Phase、実装ファイル種別をラベル化しない。
- 新しいラベルが必要な場合は、既存 namespace（`type` / `priority` / `status` / `area` / `size` / `scope` / `quality`）では表現できないことを確認したうえで判断する。

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

### size

- `size:xs`
- `size:s`
- `size:m`
- `size:l`
- `size:xl`

### scope

- `scope:epic`

### quality

- `quality:security`
- `quality:performance`
- `quality:accessibility`
- `quality:monitoring`
- `quality:cost`

## Dependabot ラベル（推奨）

- npm 更新: `type:chore`
- GitHub Actions 更新: `type:chore` + `area:infrastructure`
