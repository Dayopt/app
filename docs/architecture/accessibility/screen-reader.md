# スクリーンリーダー対応

視覚的には見えないが、スクリーンリーダーには読み上げられるテキストの実装パターン

---

## アイコンボタン

アイコンのみのボタンには必ず `aria-label` を設定する。

```tsx
// ✅ 良い例
<Button variant="ghost" size="icon" aria-label="設定を開く">
  <Settings />
</Button>

// ❌ 悪い例（aria-label なし）
<Button variant="ghost" size="icon">
  <Settings />
</Button>
```

---

## sr-only クラス

視覚的に隠すが、スクリーンリーダーには読み上げられる。

```tsx
<button>
  <XIcon />
  <span className="sr-only">閉じる</span>
</button>
```

**sr-only の CSS**:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## ライブリージョン

動的に変化するコンテンツをスクリーンリーダーに通知する。

### ステータス更新（polite）

ユーザーの操作を中断せず、適切なタイミングで読み上げる。

```tsx
<div aria-live="polite" role="status" className="sr-only">
  {message}
</div>
```

用途: 保存完了、データ更新、非緊急の通知

### 緊急通知（assertive）

即座にユーザーに通知する（現在の読み上げを中断）。

```tsx
<div aria-live="assertive" role="alert" className="sr-only">
  {errorMessage}
</div>
```

用途: エラー、警告、緊急の通知（多用禁止）

### 使い分け

| 属性                    | 読み上げタイミング   | 用途                 |
| ----------------------- | -------------------- | -------------------- |
| `aria-live="polite"`    | 現在の読み上げ完了後 | ステータス、保存完了 |
| `aria-live="assertive"` | 即座（中断あり）     | エラー、緊急通知     |
| `aria-live="off"`       | 通知しない           | デフォルト           |
