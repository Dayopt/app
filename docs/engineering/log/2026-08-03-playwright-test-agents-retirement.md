---
status: frozen
date: 2026-08-03
code: .codex/rules/README.md
---

# Playwright Test Agents を撤去し、E2E の追加は手書きに一本化する

## 背景・当時の前提

2026-07-13 の [test automation strategy](./2026-07-13-test-automation-strategy.md) で、Playwright Test Agents のうち planner / generator だけを opt-in で限定採用し、healer は不採用と決めた。採用時の想定は「1 回に 1 フロー・1 scenario へ限定して計画・生成を支援させる」だった。

3 週間運用した結果は次のとおり。

- planner / generator の**利用実績がゼロ**。`.codex/agents/playwright_test_planner.toml` / `playwright_test_generator.toml` と対応 prompt は生成以降 1 度も使われていない
- その間に E2E は増えており、追加分はすべて**手書き**で行われた。agent を経由した方が速い場面が実際には現れなかった
- 定義は Playwright 更新のたびに再生成と差分確認が要る（採用時の「影響・やること」に明記済み）。使われないまま保守だけが残る

AGENTS.md のシンプルルール 5「2 週間、自分が触らなかった機能は削除候補にする」に該当する。

## 決定と理由

**Playwright Test Agents の定義と prompt を撤去し、E2E の追加は手書きに一本化する。**

- 撤去対象: `.codex/agents/playwright_test_planner.toml`、`.codex/agents/playwright_test_generator.toml`、`.codex/prompts/playwright-test-plan.md`、`.codex/prompts/playwright-test-generate.md`、および `.codex/rules/README.md` / `specs/README.md` / `docs/engineering/infra.md` の該当記述
- 2026-07-13 の決定のうち、**healer 不採用**と **CI の正は `chromium`** は変更しない。撤去するのは planner / generator の採用部分だけ

限定採用は「使ってみて判断する」ための可逆な選択だった。3 週間の実績が「使わない」と出たので、判断を保留したまま保守コストを払い続けるより撤去する方が安い。再導入は Playwright に定義を再生成させれば足りるため、この決定自体も可逆である。

## 却下した選択肢と、なぜ捨てたか

- **定義を残したまま様子を見る** — 利用ゼロの原因は発見性ではなく、手書きで足りていること。放置しても次の 3 週間で結果は変わらず、Playwright 更新ごとの再生成・差分確認だけが積む
- **healer を含めて再評価する** — 2026-07-13 に却下した理由（失敗を `test.fixme()` へ変えて green にできる）は現在も有効で、再評価の材料が増えていない
- **手書き E2E 側の規約だけ強化する** — 撤去とは独立した論点。今回の scope に混ぜない

## 影響

- Codex の E2E 関連 prompt / agent は無くなる。E2E の計画と生成は通常の実装フローで行う
- `docs/engineering/infra.md` の test surface 表から `Playwright Test Agents` 行を落とし、撤去の理由と再導入手順を散文へ残す
- **再導入する場合**は Playwright に定義を再生成させ、リポジトリ固有制約（healer 不採用、単一フロー限定、`test.skip()` / 固定 wait / `networkidle` 禁止）を planner / generator へ戻す
- 2026-07-13 の log には `superseded_by` を追記し、現在の判断根拠として引用されないようにする
