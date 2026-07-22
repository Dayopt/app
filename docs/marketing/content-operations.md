---
status: current
last_verified: 2026-07-23
---

# コンテンツ運用（正本）

プロダクト更新 → Storybook / 公開 docs 更新 → ブログという一連のコンテンツ運用の正本。決定の経緯は [log/2026-07-23-content-operations.md](./log/2026-07-23-content-operations.md)。

## 3 面の役割分担

| 面                                  | 対象読者                                  | 責務                                                      | 公開                       |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------------- | -------------------------- |
| Storybook                           | 開発者・AI                                | 単一 component の使い方・variant・visual state            | 内部専用（デプロイしない） |
| 内部 docs（repo 直下 `docs/`）      | 創業者・開発者・AI                        | 仕様・設計・判断・運用の SSOT                             | 内部専用                   |
| 公開 content（`apps/web/content/`） | エンドユーザー・検索エンジン・AI クローラ | docs（usage）/ blog（context）/ リリースノート（changes） | dayopt.app                 |

Storybook は公開ヘルプ化しない。ヘルプページの役割は `apps/web/content/docs` が担う（同じ説明の二重管理を避ける。`docs/README.md` §情報面の責務）。

公開 content 内の 3 種類の役割分担は [docs/ai/docs-policy.md](../ai/docs-policy.md)、文章基準は [docs/ai/writing-style.md](../ai/writing-style.md) を正とする。

## リリースノートは blog の release カテゴリ

独立した `/releases` ページは持たない（2026-07-23 廃止）。リリースノートは `apps/web/content/blog/{en,ja}/vX-Y-Z.mdx` に `category: 'release'` の blog 記事として書き、`/blog/release` タブに表示する。書式は `.claude/skills/docs-writing/templates/blog-frontmatter.md`。

## 更新の連鎖（リリース駆動）

プロダクトの振る舞いが変わったら、この順で連鎖させる。

| タイミング | 更新するもの                                                  | 担当ルール                         |
| ---------- | ------------------------------------------------------------- | ---------------------------------- |
| 実装 PR    | Storybook story を同時更新                                    | `docs/engineering/storybook.md`    |
| 実装 PR    | `docs/product/specs/` の該当 spec を同じ変更で更新            | `AGENTS.md` §Docs 運用責務         |
| リリース   | GitHub Release + blog の `release` 記事（en/ja）              | `releasing` + `docs-writing` skill |
| リリース   | 公開 docs の該当ページ更新（`draft: true` → レビュー → 公開） | `docs-writing` skill               |
| リリース   | ブログネタを issue 起票**だけ**する                           | `blog-ideas` skill                 |

ブログは起票までを自動リズムに入れ、執筆は切り離す。docs は網羅性が価値なので更新を義務化し、ブログは `docs/marketing/voice.md` の 3 本柱に合うものだけ選んで書く（義務化すると禁止している「AI 大量生成の没個性コンテンツ」になる）。

## 月次ガーデニング

`/gardening` の Step 5.6 で `docs-audit` skill を実行し、機能 ↔ 公開 docs のギャップ・鮮度乖離・en/ja 非対称を Issue 化する。翌月のコンテンツバックログはここから補充する。

## SEO 方針

- **docs = 機能リファレンス層。** 機能名・指名クエリを受ける。網羅・正確・更新が命。en/ja 両方必須
- **blog = 課題起点層。** 非指名クエリ（例: "time blocking vs todo list"）で新規読者を獲得し、本文の内部リンクで docs へ送る（topical cluster 構造）
- **AI クローラは全面許可**（2026-07-23 決定）。AI 検索・AI アシスタント経由の言及を獲得チャネルとして扱い、frontmatter の `ai.*` メタデータ（relatedQuestions / relatedDocs / chunkStrategy）を全コンテンツで整備する
- 数より質。`docs/marketing/strategy.md` の禁止事項（煽らない・AI 大量生成を流さない）を上位とする

## 関連

- 発信の思想・3 本柱: [voice.md](./voice.md)
- グロース全体: [strategy.md](./strategy.md)
- 執筆手順: `.claude/skills/docs-writing/SKILL.md`
- ネタ出し: `.claude/skills/blog-ideas/SKILL.md` / 監査: `.claude/skills/docs-audit/SKILL.md`
