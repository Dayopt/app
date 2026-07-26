---
status: frozen
date: 2026-07-26
---

# 「すべてのデータを削除」は外部AIとカレンダーの接続権限も失効する

## 背景・当時の前提

MCPのwrite toolはclient側の確認後にDayoptの正規データを直接変更する。一方、現在のSettingsの「すべてのデータを削除」はPlan、Record、tag、user settingsだけを削除し、MCPと外部カレンダーの接続を残す。削除完了後も、残った接続や削除開始前のcallbackからデータが再作成される余地がある。

## 決定と理由

- user単位exclusive transactionで、Plan、Record、tag、user settings、週次・月次のAI生成reportに加え、全MCP connection、未消費authorization code、access/refresh token、Calendar connection、暗号化済みtoken、選択calendar、sync cursor、ユーザー所有のexternal event mirrorを削除・失効する。account維持に必要なprofile、課金状態、MFA recovery codeは残す
- 削除開始前のCalendar OAuth callbackを拒否できるようuser data generationを進める。MCP applyとCalendar syncも、削除の前後で正規データを戻せないことを競合試験で固定する
- local DB purgeと同じtransactionで暗号化済みrefresh tokenだけをrevoke-only outboxへ移し、commit成功後にprovider revokeをretryする。provider側の失敗でlocal authorityやデータを復活させない
- success mutation receiptは本文を持たないidempotency tombstoneとして90日残す。purge後のretryでは消えたresourceを成功として返さず、再作成も行わない。consumed/expired authorization codeとrevoked/expired access tokenは24時間、rotated/revoked refresh tokenは30日、revoked connectionとpayload-free security eventは90日で削除する
- revoke-only outboxは成功時に即時削除し、失敗時も24時間で暗号化済みtokenを削除してpayload-free failure eventだけを残す
- account削除ではprovider revokeを削除前に一度だけ試し、成否にかかわらず既存cascadeで上記データとoutboxを即時削除する。account削除後にtokenを保持しない
- 初期betaのread監査はpayloadを持たないaggregate metricだけとし、tool入力や返却本文を長期保存しない

削除後に外部接続からデータが戻らないことを、「すべてのデータを削除」というユーザーの期待に合わせる。receiptは監査本文ではなく、同じ操作の再適用を防ぐ最小情報だけを期限付きで残す。

## 却下した選択肢と、なぜ捨てたか

- 接続を残し、削除後も外部AIやCalendarがデータを追加できることだけを文言で説明する — 操作名から期待される最終状態と合わない
- provider revokeを先に行う — provider成功後にDB purgeが失敗すると、Dayoptのデータだけが残る部分成功になる
- receiptを即時削除する — response loss後のretryで同じmutationを再適用できてしまう
- read本文を長期auditする — 初期betaの安全性に必要な範囲を超えて、ユーザー本文の保存面を増やす

## 影響・やること

- Settingsのpurge commandを新versionへ進め、MCPとCalendarを同じtransaction境界へ含める
- 週次・月次のAI生成reportをpurge対象へ含める
- Calendar OAuth stateをuser data generationへbindし、古いcallbackを拒否する
- local commit後のprovider revokeをrevoke-only outboxから実行し、retry、24時間expiry、失敗観測を実装する
- receiptにpurge世代をbindし、purge後のretryをtombstone responseへ変える
- retention cleanupをbounded batchとDB時刻で定期実行し、本文を含まないbacklog statusだけを監視する
- delete、MCP apply、Calendar callback/syncの競合integration testを追加する
