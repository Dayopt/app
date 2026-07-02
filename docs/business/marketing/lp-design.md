---
status: current
last_verified: 2026-07-02
---

# ランディングページ戦略

DayoptのLP設計方針。GAFA-First原則に基づき、実績のあるベストプラクティスを採用。

> **このドキュメントの位置づけ**: 汎用的なLP設計原則・ベストプラクティスを記載。
> Dayopt固有のメッセージング・セクション別仕様は **[LP Spec](?path=/docs/strategy-lp-spec--docs)** を参照。
> プロダクトの最上位コンセプトは [`docs/strategy/concept.md`](./concept.md) を参照（2026-07-02 策定）。以下のヘッドライン案は策定前の汎用例であり、実際の LP コピーは concept.md の「守れる計画」訴求に従う。

---

## 基本原則

### 1:1 アテンション比率

**1ページ = 1ゴール**

- ナビゲーションバーなし（HubSpot調査: 28%コンバージョン向上）
- CTAは1種類のみ
- 離脱ポイントを最小化

### ロード速度

**1秒以内を目指す**

- 1秒: 3xコンバージョン vs 5秒（Portent調査）
- 画像最適化必須
- 不要なスクリプト削除

---

## LP構成（セクション順）

### 1. ヒーロー（Above the Fold）

| 要素         | 内容                                                 |
| ------------ | ---------------------------------------------------- |
| ヘッドライン | 課題解決を一言で（例: 「時間の使い方に納得できる」） |
| サブヘッド   | 具体的なベネフィット                                 |
| CTA          | 「無料で始める」等                                   |
| ビジュアル   | 実際のUI画像 or デモGIF                              |

**注意**: 抽象的なイラストより実際のプロダクト画像

### 2. 課題提起

- ターゲットが抱える問題を3つ程度
- 「こんな経験ありませんか？」形式
- 共感を得る

### 3. 解決策（機能紹介）

| 形式   | 推奨                                     |
| ------ | ---------------------------------------- |
| 機能数 | 3つに絞る                                |
| 見せ方 | アイコン + 短い説明 + スクリーンショット |
| 順序   | 最も価値のある機能から                   |

### 4. 社会的証明（リリース後）

- ユーザーの声（顔写真 + 名前 + 職業）
- 導入企業ロゴ
- 数字（「○○人が利用」等）

_リリース初期は省略可_

### 5. 料金

- シンプルな料金表
- 「無料プラン」を目立たせる
- 比較表は3プラン以下

### 6. FAQ

- よくある質問3-5個
- 購入障壁を取り除く内容
- 「データはどこに保存？」「解約は簡単？」等

### 7. 最終CTA

- ヒーローと同じCTA
- 「今すぐ始める」等のアクション

### 8. フッター

- 利用規約・プライバシーポリシーへのリンク
- SNSリンク
- 会社情報（特定商取引法）

---

## コンバージョン最適化

### 必須要素

- [ ] ロード速度1秒以内
- [ ] モバイルファースト設計
- [ ] 実際のUI画像使用
- [ ] 明確なCTA（1種類）
- [ ] 信頼性要素（SSL、プライバシー）

### A/Bテスト候補

| 要素         | テスト内容                       |
| ------------ | -------------------------------- |
| ヘッドライン | ベネフィット vs 機能訴求         |
| CTA文言      | 「無料で始める」vs「試してみる」 |
| CTA色        | コントラスト比較                 |
| 動画有無     | 動画あり vs 静止画のみ           |

---

## コピーライティング

### ヘッドライン案

**ベネフィット訴求**

- 「時間の使い方に納得できる」
- 「振り返りから始まる、自分らしい時間」

**課題訴求**

- 「1日が終わって、何をしていたか分からない」を解決
- タスク管理に疲れた人のための時間記録

### 避けること

- 専門用語
- 長すぎる説明
- 複数のCTA
- 曖昧な表現（「すごい」「便利」等）

---

## 技術要件

| 項目       | 基準     |
| ---------- | -------- |
| ロード速度 | < 1秒    |
| LCP        | < 2.5秒  |
| CLS        | < 0.1    |
| モバイル   | 完全対応 |
| OGP        | 設定必須 |

---

## 参考LP

調査して良かったLPを追加：

- （後で追加）

---

## 参考元

- [Unbounce SaaS Landing Pages](https://unbounce.com/conversion-rate-optimization/the-state-of-saas-landing-pages/) - SaaS LP調査
- [Landingi Best Practices](https://landingi.com/landing-page/saas-best-practices/) - LP最適化14項目
- [UserPilot LP Guide](https://userpilot.com/blog/saas-landing-page-best-practices/) - コンバージョン改善

---

## 🔗 関連ドキュメント

📖 **LP実装仕様書**: [LP Spec](?path=/docs/strategy-lp-spec--docs) - Dayopt固有のセクション別仕様・翻訳キーマッピング
📖 **メッセージング設計**: [brand/messaging.md](?path=/docs/strategy-brand-messaging--docs) - JTBD・コアメッセージ
📖 **ターゲットペルソナ**: [brand/persona.md](?path=/docs/strategy-brand-persona--docs) - LPが語りかける相手
📖 **ビジュアルディレクション**: [brand/visual-direction.md](?path=/docs/strategy-brand-visual-direction--docs) - デザイン方向性
📖 **前提知識**: [brand/value-proposition.md](?path=/docs/strategy-brand-value-proposition--docs) - LPで伝える価値提案
🔗 **ブランドキャラクター**: [brand/brand-character.md](?path=/docs/strategy-brand-character--docs) - LPのトーン設定
🔗 **コンテンツガイドライン**: [content-guidelines.md](?path=/docs/strategy-content-guidelines--docs) - LP文章の書き方
