# ai-review

危険クラスの PR だけを外部モデル（Gemini）にレビューさせる pipeline。存在理由と判定の
仕様は [review.ts](./review.ts) 冒頭のコメント、レビュー内容の正本は [prompt.md](./prompt.md)、
「守られるべき前提」は [invariants.md](./invariants.md) を参照。

## ローカルでの実行

```bash
# API を叩かず、対象ファイル・添付・prompt サイズだけ確認する
pnpm exec tsx scripts/ai-review/review.ts --dry-run --base <sha>^ --head <sha>

# 実レビュー（1 回 $0.1 前後）。comment は投稿されず stdout に出る
GEMINI_API_KEY="$(op read op://Dayopt-Shared/gemini/GEMINI_API_KEY)" \
  pnpm exec tsx scripts/ai-review/review.ts --base <sha>^ --head <sha>
```

## 答え合わせベンチマーク

**prompt.md / invariants.md を変えたら、必ずこのベンチマークで退行を確認する。**
契約の変更は雰囲気ではなく検出率で測る。

対象: `4e00828cd`（外部カレンダー OAuth フロー追加）。この commit には、後から人間側が
見つけて直した実在の穴が 3 件ある（= 正解が既知）:

| 正解（後続の修正 commit）                               | 期待する検出                         |
| ------------------------------------------------------- | ------------------------------------ |
| `a87df7d0b` callback でも Pro entitlement を検査する    | P0 / P1（課金・認可の不在）          |
| `73bcc9bcd` callback にも rate limit を掛ける           | P1（公開エンドポイントの防御の不在） |
| `50af9130e` openid scope を要求し暗号鍵の長さを検証する | P1（あれば加点）                     |

```bash
GEMINI_API_KEY="$(op read op://Dayopt-Shared/gemini/GEMINI_API_KEY)" \
  pnpm exec tsx scripts/ai-review/review.ts --base 4e00828cd^ --head 4e00828cd
```

実績（2026-07-27）:

- 旧契約（自由記述 + 抑制 5 重）: **0 / 3 検出**。thinking 15.5k tokens / 2 分 18 秒
- 新契約（手順駆動 + 不変条件カタログ + P1 の受け皿）: **2 / 3 検出**（entitlement を P0、
  rate limit を P1 で言い当て）。thinking 2.5k tokens / 32 秒 / 約 $0.09

温度は既定（1.0）のため同一入力でも結果は揺れる。1 回の実行で 0 件になったら、
もう 1 回流してから判断する。
