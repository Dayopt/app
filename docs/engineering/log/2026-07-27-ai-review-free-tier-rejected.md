---
status: frozen
date: 2026-07-27
code: scripts/ai-review
---

# ai-review の無料枠運用を再検討して却下し、有料枠 + Gemini 3.1 Pro で確定した

## 背景・当時の前提

[2026-07-26 の決定](./2026-07-26-ai-review-pipeline.md)で ai-review pipeline を実装し、残るのは
`GEMINI_API_KEY` の登録と実発火確認だけになっていた（[#1737](https://github.com/Dayopt/dayopt/issues/1737)）。

着手直前に「無料枠でよいのでは」という再検討が入った。論拠は次の 2 点で、どちらも妥当な
出発点だった。

- diff の中身はほぼ AI が書いたコードで、学習されて困る情報が入っていない
- 無料で同じことができるなら、コストを払わない方がよい

## 決定と理由

**有料枠 + `gemini-3.1-pro-preview` で運用する。** 2026-07-26 の「有料枠を使う」判断は維持する。

調べた結果、前提が 1 つ崩れていた。

- **無料枠に Pro が無い**。Google 公式 pricing で `Gemini 3.1 Pro Preview` は Free Tier: Not
  available。無料枠は Flash 系（3.6 / 3.5 / 2.5 / Flash-Lite）だけ。「無料枠を使う」は
  同じレビューが無料になることではなく、**モデルのダウングレードとセット**だった
- 規約差は学習利用だけではない。無料枠には
  `Human reviewers may read, annotate, and process your API input and output` が加わる。
  有料枠は `Google doesn't use your prompts ... to improve our products` で、保持は不正検知目的の
  短期のみ
- レート制限は論点にならない。無料枠 Flash でも 10 RPM / 1500 RPD あり、月 30-50 回の発火には
  十分だった

判断で動く金額は月 $5 程度（3.1 Pro ≈ $3-5、2.5 Flash ≈ $1、無料 = $0）。AI 予算 $100-200/月に
対して、capability 側の損失の方が大きい。この pipeline は決定論ゲートが構造的に届かない
「沈黙する失敗」だけを見るために作ったもので、そこは推論の詰めがそのまま検出力になる。

input（コードの diff）が学習されること自体の実害は薄いという指摘は概ね正しい。ユーザーデータは
含まれず、secret は 1Password 側にある。ただし本 pipeline の **output** は「稼働中アプリの
この行に RLS の穴がある」という文そのもので、検出から修正までの窓が開く。有料枠を選ぶ理由の
主軸は capability、副次が output の扱いとした。

## 実運用で判明したこと

- **課金アカウントのリンクだけでは有料枠にならない**。Google の billing doc は
  `Upgrading from the Free Tier to the Paid Tier means linking a billing account and prepaying to
add a minimum of $10 of credits` と明示している。さらに
  `the Google Cloud Welcome credit or free trial credit can't be used towards the Gemini API` の
  ため、無料トライアルのクレジットでは代替できない。tier 反映は支払い後およそ 10 分
- 判定は AI Studio の「請求階層」列と rate-limit ページのバッジで行う。`無料枠` 表示のままなら
  有料枠の規約は適用されていない
- API key は 1Password `Dayopt-Shared/gemini/GEMINI_API_KEY` を master とし、GitHub の repo
  secret `GEMINI_API_KEY` を replica として同じ値を持つ。**`scripts/env/schema.ts` には登録しない**
  （app runtime が読む env ではなく CI 専用。別ライフサイクルの secret を app の env 検証へ
  相乗りさせない）
- `docs/company/accounts.md` にも追記しない。同ファイルは runtime SaaS の索引で、開発時だけ使う
  ツールは対象外と定めている

## 同時に直した実装の不整合

実発火前の確認で 2 件見つけ、同じ変更に含めた。

- `DEFAULT_MODEL` が `gemini-3-pro-preview` だった。**404 にはならない。** 2026-03-09 に
  shutdown され、以降は `gemini-3.1-pro-preview` へ暗黙に alias されている（changelog 2026-03-09:
  "The `gemini-3-pro-preview` now points to `gemini-3.1-pro-preview`"）。コードのコメントが約束する
  「404 なら利用可能な id を notice に出す」は一度も発火せず、誰も選んでいないモデルが、期限の
  告知もない alias 経由で黙って応答し続ける状態だった。id を現行の Pro に固定したうえで、応答の
  `modelVersion` を読んで要求 id と違えば notice を出す。次の alias でも同じ見落としを繰り返さない
  ための本体はこちら側で、id の固定は付随物
- **`scripts/ai-review` のテストが CI で一度も走っていなかった**。`ci.yml` の script テスト step は
  対象ファイルを列挙する形で、ai-review が入っていない。2026-07-26 の決定ログが「paths filter と
  `DANGEROUS_PATH_PATTERNS` の一致は contract test で固定した」と書いた保証が、実際にはローカル実行
  頼みになっていた。同 step の列挙へ `scripts/ai-review` を追加した（新しい job は作らない。
  CI 課金は job 単位で切り上がるため、既存 job への step 追加が最も安い）
- 構成ミスとインフラ障害を同じ経路で握り潰していた。404 / 401 / 403 / 400、契約や規約ファイルの
  欠落はいずれも決定論的で自然回復しないのに、`warn` + `exit 0` に落ちて check は green のまま
  だった。`ConfigurationError` として fail-closed に分ける
- `fetch` に timeout が無かった。Node の fetch に既定 timeout は無いため、ハングは job の
  `timeout-minutes` まで伸び、fail-open のはずの経路が red（= マージ不能）に反転する。ゲートの
  設計意図とちょうど逆向きに壊れる唯一の経路だった
- `generationConfig.temperature: 0` を渡していた。Gemini 3 系の公式ガイドは
  `we strongly recommend keeping the temperature parameter at its default value of 1.0` とし、
  1.0 未満は loop や性能劣化を招きうると明示している。再現性より検出力を優先して削除した

## 影響・やること

- 退場条件は 2026-07-26 の決定を引き継ぐ。月次ガーデニングで unique catch を棚卸しし、3 ヶ月連続で
  ゼロなら削除する
- 観察モード（`AI_REVIEW_ENFORCE` 未設定）のまま運用を開始する。実 PR で誤爆の実績を見てから
  blocking へ切り替える
- 実発火の確認は次に危険クラス path を触る PR で行う。ai-review 自身の変更は paths filter に
  入っていないため、この変更を載せた PR では発火しない
