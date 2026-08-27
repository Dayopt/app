---
status: frozen
date: 2026-08-27
---

# Next.js 16.3.3 Critical 2 件（Windows RCE / AVIF RCE）の露出評価

## 背景

[#2447](https://github.com/Dayopt/dayopt/issues/2447)。Next.js が 2026-08-25 に公開した August 2026 Security Release で Critical severity 2 件が修正された。Dayopt は Product / Web とも `next: ^16.2.11` を宣言しており、lockfile の実解決版は `16.2.11` と `16.3.0` の混在で、両 advisory の affected range（`>=16.0.0 <16.3.3`）に入っていた。

- GHSA-p293-qw3h-jr36 — Windows-hosted server RCE（CVSS 9.0）
- GHSA-2xp9-vwfh-vxw4 — AVIF Image Optimization RCE（CVSS 9.5）

patch 適用（`next` / `@next/*` / `eslint-config-next` を `16.3.3` へ更新）は exposure の有無に関わらず実施した。本ログは露出範囲の確認結果のみを記録する。

## GHSA-p293-qw3h-jr36（Windows-hosted RCE）: 非該当

**攻撃条件（Windows filesystem 上でのホスティング）に Dayopt のどの経路も該当しない。**

- Production / Preview: [docs/engineering/infra.md](../infra.md) の環境表のとおり Vercel managed hosting（`Vercel Preview (product)` / `Vercel Production`）。Vercel の Next.js runtime は Linux ベースのサーバーレス実行環境で、Windows filesystem 上のホストではない
- CI: `.github/workflows/*.yml` 全 workflow の `runs-on` を実測したところ、例外なく `ubuntu-latest`（Linux）。Windows runner は 1 つも存在しない（`grep -n "runs-on:" .github/workflows/*.yml` で確認）
- ローカル開発: 本セッションを含め、開発機は macOS（`docs/engineering/infra.md` の運用が前提とする環境と一致）。Windows 上での self-hosted 実行経路は運用上存在しない

## GHSA-2xp9-vwfh-vxw4（AVIF Image Optimization RCE）: 攻撃可能な入力経路が存在する

**patch 適用が必須で、露出低減のための追加対応も推奨する。**

### 設定確認

- Product (`apps/product/next.config.mjs:180`) / Web (`apps/web/next.config.mjs:249`) とも `images.formats: ['image/avif', 'image/webp']` を明示しており、AVIF Image Optimization は有効
- `next/image` の使用箇所: Product は `apps/product/src/components/ui/inputs/avatar-upload.tsx`（アバター画像プレビュー）と `apps/product/src/components/shell/sidebar/Sidebar.tsx`（アバター表示）。Web は `BlogImage.tsx` / `ContentMDXComponents.tsx`（blog 記事内画像、社内コンテンツのみ）

### 入力経路の洗い出し

| remotePatterns 許可先                                                   | 由来                                              | ユーザー/外部入力の混入余地                        |
| ----------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Product: `yvglwblxrnrenfifsnje.supabase.co/storage/v1/object/public/**` | アバター画像を保存する `avatars` Storage バケット | **あり**（下記）                                   |
| Web: `images.unsplash.com`, その他固定ドメイン                          | 社内で選定した固定素材                            | 外部入力の混入経路なし（コンテンツは開発者が選定） |

Product の `avatars` バケットが実際の攻撃面になる。確認した事実:

1. クライアント側の dropzone（`avatar-upload.tsx:103-104`）は `accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'] }` で AVIF を含まない拡張子リストに絞っているが、**これはブラウザ UI 上のヒントに過ぎず、セキュリティ境界ではない**。Supabase Storage への直接アップロード API 呼び出しは client 側検証を経由せずに実行できる
2. avatar アップロードは tRPC の `settings.router.ts` を経由せず（同 router は `avatarUrl` という **URL 文字列**の更新のみを受け付ける、`router.ts:48`）、Supabase SDK から Storage バケットへ直接書き込まれる。書き込み先バケット自体の制約を確認したところ、`supabase/migrations/00000000000000_baseline.sql:1273` および `supabase/migrations/20260401000000_fix_avatars_bucket_public.sql` の `avatars` バケット定義に **`allowed_mime_types` / `file_size_limit` の指定が無い**。Storage 層でも MIME type は強制されていない
3. `avatars` バケットは `public: true`（`20260401000000_fix_avatars_bucket_public.sql`）。アップロードされたファイルは `remotePatterns` が許可する `.../storage/v1/object/public/**` 配下の URL としてそのまま公開され、`avatarUrl` として保存すれば `next/image`（Sidebar / avatar プレビュー）がこの URL を fetch → Image Optimization にかける

**結論**: 認証済みユーザーが、拡張子・MIME 偽装により任意のバイナリ（悪意ある AVIF を含む）を自分のアバター画像として `avatars` バケットへ直接アップロードし、`avatarUrl` を更新して自分または閲覧者のブラウザ経由で `next/image` にレンダリングさせることで、サーバー側の AVIF デコード処理（`sharp` / `libheif` 経由）へ攻撃者制御のバイトデータを到達させる経路が存在した。`16.3.3` への patch でこの経路自体の脆弱性は解消される。

### 推奨する追加の防御層（本 issue のスコープ外、follow-up 起票対象）

patch 適用により直接の RCE は解消されるが、"MIME type を偽装した任意ファイルアップロードが可能" という構造自体は patch と独立した弱点のため、別 issue での対応を推奨する:

- `avatars` バケットへ `allowed_mime_types`（`image/jpeg`, `image/png`, `image/webp`, `image/gif` 等、実際に許可したい形式のみ）と妥当な `file_size_limit` を設定する migration
- 可能であれば、サーバー側（tRPC もしくは Storage upload 前）でファイル先頭バイト（magic bytes）による実体検査を追加する

これらは Non-goals（「security patchと同時に画像基盤を再設計すること」）に抵触するため本 PR には含めない。

## 影響・やること

- `next` / `@next/bundle-analyzer` / `@next/env` / `@next/eslint-plugin-next` / `eslint-config-next` を全 workspace（root / product / web / storybook）で `16.3.3` へ更新済み
- Windows RCE: 非該当（上記の理由により追加対応不要）
- AVIF RCE: 攻撃可能な入力経路を確認したため patch 適用は必須（適用済み）。バケット MIME 制約の追加は follow-up issue として起票する
