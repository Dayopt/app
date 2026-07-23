---
status: frozen
date: 2026-07-23
code:
  - docs/operations/tooling.md
  - .claude/rules/mcp-usage.md
---

# EagleをStorybook同期基盤から視覚参照ライブラリへ作り直す

2026-04-08 に設計した「Storybook の全 story を撮影して Eagle へ自動同期する」パイプラインを廃止し、Eagle の役割を「目で見て判断する素材の視覚検索ライブラリ」へ定義し直した。設計と現物が別方向を向いたまま 3 ヶ月経過していたため、現物側に設計を寄せる。

## 起きた事実

- 2026-04-08 の設計（`docs/operations/tooling.md` 第1部・全10章）に対し、`scripts/eagle-{capture,sync,cleanup,lookup,api}.ts` と `parse-filename.ts`、`.claude/skills/eagle-dayopt/` を実装した。
- 2026-07-07 の AI 設定監査（`docs/engineering/log/2026-07-07-ai-config-audit.md`）で eagle-dayopt が「使用実績なし」と記録された。本日時点でも実行痕跡はない。
- 一方、実ライブラリ `~/Desktop/Dayopt.library` は 2,013 件。内訳は競合・参考アプリの UI スクリーンショットが 1,776 件（ticktick 399 / otterlife 387 / tiimo 359 / structured 198 / aday 168 / journal 119 / weather 91 / joy-planner 52 / eagle-site 3）、残り 237 件が素材類（アイコン svg 130 / 番号のみの素材パック 27 / font ttf 4）と、方針上は置かないと判断したもの（design token 画像 59 / repo アセットの複製 13 / Storybook スナップショット 2 / schema 図 1）。
- そのライブラリは **タグ 0 件・フォルダは `Archive` 1 つのみ・タググループ 0 件**。設計書が定義した `Components/` `Features/` `Foundations/` `Inspiration/` `Marketing/` は 1 つも作られていない。
- Eagle の AI セマンティック検索プラグインは導入済みで `status: ready` / `serviceHealthy: true` だが、`totalSyncedItems: 0` でインデックス未構築。`ai_search_by_text` はエラーを返す。

## 判断

Eagle = **「目で見て判断する素材」の視覚検索ライブラリ**。バックアップ用の保管庫ではなく、日常的に開いて探す場所とする。

原則は 3 つ。

1. **カテゴリごとに「正」を 1 つに決める。** repo から再生成できるもの（Storybook スナップショット、design token 画像、repo 内アセットの複製）は Eagle に置かない。逆に、手作りで再生成できないブランドクリエイティブは Eagle が正とする。repo が持つのは実際に配信されるファイルだけで、master・variant・repo に入らない完成品（SNS / Product Hunt 用）は Eagle が持つ。
2. **収集物に意味づけを先回りしない。** 集めた参考 UI に一括で意味的なタグを付けない。分類は「収集元アプリ」という機械的な事実だけに留め、横断検索は AI セマンティック検索に任せる。curation は使う瞬間に行う（検索して良かったものにだけ ★ と pattern タグを付ける）。
3. **repo に Eagle 用コードを持たない。** 接点は Eagle アプリ（人）と Eagle MCP（エージェント）の 2 つに限る。CLI ラッパーは消費者がいない。

## なぜこの判断か

旧設計が死んだ原因は品質ではなく、**存在しない需要に対して新しい習慣を要求したこと**にある。「タグ単位で撮影 → 同期 → ★レビュー → 30日後 Archive 掃除」という 4 ステージの運用を人間に課したが、実装の見た目を確認する用途は Storybook 本体（と Storybook MCP）で完全に満たされており、Eagle 側のコピーは撮った瞬間から陳腐化するだけだった。同じ対象に「正」が 2 つある状態を作ったことが構造的な誤りだった。

新設計は逆に、既に自然発生していた行動（参考 UI を集める）の上に構造を被せるだけで、維持のための定常作業を要求しない。curation をサボってもアプリ別フォルダと検索は機能し続ける。**運用しなくても嘘にならない設計**であることを採用条件とした。

## 決めたこと

- ライブラリ構造: `Refs/{アプリ名}` に参考 UI を収集元別で置く。curated は ★4 以上を Eagle アプリ上のスマートフォルダ `⭐ Picks` で束ね、pattern タグ 12 語彙（onboarding / paywall / empty-state / calendar / timer / stats / settings / navigation / bottom-sheet / list / widget / notification）で分類する。他の実フォルダは `Assets/` `Brand/` `Product/` `Archive/`。
- `Brand/` はブランドクリエイティブの正とする唯一のカテゴリ。`Logo/` `ProductShots/` を全チャンネル共通の素材層として分離し、`OGP/` `SNS/` `ProductHunt/` `LP/` に完成品、`Inspiration/` に他社参考を置く。命名は `{YYYY-MM-DD}_{用途}`、annotation に出所（Figma URL 等）と掲載先を残し、`shipped` / `draft` タグで状態を持つ。
- ★の意味を変更する。旧: ★3 = 自動生成デフォルト（要レビュー）。新: ★5 = Dayopt で実際に参照採用、★4 = 良い参考。自動生成が消えるためレビュー待ち状態は不要になった。
- 撤去対象: `scripts/eagle-*.ts` 全 5 本と `parse-filename.ts`、`.claude/skills/eagle-dayopt/`、`package.json` の `eagle:*` scripts。Eagle の運用ルールは `.claude/rules/mcp-usage.md` の Eagle 節に一本化する。
- ライブラリの実データは削除しない。方針上ここに置かないと判断したもの（design token 画像・Storybook スナップショット・repo アセットの複製・schema 図）は `Archive/` へ移し、判別不能な素材は `Assets/Packs` に寄せて、処分判断は後日に残す。

## 実装中に判明した事実

以下は当初の想定と異なり、方針の一部を実態に合わせて変更した。

- **件数の誤認**: Eagle MCP の `item_get` は引数キーが `params` でないと**黙って無視**され、`limit` / `offset` を付けても常に全件を返す。`arguments` を使った初回調査ではページングが効かず同じ全件が繰り返し返り、重複を数えて約 2.4 万件と誤認していた。正しくは 2,013 件。
- **スマートフォルダは MCP から作れない**: `GET /api/tools/list` が返す 31 tool に `smart_folder_*` は存在しない（削除した `scripts/eagle-api.ts` は `smart_folder_create` を呼んでいたので、旧パイプラインのセットアップはそもそも成功しなかった可能性が高い）。このため `Refs/{アプリ名}` は当初案のスマートフォルダではなく**実フォルダ**として作り、items を割り当てた。件数が 1,776 件と小さく、割り当ては可逆なため実害はない。`⭐ Picks` などのスマートフォルダは Eagle アプリ上での手作業とする。
- **`item_query` はファイル名を検索できない**: タグと annotation が対象。タグ 0 件の状態では何も返さない。名前で絞るには `item_get` + クライアント側フィルタが必要。

## 未確認事項

- Eagle の AI 検索の実用精度。ローカルモデル（テキスト 128 次元 / 画像 384 次元）で「paywall screen」のような抽象クエリがどれだけ拾えるかは、インデックス構築後の実クエリでしか判断できない。精度が不足する場合、pattern タグへの依存度が上がり curation の規律が必要になる。インデックス構築は Eagle アプリ側の操作が必要で、本作業時点では未実施。
- `Brand/` への保存だけは既存行動ではない新しい習慣であり、定着するかは未検証。定着しなくても失うのは過去クリエイティブの検索性のみで、負債は残らない。
