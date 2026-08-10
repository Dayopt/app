# Product Code Review Rules

このファイルの追加規則は `apps/product/src/` 配下の変更にだけ適用する。通常の不具合レビューは維持し、ルート `AGENTS.md` の高精度方針に従って各規則の適用条件に該当する場合だけ以下を追加確認する。

## AUTH-1: 認証・所有権・secret の境界

- **適用条件**: endpoint、tRPC procedure、Server Action、resource ID を受け取る処理、または client/server 境界を変更した場合。
- **Failure scenario**: client が送った user ID / workspace ID を信用した結果、別ユーザーのデータを読み書きできる。または service-role key / token が client bundle やレスポンスへ露出する。
- **Safe path**: server で確立した session を起点に認証し、対象resourceの所有権を server 側または RLS で検証する。secret と elevated client は server-only に保つ。
- **例外**: 公開が明示されたデータだけを返す public endpoint で、入力検証と公開範囲がコード上で確認できる場合。

## EXT-1: 外部状態・webhook・課金・cache・retry

- **適用条件**: Stripeなどの外部状態、webhook、課金権限、side effect のretry、またはそれらを表示するquery/cacheを変更した場合。
- **Failure scenario**: 偽造webhookで権限を付与する、redirect直後に古いcacheを成功状態として表示する、再送で二重処理する、またはprovider成功前にsilent grant / 誤課金を起こす。
- **Safe path**: webhookはraw payloadの署名検証後に処理し、side effect を永続的なidempotency keyまたは処理済みclaimで一意化して、確認済みのauthoritative stateを保存する。return/mutation後は該当queryをinvalidate/refetchし、未確認状態はfail closedにする。
- **例外**: 読み取り専用処理、または認証・冪等性・再送時の挙動がprovider側を含めて実装とテストの両方で確認できる処理。

## TIME-1: 時刻・日付境界

- **適用条件**: timestamp比較、日付範囲、timezone、Plan / Record の状態判定または時間編集制約を変更した場合。
- **Failure scenario**: 境界時刻を複数の `now` で評価して状態が食い違う、端点の等号を誤る、またはserver timezoneで日境界を切ってユーザーの過去・未来判定を誤る。
- **Safe path**: 1回注入した同一の `now` と明示的なユーザーtimezoneを使う。`upcoming: start_at > now`、`active: start_at <= now < end_at`、`past: end_at <= now` を保ち、時間編集制約は UI とdomain/serverの両方で防御する。
- **例外**: 状態判定やmutationに影響しない表示専用formatting。
