# codebase-refactoring 完了サマリー

- **期間**: 2026-06-12 〜 2026-06-15
- **規模**: 大規模（Phase 0-7 / I-01〜I-23 の 24 issue / 1 issue = 1 PR）
- **設計書**: [`overview.md`](./overview.md)
- **状態**: ✅ 完了（全 issue close、CI 全 gate green）

---

## Project ゴール

コードベース全体を段階的にリファクタリングし、「デッドコードが増え続ける構造」と「AI の精度を落とすノイズ」を解消する。挙動・UI・仕様は変えず（offline-sync の製品判断 I-23 のみ例外）、**パターン逸脱が入った瞬間に CI で落ちる**状態を作って project を閉じる。

---

## フェーズ別成果

| Phase                       | 内容                                                                                                         | 主な issue       | 状態 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | ---- |
| **P0** 調査・安全網         | knip 誤検出解消 / tag-detail liveness 表 / characterization tests                                            | I-01, I-02, I-03 | ✅   |
| **P1** 削除 + knip blocking | tag-detail dead chain 削除 / 空 package 削除 / unused exports 削減 / knip CI blocking 化 / offline-sync 削除 | I-04〜I-07, I-23 | ✅   |
| **P2** 構成・命名・責務     | feature barrel 契約整理 + date-utils 吸収 / packages 統合                                                    | I-08, I-22       | ✅   |
| **P3** service 層統一       | settings / auth recovery / entry の service 抽出 / 巨大 service・hook 分割                                   | I-09〜I-12       | ✅   |
| **P4** 状態管理             | server state 保持 Zustand store を TanStack Query へ移行 / settings optimistic update                        | I-13, I-14       | ✅   |
| **P5** DB / RLS             | 孤児 DB RPC drop / RLS snapshot 自動生成 + CI drift check / ロジック置き場方針                               | I-15, I-16       | ✅   |
| **P6** test / docs          | RLS integration parameterized suite / auth・chronotype・contact テスト補強 / project docs summary 整備       | I-17〜I-19       | ✅   |
| **P7** 再発防止・締め       | eslint-disable 棚卸し + 再発防止ルール / project summary                                                     | I-20, I-21       | ✅   |

---

## before / after metrics

### デッドコード（knip）

| 指標           | before（2026-06-12 Phase 0 計測）           | after（2026-06-15）                                                          |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| unused exports | 219                                         | **0**                                                                        |
| unused types   | 249                                         | **0**                                                                        |
| unused deps    | 8（+ indirect devDeps 15 を誤検出）         | **0**                                                                        |
| unused files   | 12                                          | 9（CI では `--exclude files` で除外、残りは barrel 等の意図的 export point） |
| knip CI        | `--no-exit-code` で **decして fail しない** | **blocking + green**（unused export/type/dep が増えると CI fail）            |

### コード削減（主なもの）

- tag-detail dead chain 削除（I-04）: **約 -2,125 行**（component 6 / dead hook 3 / dead procedure 群 + stories / i18n）
- offline-sync 削除（I-23, Q4 製品判断）: 自前同期エンジン実装 + `offline-sync.test.ts` 1,278 行 + e2e spec（TODO 42 件）を撤去。PWA installability は存続
- 空 package 削除（I-05）: `@dayopt/utils` / `@dayopt/server`
- 孤児 DB RPC drop（I-15）: tag-detail 系 9 関数。コード（I-04）と DB の dead chain を両面で解消

### 構造的改善

- server state を保持する Zustand store **3 → 0**（TanStack Query へ一本化、I-13/I-14）
- tRPC router からの `ctx.supabase` 直呼び **解消**（settings 7 + entry 1 を service 層へ、I-09/I-12）
- RLS snapshot を `pnpm rls:snapshot` で自動生成 + CI drift check（`apps/storybook/docs/dev/db/rls-snapshot.md`、I-16）
- eslint-disable 46 件を機械検証（stale 0 件）、`reportUnusedDisableDirectives: error` で再発防止（I-20）

---

## 要確認 Q1-Q7 の最終判断

| #   | 項目                                             | 決定（2026-06-12）                                                | 結果                                                                 |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Q1  | tag-detail チャート 6 件 + dead chain の削除可否 | **削除する**（liveness 表で dead 確定した export 単位）           | I-04 / I-15 で完遂                                                   |
| Q2  | `toast.info` / `toast.warning`（@deprecated）    | **現状維持**（Inline Banner 移行は UI 変更を伴うため本計画外）    | 据え置き                                                             |
| Q3  | migration squash（baseline 再生成）              | **見送り**（判断資料のみ作成し将来再検討）                        | [`migration-squash-assessment.md`](./migration-squash-assessment.md) |
| Q4  | PWA offline-sync（製品判断）                     | **機能を切る**（コード・spec を削除、経緯と再導入条件を docs 化） | I-23 で完遂                                                          |
| Q5  | `@tanstack/react-virtual` 等の依存削除可否       | **I-01 の再調査結果に従う**（使用ゼロ確定分のみ削除）             | I-01/I-06 で反映                                                     |
| Q6  | `packages/domain` barrel の export 整備          | **現状維持**                                                      | 据え置き                                                             |
| Q7  | packages 統合（10 → 2-3 個）                     | **統合する（低優先）**                                            | I-22 で実施                                                          |

---

## 見送り事項と再検討条件

| 事項                                                                   | 見送り理由                                                                                      | 再検討する条件                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **migration squash**（active 115 / `_archive` 116 の baseline 再生成） | solo / pre-launch では churn コストに見合う情報価値が薄い。判断資料のみ作成                     | migration 数がさらに増えて新規環境セットアップ（`db:fresh`）が体感で遅くなった時、または複数開発者参加で履歴の可読性が問題化した時。手順・リスクは [`migration-squash-assessment.md`](./migration-squash-assessment.md) を起点にする |
| **offline-sync の再導入**                                              | 自前同期エンジンが中途半端で保守コストが高い（Q4）                                              | 同期エンジンを「自作でなく購入/採用」する別 plan が立った時。installability（manifest / install prompt）は残しているので PWA 基盤は再利用可                                                                                          |
| **`toast.info` / `toast.warning` の Inline Banner 移行**（Q2）         | UI 変更を伴いリファクタと混ぜない方針                                                           | Inline Banner の design が確定し、UI 変更を含む別 plan として切り出せる時                                                                                                                                                            |
| **600 行超 warn lint**（I-20 任意項目）                                | 機械的検知の費用対効果が現時点で薄い（巨大 service は I-12 で分割済み、再発の実害が出ていない） | 巨大ファイルの再発が複数回観測された時に file-size lint を導入                                                                                                                                                                       |

---

## 残課題 / follow-up

- **Supabase advisors 棚卸し**（I-16 の②）: production の security / performance advisor 確認は cloud supabase MCP の token が必要で、本 project 期間中は期限切れのため未実施。token 復旧後に別 follow-up で `get_advisors` を実行し、指摘を issue 化する。
- `@typescript-eslint/no-unused-vars` は引き続き `off`（TS 本体 + Prettier が未使用 import を消すため低優先）。on 化は費用対効果が薄いと判断（I-20）。

---

## 学び

- **検出器の信頼回復を最初にやる（Phase 0）**: knip の誤検出を潰してから削除に入ることで、「消してよい」根拠が機械的に得られた。
- **削除は export 単位**: ファイル単位でなく export 単位で liveness を確定すると、live / dead が同居するファイル（`useTagDetailData.ts` の 4 hooks 中 3 つが dead 等）を安全に削れる。
- **DB RPC drop は順序厳守**: コード側削除を production へ deploy → Sentry 静穏確認 → drop migration。単一 production project 運用では PR Preview は DB 分離の安全網にならない。
- **生成 docs は CI drift check で守る**: RLS snapshot / openapi.json は手動運用だと陳腐化する。`pnpm rls:snapshot` のように 1 コマンド生成 + CI 差分検出にする。
- **再発防止は「CI で落ちる」状態にして初めて完成**: knip blocking（I-07）、reportUnusedDisableDirectives（I-20）、lint:boundaries、RLS drift check が steady-state を維持する。

---

## 関連リンク

- 全体設計: [`overview.md`](./overview.md)
- knip 棚卸し: [`knip-audit.md`](./knip-audit.md)
- tag-detail liveness: [`tag-detail-liveness.md`](./tag-detail-liveness.md)
- characterization tests: [`i03-characterization.md`](./i03-characterization.md)
- migration squash 判断資料: [`migration-squash-assessment.md`](./migration-squash-assessment.md)
- RLS snapshot: `apps/storybook/docs/dev/db/rls-snapshot.md`（`pnpm rls:snapshot` で生成）
