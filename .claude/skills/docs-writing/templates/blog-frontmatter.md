# blog Frontmatter テンプレート

## テンプレート

```yaml
---
title: 'How to Master Timeboxing with Dayopt'
description: "Learn practical timeboxing techniques using Dayopt's planning and tracking features."
publishedAt: '2026-02-19'
updatedAt: '2026-02-19'
tags: ['timeboxing', 'productivity', 'plans', 'tips']
category: 'Product' # Product / Technology / Tips / Update
author: 'Dayopt Team'
authorAvatar: '/avatars/dayopt-team.jpg'
coverImage: '/images/blog/timeboxing-tips.jpg'
featured: false
draft: true # レビュー後に false に変更して公開

ai:
  relatedQuestions:
    - 'How do I use timeboxing effectively?'
    - 'What are some productivity tips?'
  chunkStrategy: 'h2'
  searchable: true
  difficulty: 'beginner'
  contentType: 'guide'
---
```

## フィールド定義

| フィールド     | 型       | 必須 | 説明                                           |
| -------------- | -------- | ---- | ---------------------------------------------- |
| `title`        | string   | ✅   | 記事タイトル                                   |
| `description`  | string   | ✅   | 説明文（SEO + AI要約）                         |
| `publishedAt`  | string   | ✅   | 公開日（ISO 8601）                             |
| `updatedAt`    | string   | ❌   | 更新日                                         |
| `tags`         | string[] | ✅   | タグ（3-6個）                                  |
| `category`     | string   | ✅   | カテゴリ                                       |
| `author`       | string   | ✅   | 著者名                                         |
| `authorAvatar` | string   | ❌   | アバター画像パス                               |
| `coverImage`   | string   | ❌   | カバー画像パス（`/images/blog/*`）             |
| `featured`     | boolean  | ❌   | トップページ表示（デフォルト: `false`）        |
| `draft`        | boolean  | ❌   | 下書き（デフォルト: `false`、`true` で非公開） |
| `ai`           | object   | ❌   | AI/RAGメタデータ                               |

## releases Frontmatter テンプレート

```yaml
---
version: 'v0.16.0'
date: '2026-02-19'
title: 'Bulk Operations'
description: 'Added support for bulk edit/delete operations for plans and records.'
tags: ['new-features', 'improvements']
breaking: false
featured: true
prerelease: false
author: 'Dayopt Team'
authorAvatar: '/avatars/dayopt-team.jpg'

ai:
  relatedQuestions:
    - "What's new in v0.16.0?"
  chunkStrategy: 'h2'
  searchable: true
  difficulty: 'beginner'
  contentType: 'reference'
---
```

### releases フィールド定義

| フィールド     | 型       | 必須 | 説明                                            |
| -------------- | -------- | ---- | ----------------------------------------------- |
| `version`      | string   | ✅   | バージョン番号（`v` プレフィックス付き semver） |
| `date`         | string   | ✅   | リリース日（ISO 8601）                          |
| `title`        | string   | ✅   | 内容の要約タイトル（バージョン番号は含めない）  |
| `description`  | string   | ✅   | 説明文（SEO + AI要約）                          |
| `tags`         | string[] | ✅   | 変更種別タグ（UIカラー対応）                    |
| `breaking`     | boolean  | ✅   | 破壊的変更を含むか                              |
| `featured`     | boolean  | ✅   | 注目リリースか                                  |
| `prerelease`   | boolean  | ❌   | プレリリースか（デフォルト: `false`）           |
| `author`       | string   | ❌   | 著者名                                          |
| `authorAvatar` | string   | ❌   | アバター画像パス                                |
| `coverImage`   | string   | ❌   | カバー画像パス                                  |
| `ai`           | object   | ❌   | AI/RAGメタデータ                                |

### リリースノート専用タグ（UIでカラー表示）

タグは `new-features` / `improvements` / `bug-fixes` / `breaking-changes` / `security-updates` の5種類のみを使う。この5分類は GitHub Release 本文とも共通のカテゴリ定義であり、`docs/operations/runbook.md` 第4部「リリースノート執筆規約」を正とする（ここでは再定義しない）。色・アイコンは `apps/web/src/features/releases/lib/releases.ts` の `changeTypes` 配列が正（UIの表示色を決めるコード制約のため、値をここに手動複製しない）。

### バージョンバッジの色（UI自動判定）

| パターン        | 色               | 例               |
| --------------- | ---------------- | ---------------- |
| major (`x.0.0`) | 赤 (destructive) | `v2.0.0`         |
| minor (`x.y.0`) | 青 (info)        | `v0.16.0`        |
| patch (`x.y.z`) | 緑 (success)     | `v0.16.1`        |
| prerelease      | 黄 (warning)     | `v0.17.0-beta.1` |

### リリースノートの本文構造

見出しは上記5タグと1対1対応させる（該当カテゴリがなければ見出しごと省略）。カテゴリの意味は `docs/operations/runbook.md` 第4部と共通だが、GitHub Release本文とは異なりPRリンクを含めず、エンドユーザー向けに平易な言葉で書く（`references/style-guide.md` 参照）。

```mdx
# v0.16.0 - Bulk Operations

## New Features

- **Bulk Operations**: Select and edit/delete multiple plans at once

## Improvements

- Improved drag & drop performance on mobile
- Tag selector now supports keyboard navigation

## Bug Fixes

- Fixed time overlap validation not clearing on time change
- Fixed inspector close button delay

## Breaking Changes

（該当がある場合のみ）

## Security Updates

（該当がある場合のみ）
```
