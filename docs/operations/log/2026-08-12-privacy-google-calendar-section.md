---
status: frozen
date: 2026-08-12
---

# privacy.mdx に Google Calendar Integration 節を追加した

## 背景・当時の前提

#1963（GCP sensitive scope 審査）のレーンが一次情報（Google の Verification requirements / API Services User Data Policy、2026-08-12 確認）と現行の `apps/web/content/legal/{en,ja}/privacy.mdx` を照合し、Google user data の取得・利用・保存・共有の開示と Limited Use 準拠表明が審査の hard requirement であるのに対し、privacy.mdx には Gmail の sub-processor 記載と「calendar synchronization」の一語しか無いことを検出した（#1980）。このまま審査に提出すると reject される。

## 決定と理由

`docs/operations/google-oauth-verification.md`（#1963 レーンが実装と 1 件ずつ突き合わせて作成した文面素案。`risk-reviewer` の反証レビュー済み）の英語素案をそのまま `privacy.mdx` の新節 `googleCalendar` に流し込み、日本語版は `docs/business/content/writing-style.md` の文体で同内容を訳した。節の構成（intro 段落 + 箇条書きリスト + 末尾の Limited Use 準拠段落）は既存の `aiFeatures` 節をそのまま先行事例にした。

## 却下した選択肢と、なぜ捨てたか

- **法務文言を要約・簡略化する**: 素案は実装（refresh token 暗号化、90 日保持、revoke の best-effort 挙動など 7 箇所）と既に照合済みで、要約すると実装との対応が崩れる懸念があるため、素案の主張を保つ形で構造だけ変換した
- **英語版のみ先に出す**: privacy.mdx は既存規約で en/ja の非対称を作らない方針のため、同時に追加した

## 影響・やること

- `apps/web/src/app/[locale]/(marketing)/legal/_components/legal-standard-document.tsx` の `PRIVACY_SECTIONS` に `googleCalendar` を追加（`aiFeatures` の直後）
- `apps/web/content/legal/{en,ja}/privacy.mdx` に節本文を追加、`lastUpdated` を更新
- **法務文言のため、merge 前に User レビューが必要**（#1980 の注意事項どおり）
- 審査提出前チェックリスト（`docs/operations/google-oauth-verification.md` ステップ 4）の「プライバシーポリシーに Google Calendar の節が公開済み」項目は、この PR の merge + production deploy で満たされる
