---
status: current
last_verified: 2026-09-01
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
- namespace の無い裸のラベルを作らない。`ops` は 2026-08-11（#1915）に `area:operations` へ付け替えたうえで削除した。
- 新しいラベルが必要な場合は、既存 namespace（`type` / `priority` / `status` / `area` / `scope` / `quality` / `risk` / `judgment` / `review`）では表現できないことを確認したうえで判断する。

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
- `type:board`（日次盤面 issue 専用。2026-08-20、[#2259](https://github.com/Dayopt/dayopt/issues/2259)。`is:issue label:type:board is:open` で検索し当日の盤面issueを特定するために使う）

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
- `area:tooling`
- `area:github`
- `area:blog`
- `area:docs`

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

- `judgment:diverged` — 指揮台（または `dispatch` skill（旧 orchestration.md、#2479 で再編） §メタ把握（User + Fable） の会話）の推奨と User の判断が分かれた記録（未判定 or 判定材料待ち）。判定を書いたら外さず `judgment:judged` へ付け替える
- `judgment:judged` — 個別判定を書き終えた状態（2026-08-27、User 裁可の新設。`judgment` namespace 内の追加のため既存 2 値体系への例外にあたる。経緯は `dispatch` skill（旧 orchestration.md、#2479 で再編） §判断ジャーナル）。`docs/decisions.md` への反映はラベル→月次 sync 機構ではなく、判定時点での直接追記に一本化済み（2026-08-28、#2475）

運用は `dispatch` skill（旧 orchestration.md、#2479 で再編） §判断ジャーナル

### review

- `review:full` — **Issue / PR 共通の高リスクシグナル**（2026-09-01、[#2529](https://github.com/Dayopt/dayopt/issues/2529) / [#2530](https://github.com/Dayopt/dayopt/issues/2530)）。手で付ける明示的なエスカレーションで、AI が自動付与する仕組みは作らない
  - **PR に付いている場合**: 保護対象 path に該当しなくてもクロスレビュー必須になる（`[internal-review]` marker + 現 HEAD 束縛の Codex review が両方必要）。判定は `scripts/tasks/finish-branch.sh` が `scripts/ci/protected-path-gate.mjs` と併せて行う
  - **Issue に付いている場合**: 実装着手前に Codex Issue Review が必須になる（`pnpm review:issue:gate <N>` が機械判定、`dispatch` skill 操作A 手順 6）。さらに、その issue を `Closes #N` した PR も自動的にクロスレビュー必須になる（`Refs #N` や本文中の URL は継承しない）
  - **ラベルを外しても gate 対象のまま**（`review:full` の削除履歴、またはこの issue 宛ての review marker があれば降格しない。失敗したレビューをラベル削除で迂回させないため）。再分類したい場合は current な pass 証跡を作る

### quality

- `quality:security`
- `quality:performance`
- `quality:accessibility`
- `quality:monitoring`
- `quality:cost`

## Dependabot ラベル（推奨）

- npm 更新: `type:chore`
- GitHub Actions 更新: `type:chore` + `area:infrastructure`
