---
status: frozen
date: 2026-07-29
---

# MCP closed betaは空の一時PR Previewで検証する

## 背景・当時の前提

2026-07-26には、固定URLを持つPersistent Stagingを作る方針を決めた。その後、初期closed betaは長期運用する環境ではなく、Productionへ切り出す段階PRごとに使い捨てる検証環境で足りると判断した。追加費用と常設環境の管理を増やさず、Productionと認証、DB、secret、token、cookieを分離する必要がある。

Draft PR #1760の既存Previewは、準備手順の確認には使えた。しかし、設定変更前のseed userとsample dataがあり、DBにはProduction向けOAuth identityが固定されている。このidentityは更新または再分類しない。

## 決定と理由

- Persistent Stagingと専用DNSは作らない
- OAuthを有効にするのは、明示した1本のPR branchに対応するVercel Previewだけとする。`VERCEL_GIT_COMMIT_REF`と設定したbranchを完全一致させ、通常のPreviewではOAuthを無効のままにする
- issuerとresourceには、そのbranchの安定した`VERCEL_BRANCH_URL`を同一originで使う。deployment固有URLは使わない
- SupabaseはProduction dataをcopyしない新しい一時Preview branchを使う。seed、signup、write gateを無効にしてからmigrationとidentity設定を行う
- DB identityは、user、connection、code、token、audit、receiptがすべて0件の時だけ一度だけ追加する。同値の再試行だけを許可し、更新、削除、別環境への再分類は許可しない
- DB identityにはSupabase project refも保存する。readinessではVercelのbranch、appのSupabase URL、service-role JWTのproject ref、DB identityを一致させる。project refを確認できない時は失敗させ、代替判定へ進まない
- 回数制限にはPreview専用のUpstashを使う。Productionのcredentialや保存領域を共有しない
- Production用Sentry、Resend、Stripe、Calendarの外部送信secretをPreviewへ継承しない

これにより、検証環境はPRと一緒に破棄できる。公開OAuth identityを長期間維持することより、段階PRのexact SHAとDBを一致させ、Productionから隔離して試すことを優先する。

## 却下した選択肢と、なぜ捨てたか

- Persistent Stagingを作る — 初期closed betaには常設環境、専用DNS、追加費用が過剰である
- #1760の既存Previewを再利用する — userとsample dataがあり、固定済みProduction identityを安全に再分類できない
- deployment固有URLをissuer/resourceにする — deploymentのたびに変わり、client registrationとtoken audienceが安定しない
- markerだけでPreview OAuthを有効にする — 設定範囲を誤ると別branchのPreviewもOAuth surfaceを公開する
- ProductionのUpstashをnamespaceだけで共有する — 可用性と費用の影響をProductionから分離できない

## 影響・やること

- app、build、proxy、readinessへPreview identityとbranchの完全一致を追加する
- DBへPreview identityのinsert-once手順とSupabase project refの一致確認を追加する
- #1760の既存Previewは準備記録として残すが、OAuth検証には使わない。段階PRの検証前に破棄する
- Productionへ切り出す各段階PRは、新しい空の一時Previewでmigration、旧/new appの同時稼働、逆GRANT、再cutoverを確認する
- Preview env設定、deploy protection変更、外部client登録、DB identity設定、実データ削除は、対象環境を示した明示承認後に行う
- Preview検証完了後は接続とtokenを失効し、Vercel/Supabase PreviewとPreview専用secretを破棄する
