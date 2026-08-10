---
status: frozen
date: 2026-08-10
code: scripts/docs-guard
---

# 凍結 log のリンク切れ 16 件を棚卸しし、恒久的に除外する

## 背景・当時の前提

`pnpm docs:check` は各ドメインの `log/` を append-only 領域として扱い、その中のリンク切れを warning としてのみ報告する（`LINK_CHECK_SOFT_DIRS`）。凍結後の log は書き換えられないため、参照先が動いてもリンクを直せないからである。

この扱い自体は 2026-07-02 に決めたものだ。docs 再編の途中で `docs/decisions/010-feature-non-adoption.md` のリンクを直そうとして append-only guard に検出され、**ガードを回避せず修正を revert した**（commit `0b58aa812`）。当時の判断は [2026-07-02-docs-operational-infra.md](./2026-07-02-docs-operational-infra.md) に「該当リンクは移動先が変わって古くなるが、append-only 領域のリンク切れは docs-guard の link-check で warning 扱いのため実害はない」と記録されている。

問題は、その後 warning が**件数だけの不透明な数**として残り続けたことにある。2026-08-10 時点で 16 件。この状態では 17 件目が出ても誰も気づかない。「仕様として受容する」と決めたのに、受容を機械が支える形になっていなかった。

## 全 16 件の内訳と後継先

リンク元は 5 ファイル、参照先は 9 種類。リンク記述は log 本文に書かれている文字列そのまま。

### 参照先が今も実在するもの（8 件）

ログ自身が `docs/decisions/` `docs/notes/`（docs 直下）から `docs/{domain}/log/` へ 1 階層深く移動した際に、相対リンクの `../` が据え置かれた。

| リンク元                                                                                                | リンク記述                                                       | 現在の正しい参照先                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `2026-04-17-positive-framing-coding-norms.md`                                                           | `../../CLAUDE.md`                                                | [CLAUDE.md](../../../CLAUDE.md)（`../../../` が正）                                                   |
| `2026-03-10-time-immutability-principle.md`（2 箇所）<br>`2026-06-16-feature-non-adoption.md`（4 箇所） | `../business/strategy.md`                                        | [strategy.md](../../business/strategy.md)（`../../business/` が正）                                   |
| `2026-06-16-feature-non-adoption.md`                                                                    | `../../supabase/migrations/20260319130001_remove_recurrence.sql` | [同 migration](../../../supabase/migrations/20260319130001_remove_recurrence.sql)（`../../../` が正） |

### 参照先が別ファイルへ統合されたもの（3 件）

`docs/architecture/api/` の 5 ファイルは 2026-07-03 の `48e63897c` で engineering へ合流した。

| リンク元                                | リンク記述                         | 統合先                                                                                          |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `2026-05-01-api-first-audit.md`         | `../architecture/api/shape.md`     | [conventions-api.md](../conventions-api.md) §Service 層 Contracts（skin-agnostic target shape） |
| `2026-05-12-service-audit.md`（2 箇所） | `../architecture/api/contracts.md` | 同上                                                                                            |

`conventions-api.md` 側は逆に [2026-05-12-service-audit.md](./2026-05-12-service-audit.md) を「前段」として参照し返している。往路のリンクだけが切れている状態である。

### 参照先が廃止され、単一の後継が無いもの（4 件）

| リンク元                                                                            | リンク記述                           | 経緯と思想の継承先                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-03-10-time-immutability-principle.md`<br>`2026-06-16-feature-non-adoption.md` | `../roadmap.md`                      | 2026-07-10 の `71cd79798` で roadmap.md を廃止。未決事項は [principles.md](../../product/principles.md) §設計上の未決リストへ統合済み。principles.md 側は逆に [time-immutability-principle.md](../../product/log/2026-03-10-time-immutability-principle.md) を参照し返している |
| `2026-06-16-feature-non-adoption.md`                                                | `../strategy/research/competitors/`  | 2026-07-02 の `a849b5d55` でディレクトリ解体。[competitors.md](../../business/competitors.md) と `docs/business/log/2026-06-15-competitor-research-*.md` 9 本へ分割                                                                                                            |
| `2026-06-16-feature-non-adoption.md`                                                | `../../.claude/rules/copywriting.md` | rules から `docs/ai/copywriting.md` へ移設後もさらに移動が続いており、宛先が安定していない。そのため本 log では固定リンクを張らず、`rg --files \| rg copywriting` で現在地を引く                                                                                               |

### checker の false positive（1 件）

`docs/marketing/log/2026-07-27-docs-faq-url-nesting.md:63` の `/docs/faq/features` は公開サイト（apps/web）の root 相対 URL であって repo path ではない。link-check が `resolve(dirname(file), '/docs/faq/features')` を計算するため、ファイルシステムの `/` から解決されて必ず存在しないと判定されていた。

**これは凍結 log と無関係な checker のバグ**で、同じ書き方を stock doc でしたら fatal の誤検知になる。stock 側に root 相対リンクが 1 本も無かったため露出していなかっただけである。

本対応では `/` 始まりを skip 対象に加えたうえで、`.md` / `.mdx` で終わるものは skip から除いた。公開サイトの route は拡張子を持たないため、`/docs/foo.md` はサイト URL ではなく repo path の書き間違い（GitHub 上でも解決しない）であり、一律 skip にすると検出漏れの穴になる。

## 根本原因

2 つの波が重なっている。

1. **2026-07-02 の docs 再編 Phase 1/2** が参照先を移動・解体した（roadmap.md / competitors/ / concept.md）。Phase 3c「移動によるディレクトリ深さ変化に伴う相対リンク修正」は stock 側にだけ適用された
2. **2026-07-03 のログ集約**（`b8f63046f` → `c7dc87fd4`）が `docs/decisions/` `docs/notes/` を `docs/{domain}/log/` へ移した。移動は R100/R096 のほぼ純粋な rename で、**相対リンクの `../` を 1 つ増やす調整が入っていない**

移動直前の tree（`b8f63046f^`）で検証すると、`../../CLAUDE.md`・`../architecture/api/shape.md`・`../architecture/api/contracts.md`・`../../supabase/migrations/...`・`../../.claude/rules/copywriting.md` はすべて正しく解決できていた。`../business/strategy.md` の 6 件は移動直前は `../business/concept.md` で、移動後の同日に concept.md → strategy.md の名称変更が凍結ログ本文にも及び、その際も深さが直されなかった。

なお `.git/shallow` により 2026-07-15 の 3 commit が shallow 境界になっているため、`git log -S` はそこへ誤帰属する。調査中に一度 PR #1614 を原因と見たが、これは clone の履歴境界による artifact であって原因ではない。

## 決定

**リンクは直さない。凍結 log の本文は 1 文字も触らない。** 2026-07-02 の判断を維持する。

理由は 2 つある。第一に、参照先が実在する 8 件は `../` を 1 つ増やせば直るが、それでも append-only guard の「frontmatter への `superseded_by` 追記だけ許可」を緩める必要があり、guard の diff 解析が行ペアの意味比較まで抱えることになる。第二に、廃止された 4 件は「直す」と**当時存在しなかった文書を指すことになる**。2026-03-10 の決定ログが 2026-07-10 産の principles.md を指すのは機械的修正ではなく編集判断であり、append-only が守っている履歴の保存そのものを壊す。

代わりに、後継先を本 log に一度だけ記録し、docs-guard 側では既知分を除外して**未登録のリンク切れだけを内訳付きで報告**する形にした。除外リストは [config.ts](../../../scripts/docs-guard/config.ts) の `KNOWN_FROZEN_BROKEN_LINKS`（10 ペア / 15 箇所）。

検討して採らなかった案:

- **known-moves マップ（旧 path → 新 path）で警告を解消する** — 11 件のうち 10 件は参照先ではなくリンク元が深くなったケースなので、マップに書く「旧 path」は `docs/product/business/strategy.md` のような**一度も存在しなかった架空の path** になる。checker を黙らせるために嘘を記録することになり、加えて log から参照される stock doc を今後動かすたびに手で追加する永続コストが付く
- **git 履歴から移動前 path で解決する** — `fetch-depth: 0` なので CI でも技術的には可能だが、GitHub 上でクリックすればリンクは依然死んでいる。警告が問題ではなく死んだリンクが問題であり、checker に嘘をつかせることになる

## 影響・やること

- 除外リストに載っていないリンク切れが log 側に出たら、それは「stock 側の移動で新たに過去の記録を壊した」合図。除外へ追加する前に、stock 側で移動をやめるか alias を残せないかを先に検討する
- 追加する場合、後継先は `KNOWN_FROZEN_BROKEN_LINKS` のコメントに書く。**本 log には追記しない** — この log 自身が `status: frozen` であり、append-only guard が `superseded_by` 以外の変更を拒否するため `pnpm docs:check` が落ちる。経緯を残す必要があれば新しい日付の log を作る。本 log は 2026-08-10 時点の棚卸しの記録であって、更新し続ける対応表ではない
- 除外リストのエントリが現在は解決する状態（stock 側の復活など）になったら、docs-guard が「除外リストの陳腐化」として報告する。config から該当行を削除する
- 未登録分・陳腐化分はいずれも warning のままで、CI の exit code には影響しない。fatal へ上げるかは今後の判断に残す
