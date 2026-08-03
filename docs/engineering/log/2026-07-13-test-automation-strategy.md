---
status: current
updated: 2026-07-13
superseded_by: docs/engineering/log/2026-08-03-playwright-test-agents-retirement.md
---

# E2EはChromiumをCIの正とし、Test Agentsはplanner / generatorだけを限定採用する

## 背景・当時の前提

#1539の確認時点で、Playwrightは12 spec・42 testを持ち、CIは`chromium`だけで全件を実行していた。`Mobile Chrome`も同じ42 testを収集するが、CIには`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`がなく、mobile専用2 testを含む認証必須testはskipされる。

Storybook browser testはCIから呼ばれていなかった。2026-07-13の実測ではlightが12 failed files、darkが13 failed filesで、apps/webのalias解決失敗と既存interaction / a11y違反が含まれていた。

#1503の確認では、Playwright 1.61.1がCodex向けplanner / generator / healer定義を生成できた。一方、生成promptのagent名がhyphen、定義名がsnake_caseで一致せず、monorepo rootからproductのPlaywright configを選ぶ指定も生成されなかった。healerには失敗testを`test.fixme()`へ変更する指示が含まれていた。

## 決定と理由

- CIのE2Eは`chromium`全specを正とする
- `Mobile Chrome`は認証情報を持つローカル検証用として残す。CI専用認証fixtureがない状態で未認証testを二重実行しない
- Storybook light / darkは決定的に終了する`pnpm test-storybook` / `pnpm test-storybook:dark`として維持するが、#1499と#1586が完了するまでCIゲートへ入れない
- Test Agentsはplanner / generatorだけをopt-in採用し、1回に1フロー・1 scenarioへ限定する
- healerは採用しない。失敗はプロダクト不具合・test不具合・環境不具合に分類してから修正する
- 生成testは`apps/product/src/lib/test/e2e/generated/`へ隔離し、人間レビューと10回連続実行を通してから既存suiteへ統合する

## 却下した選択肢と、なぜ捨てたか

- Mobile Chrome全件をCIへ追加する案は、認証必須testがskipされ、未認証testだけが重複して実行時間を増やすため却下した
- Storybook testを直ちにrequiredへ戻す案は、既知failureで全PRを常時blockするため却下した
- healerを自動修復へ使う案は、仕様回帰をtest側の変更や`fixme`で隠す可能性があるため却下した
- 既存E2EをAgent生成へ一括置換する案は、現在の意図とcleanup契約を失うため却下した

## 影響・やること

- #1499でapps/webのStorybook aliasを恒久修正する
- #1586でlight / dark suiteのinteraction・a11y failureを解消する
- CI専用認証fixtureを導入する場合、Mobile ChromeのCI実行を再評価する
- Playwright更新時はAgent定義を再生成して差分確認し、planner / generatorだけへリポジトリ固有制約を戻す
