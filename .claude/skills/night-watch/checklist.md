# night-watch checklist v1

策定日: 2026-08-19（[#2209](https://github.com/Dayopt/dayopt/issues/2209)）。変更は通常の PR レビューを通す。夜勤 Routine 自身はこのファイルを編集しない。

各項目は「実行コマンド + 判定」の対のみで構成する。裁量的な探索・追加コマンドの実行はしない。判定規約と起票規約の正本は [SKILL.md](SKILL.md) §自動パート。

| check-id            | コマンド                                                                | 判定                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs-check`        | `pnpm docs:check`                                                       | exit code 0 のみで判定。baseline 不要                                                                                              |
| `docs-coverage`     | `pnpm docs:coverage`                                                    | `## 機能 ⇄ 公開docs` テーブル内の `なし` 件数を数え、`baseline.json` の `docs_coverage_missing` と比較。actual > baseline のみ異常 |
| `deadcode`          | `pnpm quality:deadcode:ci`                                              | exit code 0 のみで判定（merge gate と同じ閾値）。baseline 不要                                                                     |
| `dependabot-alerts` | `gh api repos/Dayopt/dayopt/dependabot/alerts?state=open --jq 'length'` | 件数を `baseline.json` の `dependabot_alert_count` と比較。actual > baseline のみ異常                                              |

## v1 から除外した項目

- **unit test skip 分解**（`pnpm test:run` の passed/skipped 集計）— `test:run` は 5 パッケージ（i18n / observability / product / web / scripts）を直列実行する集約 script で単一 summary が出ず、パース実装の複雑度が価値に見合わない。CI の Unit Tests job で毎 PR 既に可視化されているため、夜勤で重複して拾う優先度が低いと判断（plan-critic 指摘、2026-08-19）
- **bundle サイズ前夜比・build 系チェック** — #2205 コメントで「重い項目は v1 から除外してよい」と明記されている
- **判断ジャーナルの観測項目（#2195 の旧URL 404監視等）・Sentry観測系** — token 配線が必要なため v2 へ送る（#2209 明記）

これらは Sentry 観測系（token 配線含む）とあわせて v2 検討時に再評価する。
