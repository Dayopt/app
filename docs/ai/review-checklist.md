---
status: current
last_verified: 2026-07-23
---

# Writing Review Checklist

Docs / Blog / Release notes を書いた後、公開・PR レビューの前に AI が確認する項目（#1438）。

## チェック項目

- [ ] main point が最初の段落で見えるか
- [ ] 1 文が短いか（読点 3 つ以上の文がないか）
- [ ] 1 文に 1 つの主旨か
- [ ] 専門語が初出時に説明されているか
- [ ] 日本語が初見で読めるか（B1 相当。長い名詞句・抽象語がないか）
- [ ] 英語が B1 相当で読めるか（short sentences / common words / active voice）
- [ ] vague SaaS words（empower / leverage / seamless / robust / optimize など）を使っていないか
- [ ] Dayopt の Light / Fast / Minimal に合っているか（削れる文が残っていないか）
- [ ] Docs / Blog / Release notes の役割が混ざっていないか（[docs-policy.md](./docs-policy.md)）
- [ ] トーンが研究者ペルソナに合っているか（[copywriting.md](./copywriting.md)。煽り・感嘆符の乱用がないか）
- [ ] 全角コロン「：」をテキスト中で使っていないか

## 使い方

- AI が Docs / Blog / Release notes を生成した直後に自己レビューとして通す
- PR レビューで文章変更を見る時のチェックリストとして使う
- 1 つでも落ちたら直してから `draft: false` にする
