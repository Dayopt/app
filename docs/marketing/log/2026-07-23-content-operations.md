---
status: frozen
date: 2026-07-23
---

# コンテンツ運用方針の決定（releases 統合・AI クローラ開放・skill 移設）

## 決めたこと（1 行）

コンテンツ運用を「リリース駆動 + 月次ガーデニング」の 2 リズムに固定し、releases ページを blog に統合、AI クローラを開放、コンテンツ skill を repo 内へ移設した。

## 背景・当時の前提

- blog（en/ja 各 22 本）・公開 docs（en 9 / ja 16）・releases（v0.16.0 のみ）の基盤は稼働済みだが、束ねる運用の正本がなかった
- `blog-ideas` / `docs-audit` skill は user-global（`~/.claude/skills/`）にあり、旧リポジトリ構成（`~/Desktop/app` 等）のパスを参照して実質不動作だった
- `robots.ts` は GPTBot / Claude-Web 等の AI クローラを全面 disallow していた一方、frontmatter には RAG 向け `ai.*` メタデータを整備しており矛盾していた
- サイトはまだ外部共有していない

## 決定と理由

1. **releases → blog 統合**: リリースノートは blog の `category: 'release'` 記事にし、`/releases` ページ・feature・content を削除。blog 側にカテゴリ・タブ・i18n ラベルが実装済みで、閲覧面を 1 つに集約できる。外部共有前のためリダイレクトは設置しない（既存の `/changelog` リダイレクトのみ `/blog/release` へ付け替え）
2. **AI クローラ開放**: AI 検索経由の流入を獲得チャネルとして扱う。「ガンガン入ってほしい」（ユーザー決定）
3. **skill の repo 移設**: `blog-ideas` / `docs-audit` を `.claude/skills/` + `.agents/skills/` symlink に移設し、Codex からも参照可能にした。思想の正本参照を旧 content-guidelines.md から `docs/marketing/voice.md` に張り替えた
4. **月次ガーデニングに公開コンテンツ監査を追加**: `/gardening` Step 5.6 で `docs-audit` を実行する
5. **B1 Writing 基準の整備**（#1438）: `docs/ai/{writing-style,docs-policy,review-checklist}.md` を新設し、AGENTS.md から参照

## 却下した選択肢

- **Storybook の公開ヘルプ化**: `apps/web/content/docs` と二重管理になるため不採用。Storybook は内部専用を維持
- **`/releases` → `/blog/release` の恒久リダイレクト網**: 外部共有前で被リンクがないため不要と判断
- **ブログ執筆の義務化（リリースごとに必ず書く）**: voice.md が禁止する没個性コンテンツ化を招くため、リリース時は「ネタの issue 起票まで」に留める

## 影響・やること

- 正本: [content-operations.md](../content-operations.md)
- フォローアップ issue: 技術 SEO 修正（docs canonical/hreflang、sitemap の en URL 不一致、JSON-LD、未使用依存）と en docs 翻訳ギャップ（ja のみ 7 ファイル）
- user-global の旧 skill（`~/.claude/skills/{blog-ideas,docs-audit}/`）は削除する
