---
status: frozen
date: 2026-08-18
issue: 2026
---

# 手作業コンシェルジュレーンでの 1Password 生 JSON 誤貼付

2026-08-18、[#2026](https://github.com/Dayopt/dayopt/issues/2026)（R2 backup destination の実運用化）の credential 投入作業中、User 側の 1Password 操作で item の生 JSON（値入り）が chat へ誤って貼付された。露出した key は直後にローテーションし、以後は item UUID / item 名の共有のみへ切り替えて収束した。

---

## 起きた事実（時系列）

- 手作業コンシェルジュレーン（Sonnet + User）が、SOURCE 側（Supabase Storage S3）の access key を発行し、1Password `ci` vault へ登録する作業を進めていた
- SOURCE 側 access key 発行の直後、User 側の 1Password 操作で該当 item の**生 JSON（値入り）が chat に誤って貼付**された。値は本会話に一度露出した
- 露出を認識した時点で、露出した key を User 操作で**即時ローテーション（削除・再発行）**した
- 以後は 1Password の登録確認を item UUID / item 名の共有のみに切り替え、生 JSON・export は行わない運用へ変更した
- レーンは完了報告（2026-08-18T00:01:51Z、[#2026 コメント](https://github.com/Dayopt/dayopt/issues/2026#issuecomment-5322083309) 相当）でインシデントとして明記し、指揮台が同日中に受領・収束を確認した（[#2026 コメント](https://github.com/Dayopt/dayopt/issues/2026)、指揮台受領コメント）

## 影響範囲

- 露出したのは SOURCE（Supabase Storage S3 Access Key）の値。この会話内での一度限りの露出で、外部への流出や repo / issue コメントへの記録は無い
- ローテーションが露出認識の直後に行われたため、露出した値が実際に悪用された形跡はない（本記録時点で追加の実害は確認されていない）
- 他の credential（DEST 側 Cloudflare R2、GitHub Secrets 12 件）はこの事故の対象外

## 学び

- **1Password の登録確認は item UUID / item 名の照合のみで行い、`op item get` の生 JSON を表示しない。** fields に実値が混じるため、確認目的であっても生 JSON の表示・貼付を経路から外す
- 手作業コンシェルジュレーンの標準ブロック（[orchestration.md §手作業コンシェルジュレーン](../../../.claude/rules/orchestration.md#手作業コンシェルジュレーン)）へ本項目を追記した（本 PR 同梱）
- 露出 → 即時ローテーション → 経路変更、の対応順が有効に機能した実例として記録する。1Password 操作そのものは User 専管（EXPLICIT AUTHORITY 領域）のため、AI 側の手順変更では防げない事故だが、確認経路の限定（生 JSON を要求・表示しない）で再発可能性を下げる

## 関連

- GitHub Issue [#2026](https://github.com/Dayopt/dayopt/issues/2026)（R2 backup destination の実運用化）
- GitHub Issue [#2092](https://github.com/Dayopt/dayopt/issues/2092)（手作業コンシェルジュレーンの恒久化）
- `.claude/rules/orchestration.md` §手作業コンシェルジュレーン
