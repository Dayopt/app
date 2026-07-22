---
status: frozen
date: 2026-07-22
last_verified: 2026-07-22
issue: 1558
code:
  - .github/workflows/production-config-audit.yml
  - scripts/production-config-audit.mjs
---

# Vercel CLI の一覧出力に認証 token が含まれた

2026-07-22、Sentry 運用確認中に Vercel CLI の一覧 command を実行したところ、pagination の案内に command line 引数として渡した認証 token の全値が含まれた。値は repository、GitHub Issue、PR、公開ログへ転記していないが、露出したものとして扱い、利用を停止した。

## 起きた事実

- Vercel CLI の一覧結果に続く pagination の案内が、認証用の `--token` 引数を値ごと再構成した。
- 出力先は private な Codex tool session だった。
- token の値、断片、長さ、hash は repository、docs、GitHub Issue、PRへ記録していない。
- 出力を確認した時点で、その token を使う Vercel CLI command を停止した。以後の確認は値を扱わない connector と GitHub の secret metadata に限定した。
- GitHub repository には `VERCEL_TOKEN` secret が存在し、trusted branch の Production Config Audit が利用している。
- 1Password CLI は未認証で、1Password master と GitHub replica が同じ値かどうかは比較していない。
- 現時点で、この出力を起点とする不正利用の証拠は確認していない。

## 影響範囲

- token は露出したものとして扱う。実際の権限 scope は値を再利用せず確認できないため未確認で、付与権限の範囲では Vercel team / project metadata へのアクセスに使われる可能性がある。
- 顧客向け deployment、domain、environment variable、Sentry event を変更した証拠はない。
- token を先に revoke すると Production Config Audit を停止させるため、replacement を master と replica へ同期し、trusted branch で audit 成功を確認してから旧 token を revoke する必要がある。

## 学び

- Vercel CLI の `--token` に長寿命 token を渡すと、CLI が生成する再実行・pagination 案内に値が含まれる場合がある。
- local の metadata 確認は connector、Dashboard、または対話 login 済み CLI を使い、長寿命 token を command line 引数へ渡さない。
- automation は token を環境変数から process 内で読み、Authorization header にだけ設定する。値を command、例外、構造化ログへ含めない。
- rotation は replacement 作成、1Password master 更新、GitHub replica 更新、trusted audit 成功確認、旧 token revoke の順で行う。

## 関連

- GitHub Issue #1558
- GitHub Issue #1566
