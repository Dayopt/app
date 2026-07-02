# Architecture Decision Records (ADR)

Dayoptプロジェクトの主要な設計判断を文書化した記録。

---

## 一覧

| ID                                                        | タイトル                                                                 | 日付       | ステータス |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- | ---------- |
| [ADR-011](011-unified-block-model.md)                     | 統合ブロックモデル                                                       | 2026-03-05 | accepted   |
| [ADR-012](012-feature-sliced-architecture.md)             | Feature-Slicedアーキテクチャ                                             | 2026-02-26 | accepted   |
| [ADR-013](013-mcp-integration.md)                         | MCP統合                                                                  | 2026-02-26 | accepted   |
| [ADR-014](014-ai-architecture-layers.md)                  | 3層AIアーキテクチャ                                                      | 2026-03-02 | accepted   |
| [ADR-015](015-time-immutability-principle.md)             | 時間不変原則                                                             | 2026-03-10 | accepted   |
| [ADR-016](016-ci-quality-gates-roadmap.md)                | CI品質ゲート段階的導入ロードマップ                                       | 2026-03-19 | proposed   |
| [ADR-017](017-positive-framing-coding-norms.md)           | CLAUDE.md コーディング規範のポジティブ例示化                             | 2026-04-17 | accepted   |
| [ADR-018](018-time-overlap-prohibition.md)                | 時間重なりの全面禁止（EXCLUDE 制約）                                     | 2026-05-13 | accepted   |
| [ADR-019](019-auto-record-model.md)                       | 自動記録モデル（過ぎた予定を実績とみなす）                               | 2026-06-10 | accepted   |
| [ADR-020](020-soft-delete-model.md)                       | entries の論理削除（soft delete）                                        | 2026-03-18 | accepted   |
| [ADR-021](021-shared-packages-canonical-and-app-shims.md) | デザインシステム共有レイヤー（packages を canonical、app は直接 import） | 2026-06-22 | accepted   |
| [ADR-022](022-component-taxonomy.md)                      | 共有 component の責務ベース taxonomy（第二階層）                         | 2026-06-23 | accepted   |
| [ADR-023](023-storybook-ownership-taxonomy.md)            | Storybook story-title の所有境界 top-level（Shared / Product / Web）     | 2026-06-24 | accepted   |
| [ADR-024](024-docs-restructure.md)                        | docs/ 構造の再編                                                         | 2026-07-02 | accepted   |

---

## 依存関係

```
ADR-011（データモデル）
  ├── ADR-015（時間制約はentriesモデルが前提）
  ├── ADR-019（自動記録モデルはentriesにactual二層とunplannedを追加）
  └── ADR-020（論理削除はentriesのdeleted_atを前提）

ADR-019（自動記録モデル）
  └── ADR-018（重なり禁止。自動記録のactual NULLはサービス層で防衛）

ADR-018（時間重なり禁止）
  └── ADR-020（EXCLUDE制約はdeleted_at IS NULLを前提）

ADR-012（Feature境界）
  ├── ADR-013（MCPはfeature境界を前提に外部ツール層を構成）
  └── ADR-014（AI層はfeature境界に沿ったrules/skillsを定義）

ADR-016（CI品質ゲート）— 独立（他ADRへの依存なし）

ADR-017（CLAUDE.md ポジティブ例示化）— 独立（他ADRへの依存なし）
```

---

## ADRの追加方法

1. `docs/decisions/NNN-title.md` を作成（kebab-case、本文は日本語、番号は `docs/decisions/` 内の次の空き番号）
2. テンプレート: Context → Decision → Detail → Consequences
3. この一覧表に行を追加

> 技術 ADR は以前 Storybook MDX（`apps/storybook/docs/dev/architecture/`）を正本としていたが、ビルド不要で GitHub 上から直接読めるよう plain Markdown として抽出した。2026-07-02 の docs 再編で `docs/architecture/adr/` から `docs/decisions/` へ合流し、プロダクト判断のログ（旧 001-010）と技術 ADR（旧 architecture/adr 001-013 → 011-023）を単一の連番シリーズに統合した。
