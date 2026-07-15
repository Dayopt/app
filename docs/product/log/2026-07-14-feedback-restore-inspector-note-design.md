---
status: frozen
date: 2026-07-14
updated: 2026-07-14
---

# 詳細 Inspector のメモ欄を従来デザインへ戻す

詳細 Inspector のメモ欄について、以前のカラーとUIから変わっているため元のパターンへ戻してほしいというフィードバック。

---

## 原文

> 詳細のメモ部分、前のデザインと変わってない？カラーやUIが。直して。

## 文脈

time-model用の共通Editorでは汎用Textareaを直接配置しており、旧Inspector専用のNoteSectionが持っていたコンパクトな高さ、透明ボーダー、文字数表示、自動拡張が失われていた。

## 解釈

詳細 Inspector のメモは、他のフォームで使う汎用Textareaではなく、従来のInspector専用パターンに合わせる。

## 対応

NoteSectionを現行デザイントークン準拠で復元し、コンパクトな自動拡張textarea、入力背景、透明ボーダー、文字数カウンターをTimeblockEditorへ適用する。
