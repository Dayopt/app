# Playwright Test Agent plans

Playwright Test Agentsのplannerが作る、人間レビュー可能なE2E計画を置く。

## 採用範囲

- plannerは既存E2Eを読んだうえで、依頼された代表フローだけを計画する
- generatorは承認済み計画のシナリオを1件ずつ生成する
- healerは採用しない。失敗をプロダクト不具合とテスト不具合に分類してから人間または通常のCodex作業で修正する

## 生成物の受け入れ条件

- `apps/product/src/lib/test/e2e/generated/` だけに新規testを作る
- role、label、安定したdata attributeを優先し、CSS classや`.first()`への依存を避ける
- `networkidle`、固定wait、失敗を握りつぶす`.catch()`を使わない
- `test.skip()`や`test.fixme()`でgreenにしない
- 既存testと重複するシナリオは追加しない
- 生成後に対象testを10回連続実行し、flakyがないことを確認する

Agent定義をPlaywright更新時に再生成すると、このリポジトリ固有の制約が上書きされる。`git diff`で確認し、planner / generatorだけを取り込む。
