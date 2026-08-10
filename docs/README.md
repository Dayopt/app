# docs/ 運用規約

このディレクトリは、Dayopt の事業・プロダクト・設計・運用に関する内部情報の正本（SSOT）。コードが消費する値はコードを正とし、docs には判断、振る舞い、所在を書く。

主な読者は創業者、開発者、AI。AI が単独で検索しても「現在の正」「過去の記録」「実装場所」を区別できる予測可能な構造を優先する。

## 情報面の責務

| 面                      | 書くこと                                                     | 書かないこと                                  |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| `docs/`                 | 複数 component / package を跨ぐ仕様、設計、判断、運用        | props catalog、コードから取得できる定数の複製 |
| Storybook               | 単一 component の使い方、variant、visual state、interaction  | DB schema、feature DAG、system data flow      |
| app / package README    | その領域固有の入口、実行コマンド、正本へのリンク             | monorepo 全体の規約の複製                     |
| `apps/web/content/docs` | 外部ユーザー向けの利用説明                                   | 内部アーキテクチャ・運用                      |
| code / manifest         | package version、schema、env定義、design token等の機械消費値 | 判断理由や利用者向け仕様                      |

同じ説明を複数面に置かない。境界を跨ぐ場合は正本へリンクする。

## ドメイン

| ドメイン       | 責務                                      | 主な入口                                                   |
| -------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `business/`    | 事業の Why、対象、価格、指標              | `strategy.md`, `pricing.md`                                |
| `product/`     | プロダクトの What / Why、原則、仕様、用語 | `principles.md`, `specs/`, `glossary.md`, `copywriting.md` |
| `marketing/`   | 広げ方、チャネル、トーン                  | `strategy.md`, `voice.md`, `channels/`, `writing-style.md` |
| `engineering/` | architecture、規約、infra                 | `architecture.md`, `conventions*.md`, `infra.md`           |
| `operations/`  | runbook、monitoring、security、legal      | `runbook.md`, `monitoring.md`, `security.md`               |
| `company/`     | 契約、登記、外部サービス                  | `accounts.md`                                              |
| `projects/`    | 複数領域を跨ぐ有限の実装計画と完了記録    | `{project}/overview.md`, `summary.md`                      |

## 現在・Project・履歴

### Stock — 現在の正

日付 prefix のないファイル。常に現行状態へ更新し、過去版は Git 履歴に任せる。

```yaml
---
status: current # current | superseded
last_verified: 2026-07-14
code: apps/product/src/features/timeblock # 任意。repo 内の実在 path
---
```

- `current`: 現在参照してよい
- `superseded`: 正本ではない。通常は新しい正本へのリンクを本文に置く
- `last_verified`: 内容をコード・外部状態・一次資料と照合した日。本文を眺めただけでは更新しない
- `code`: scalar または配列。symbol や glob ではなく、実在する repo-relative path を書く

### Project — 有限の作業状態

Project の状態は `docs/projects/{name}/overview.md` だけを正本にする。

```yaml
---
status: active # active | paused | done
last_verified: 2026-07-14
code:
  - apps/product/src/features/calendar
  - apps/product/src/features/review
---
```

- `active`: 実装または検証が進行中
- `paused`: 意図的に停止中
- `done`: acceptance criteria を満たした。directory 内に `summary.md` が必須で、ディレクトリごと `docs/projects/_archive/{name}/` へ移す
- step / summary は通常の stock metadata（`current | superseded`）を使う

### Log — 当時の記録

各ドメイン直下の `log/YYYY-MM-DD-slug.md`。初回作成後は凍結し、追記・修正しない。

```yaml
---
status: frozen
date: 2026-07-14 # filename の日付と一致
code: apps/product/src/features/review # 任意
superseded_by: docs/product/log/2026-08-01-new-decision.md # 訂正時だけ追記
---
```

- 訂正は新しい log を作り、古い log には `superseded_by` だけを追加する
- `superseded_by` がある log を現在の判断根拠として引用しない
- 旧契約で作られた log は移行しない。path と Git 履歴によって過去資料として扱う
- `latest.md` のような上書き alias は作らない。必要なら日付順に検索する

## 質問から正本へのルーティング

| 質問                           | 正本                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| なぜ作るか / 誰向けか          | `business/strategy.md`, `business/icp.md`                    |
| 現在の価格・課金契約           | `product/specs/billing.md`、価格判断は `business/pricing.md` |
| プロダクト原則・不採用方針     | `product/principles.md`                                      |
| 現在の機能仕様                 | `product/specs/*.md`                                         |
| UI / code用語                  | `product/glossary.md`                                        |
| 訴求・コピー                   | `business/messaging.md`                                      |
| 全体 architecture / state flow | `engineering/architecture.md`                                |
| coding / API / frontend 規約   | `engineering/conventions*.md` と `.claude/rules/`            |
| env・deploy・secret            | `engineering/infra.md`, `operations/secrets.md`              |
| 障害対応・release              | `operations/runbook.md`                                      |
| 監視・alert                    | `operations/monitoring.md`                                   |
| security                       | `operations/security.md`                                     |
| 契約サービス                   | `company/accounts.md`                                        |
| 進行中Project                  | `projects/*/overview.md`                                     |
| 完了Project                    | `projects/_archive/*/overview.md`, `summary.md`              |
| なぜその判断になったか         | 各ドメインの `log/` を日付・slugで検索                       |

## 書く場所の決定木

1. 過去のある時点の記録か → 該当ドメインの `log/`
2. 有限の複数step作業か → `projects/{name}/`
3. 単一componentに閉じる visual / interaction contractか → Storybook
4. 現在の横断的な真実か → 該当ドメインの stock
5. コードが消費する値か → code / packageを正本にし、docsは意図とpathだけを書く

## 書き方

- 1ファイル1トピック。冒頭1〜2行で対象と現在性を説明する
- **現在の振る舞い**、**目標・仮説**、**過去の経緯**を同じ箇条書きで混ぜない
- 機能specは実装済みの外部挙動だけを書く。未実装はProject、理由はlogへ分ける
- exact version、env名、価格値などコードに正本がある値はpathを示し、不要に複製しない
- Mermaidを優先し、画像だけに設計情報を閉じ込めない
- generated fileは生成元とcheck commandを冒頭に明記し、手編集しない
- file / directory名はkebab-case。`log/`は日付prefixを使う
- ユーザーの声の記録は `YYYY-MM-DD-feedback-<slug>.md`（基本 `product/log/`）、障害の記録は `YYYY-MM-DD-incident-<slug>.md`（基本 `operations/log/`）と接頭辞を固定する

## 運用

- featureの振る舞いを変えたら同じ変更で該当specを更新する
- 意思決定はstock更新と新規decision logを同じ変更に含める
- 月次 `/gardening` は当月journalを一度だけ作る。追加の発見は新しい日付付きnoteへ分ける
- `pnpm docs:check` はlink、metadata、path、naming、Project lifecycle、append-onlyを検証する
- `log/`が50件を超えたら年directoryへ分割してよい。日付prefixは維持する

テンプレートは [`_templates/`](./_templates/)、AIの自発的な更新責務はroot [`CLAUDE.md`](../CLAUDE.md)を参照する。
