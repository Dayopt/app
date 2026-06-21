# Architecture Decision Records (ADR)

Dayoptプロジェクトの主要な設計判断を文書化した記録。

---

## 一覧

| ID                                                        | タイトル                                                           | 日付       | ステータス |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- |
| [ADR-001](001-unified-block-model.md)                     | 統合ブロックモデル                                                 | 2026-03-05 | accepted   |
| [ADR-002](002-feature-sliced-architecture.md)             | Feature-Slicedアーキテクチャ                                       | 2026-02-26 | accepted   |
| [ADR-003](003-mcp-integration.md)                         | MCP統合                                                            | 2026-02-26 | accepted   |
| [ADR-004](004-ai-architecture-layers.md)                  | 3層AIアーキテクチャ                                                | 2026-03-02 | accepted   |
| [ADR-005](005-time-immutability-principle.md)             | 時間不変原則                                                       | 2026-03-10 | accepted   |
| [ADR-006](006-ci-quality-gates-roadmap.md)                | CI品質ゲート段階的導入ロードマップ                                 | 2026-03-19 | proposed   |
| [ADR-007](007-positive-framing-coding-norms.md)           | CLAUDE.md コーディング規範のポジティブ例示化                       | 2026-04-17 | accepted   |
| [ADR-008](008-time-overlap-prohibition.md)                | 時間重なりの全面禁止（EXCLUDE 制約）                               | 2026-05-13 | accepted   |
| [ADR-009](009-auto-record-model.md)                       | 自動記録モデル（過ぎた予定を実績とみなす）                         | 2026-06-10 | accepted   |
| [ADR-010](010-soft-delete-model.md)                       | entries の論理削除（soft delete）                                  | 2026-03-18 | accepted   |
| [ADR-011](011-shared-packages-canonical-and-app-shims.md) | デザインシステム共有レイヤー（packages を canonical、app は shim） | 2026-06-22 | accepted   |

---

## 依存関係

```
ADR-001（データモデル）
  ├── ADR-005（時間制約はentriesモデルが前提）
  ├── ADR-009（自動記録モデルはentriesにactual二層とunplannedを追加）
  └── ADR-010（論理削除はentriesのdeleted_atを前提）

ADR-009（自動記録モデル）
  └── ADR-008（重なり禁止。自動記録のactual NULLはサービス層で防衛）

ADR-008（時間重なり禁止）
  └── ADR-010（EXCLUDE制約はdeleted_at IS NULLを前提）

ADR-002（Feature境界）
  ├── ADR-003（MCPはfeature境界を前提に外部ツール層を構成）
  └── ADR-004（AI層はfeature境界に沿ったrules/skillsを定義）

ADR-006（CI品質ゲート）— 独立（他ADRへの依存なし）

ADR-007（CLAUDE.md ポジティブ例示化）— 独立（他ADRへの依存なし）
```

---

## ADRの追加方法

1. `docs/architecture/adr/NNN-title.md` を作成（kebab-case、本文は日本語）
2. テンプレート: Context → Decision → Detail → Consequences
3. この `index.md` の一覧表に行を追加

> 技術 ADR は以前 Storybook MDX（`apps/storybook/docs/dev/architecture/`）を正本としていたが、ビルド不要で GitHub 上から直接読めるよう plain Markdown として `docs/architecture/adr/` へ抽出した。プロダクト判断のログは `docs/decisions/NNN-*.md`（別系統）。
