# Architecture Decision Records (ADR)

Dayoptプロジェクトの主要な設計判断を文書化したADRインデックス。

ADR-001〜005 は Storybook (`apps/storybook/docs/dev/architecture/ADR00*.mdx`, サイドバー `Architecture/ADR/*`) を正本とする。マッピングの詳細は `apps/storybook/docs/dev/architecture/adr-mapping.mdx` を参照。

## 一覧

| ID      | タイトル                                                                                 | 日付       | ステータス | 正本                               |
| ------- | ---------------------------------------------------------------------------------------- | ---------- | ---------- | ---------------------------------- |
| ADR-001 | 統合ブロックモデル                                                                       | 2026-03-05 | accepted   | Storybook `Architecture/ADR/001`   |
| ADR-002 | Feature-Slicedアーキテクチャ                                                             | 2026-02-26 | accepted   | Storybook `Architecture/ADR/002`   |
| ADR-003 | MCP統合                                                                                  | 2026-02-26 | accepted   | Storybook `Architecture/ADR/003`   |
| ADR-004 | 3層AIアーキテクチャ                                                                      | 2026-03-02 | accepted   | Storybook `Architecture/ADR/004`   |
| ADR-005 | 時間不変原則                                                                             | 2026-03-10 | accepted   | Storybook `Architecture/ADR/005`   |
| ADR-006 | [CI品質ゲート段階的導入ロードマップ](ADR-006-ci-quality-gates-roadmap.md)                | 2026-03-19 | proposed   | root MD (Storybook 化は follow-up) |
| ADR-007 | [CLAUDE.md コーディング規範のポジティブ例示化](ADR-007-positive-framing-coding-norms.md) | 2026-04-17 | accepted   | root MD (Storybook 化は follow-up) |

## 依存関係

```
ADR-001（データモデル）
  └── ADR-005（時間制約はentriesモデルが前提）

ADR-002（Feature境界）
  ├── ADR-003（MCPはfeature境界を前提に外部ツール層を構成）
  └── ADR-004（AI層はfeature境界に沿ったrules/skillsを定義）

ADR-006（CI品質ゲート）— 独立（他ADRへの依存なし）

ADR-007（CLAUDE.md ポジティブ例示化）— 独立（他ADRへの依存なし）
```

## ADRの追加方法

1. 次の連番IDで `ADR-NNN-slug.md` を作成
2. テンプレート（frontmatter + Context/Decision/Consequences構造）に従う
3. 本文は日本語、ファイル名は英語
4. このREADMEのテーブルと依存関係図を更新
