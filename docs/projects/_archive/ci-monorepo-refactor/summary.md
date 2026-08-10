---
status: current
last_verified: 2026-08-05
code: scripts/ci
---

# ci-monorepo-refactor — 完了サマリー

epic [#1812](https://github.com/Dayopt/dayopt/issues/1812)（2026-08-04 起票 → 2026-08-05 完了）。設計と判断根拠は [overview.md](./overview.md) が正本で、本書は「何を達成したか」だけを残す。

## 達成したこと

**変更ファイルから影響範囲を一度だけ判定し、CI・merge gate・Vercel・Production Release がその結果を共有する構成になった。** 判定の正本は [`scripts/ci/impact.mjs`(../../../../scripts/ci/impact.mjs) 一箇所で、workflow の手書き paths・Vercel の skip・merge gate・release が別々の規則を持たない。

overview §3 の期待挙動は次のとおり満たされた。

| 変更                       | Product               | Web                    | Production       |
| -------------------------- | --------------------- | ---------------------- | ---------------- |
| `apps/product/**` のみ     | verify / build        | **skip**               | Product のみ更新 |
| `apps/web/**` のみ         | **skip**              | build / Actions で E2E | Web のみ更新     |
| Web/Product 共通 package   | 両方                  | 両方                   | 両方更新         |
| docs / agent Markdown のみ | skip                  | skip                   | no-op            |
| DB / server contract       | integration + Product | skip                   | Product のみ更新 |

Web 側は「Vercel Preview URL への smoke」ではなく「Actions 上の build + E2E を web 影響時だけ実行」で決着した（理由は overview §Phase 5 実施形態）。

## Phase ごとの成果

| Phase                     | 成果                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1+2（#1813）              | Impact Resolver 新設。merge gate（`finish-branch.sh`）が必要な Vercel context だけを要求するようになった。マージルール gate（未解決 review thread 0 件）も同時に導入     |
| 3（#1814）                | Production Release が live SHA からの累積 diff で project ごとに affected 判定。影響のない project は `unaffected` として success 扱い                                   |
| 4（#1817）                | Vercel preview build の skip を `ignoreCommand` 経由で有効化。production build は常時実行のまま（skip すると release が詰まるため）。Config Audit に metadata 監査を追加 |
| 5（#1815）                | web 非影響 PR で Web 系 job を skip。法務契約検査を E2E から Vitest へ移設。paths 二重管理を contract test で固定                                                        |
| 6（#1816）                | Unit test の実行環境を分割（既定 `node`、DOM が要るものだけ opt-in）。`productUnit` キーで影響のない PR は skip                                                          |
| 前提基盤（#1808 / #1809） | CI に Supabase local stack を立て、認証必須 E2E の全 skip を解消。critical journey 3 段が CI で実行されるようになった                                                    |

## 副産物として見つけて直したもの

いずれも「検証が構造的に走っていなかったせいで露見していなかった」もの。

- **CSP が local Supabase へのログインを block していた**（`apps/product/src/proxy.ts`）。判定が `NODE_ENV === 'development'` だったため、`next build && next start`（CI と同条件）では loopback が許可されず、認証が通らなかった。認証 E2E が全 skip だったので誰も気づかなかった
- **ARIA grid の不完全な実装**（`ScrollableCalendarLayout.tsx`）。セル間移動も `aria-activedescendant` も無いのに `role="grid"` / `role="row"` を付けており、axe critical の `aria-required-children` 違反だった
- **死んだアーキテクチャの E2E 2 本**（mode-switching / sidebar-persistence）。存在しない 3 ページ構成（Calendar/Stats/AI）をテストしていた
- **法務ページの href が locale prefix を失う経路**（#1846）と、`lastUpdated` がどの検証にも含まれていなかったこと

## 数値

- **Unit test の実行環境分割で −27%**（2026-08-05 実測。詳細は [計測ログ(../../../engineering/log/2026-08-05-unit-test-cost-measurement.md)）
- **e2e job は Supabase stack 込みで 4m44s**（timeout 20 分に対し十分な余裕。Supabase 起動は image pull 込み 1m38s）
- **法務契約検査は 184 行の E2E → 0.5 秒の Vitest 10 ケース**へ。ブラウザ起動が不要になった

## 意図的に残した限界

- `productJourney` / `webPreviewSmoke` は消費者が現れないまま残る。Phase 5 が両方とも別の形で決着したため。消さないのは消費側 contract を後から変えない当初の意図が生きているから
- 法務契約 test の MDX コンパイル経路は本番（`next-mdx-remote/rsc`）と異なる。Vitest で RSC を描画できないため。現時点の出力一致は旧 Playwright の期待値との byte 一致で確認済み
- `integration.yml` の paths は Impact Resolver と二重管理のまま。集約すると workflow が常時起動して 1 課金分/push が増えるため、contract test で同期を強制する形にした

## 派生 issue

- [#1842](https://github.com/Dayopt/dayopt/issues/1842) — パネル型ナビゲーションの後継 E2E 設計
- [#1843](https://github.com/Dayopt/dayopt/issues/1843) — `DayColumn` は live app 未使用の dead-code 候補
- [#1845](https://github.com/Dayopt/dayopt/issues/1845) — `block-search` の CI flaky
- [#1846](https://github.com/Dayopt/dayopt/issues/1846) — ja のセキュリティページの関連ドキュメントリンクに locale prefix が付かない
