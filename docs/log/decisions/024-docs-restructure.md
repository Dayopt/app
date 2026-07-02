# ADR-024: docs/ 構造の再編

> accepted（2026-07-02）

---

## コンテキスト

`docs/` は約2年の運用で以下の問題を抱えていた。

- **ストックとログの混在**: 現在も有効な設計判断（architecture）と、書いた時点でしか意味を持たない調査・監査ログ（audit, review）が同じ `architecture/` 直下に並んでいた
- **命名の不統一**: `business/Billing.md` のような PascalCase と `business/pricing.md` のような kebab-case が混在
- **重複ドキュメント**: 競合分析が `business/CompetitorMatrix.md` と `strategy/competitors.md` の2箇所に分裂、用語集が `glossary/terms.md`（UI表記）と `architecture/domain-glossary.md`（ドメイン概念）の2箇所に分裂
- **ADRの二系統化**: 技術判断（`architecture/adr/NNN-*.md`）とプロダクト判断（`decisions/NNN-*.md`）が別々の連番シリーズを持ち、相互参照が煩雑
- **projectsの状態不明**: `docs/projects/` に完了済み・停止済み・進行中の project が区別なく並び、どれが現役か判別できなかった
- **生成物のコミット**: `docs/api/openapi.json`（tRPCルーターから自動生成）がdocsディレクトリに手動生成物のように置かれていた

## 決定

`docs/` を「ストック（現在も有効な設計・規約）」と「ログ（時点ものの記録）」で明確に分離する構造に再編する。

### 新構造

- `architecture/{api,frontend,data,platform,conventions}/` — 技術アーキテクチャをドメイン別に細分化
- `business/{brand,marketing,sns}/` — 事業ドキュメントを統合、PascalCase命名を廃止
- `decisions/` — 技術ADR・プロダクト判断を単一の連番シリーズ（001〜）に統合
- `notes/` — 時点ものの調査・監査ログを日付プレフィックス付きで集約
- `archive/projects/` — 完了・停止した project の経緯記録
- `docs/README.md` — 新設のディレクトリ地図（旧 `guides/developer-map.md` を統合）

### 主な統合

- `business/CompetitorMatrix.md` を主として `strategy/competitors.md` の固有情報を統合し `business/competitors.md` に一本化
- `architecture/domain-glossary.md` を `glossary/terms.md` にセクションとして統合
- `architecture/adr/`（旧001-013）を `decisions/`（011-023）へ番号を振り直して合流
- `docs/api/openapi.json` を生成物としてdocsから撤去、`.generated/`（gitignore対象）に出力先変更

## Detail

移行手順・ファイル単位の移動先対応表は [`notes/2026-07-02-docs-restructure.md`](../notes/2026-07-02-docs-restructure.md) を参照。

## Consequences

- **Pros**: ストック側のみを見れば「現在の正」が分かる。ログ側は書いた時点の文脈のまま凍結され、後から歴史的記録として参照できる。ADR系統が単一連番になり相互参照が単純化
- **Cons**: 大量のファイル移動によりリンク切れリスクが発生。移行時に repo 全体（docsだけでなくコードコメント・skill設定含む）でパス参照の grep置換が必要だった
- **フォローアップ**: `docs/operations/secrets.md` の実秘密値混入監査は権限上の制約で本 restructure 実行時に完了できず、別途実施が必要
