---
status: current
last_verified: 2026-07-24
code:
  - packages/components/src/overlays/dialog.tsx
  - packages/components/src/overlays/drawer.tsx
  - packages/components/src/overlays/sheet.tsx
# UI の内部契約であり、ユーザーに説明する機能ではない
public_docs: []
lp: []
---

# Mobile overlays（モバイルオーバーレイ）

モバイルで使うbottom sheetのmodal性、閉じ方、背景表示を共通化する。

## 基本契約

- bottom sheetはmodalとする。背景overlayを表示し、sheetを閉じるまで背景を操作させない
- mobile bottom sheetはnon-modalにしない。背景と同時操作する補助UIはpanelまたはpopoverとして実装する
- overlayの有無を見た目だけで切り替えない。bottom sheetの共通componentが常に所有する
- modal viewには、buttonまたは標準gestureによる明確なdismiss手段を用意する
- mobileのbuttonとicon buttonは44px以上のtouch targetを確保する
- 複数のbottom sheetを同時に積まない。pickerなど別のsheetを開く場合は、元のsheetとの親子関係を明確にする

## 閉じ方

| 用途               | 表示                       | 明示的な閉じ方                              | 背景          |
| ------------------ | -------------------------- | ------------------------------------------- | ------------- |
| 検索               | 入力と結果が長い場合は全高 | `キャンセル`。queryと一時検索状態を破棄する | modal overlay |
| 作成・編集form     | 内容に応じた部分高         | `キャンセル`と主要action                    | modal overlay |
| 自動保存の詳細     | 部分高                     | close icon。`キャンセル`とは呼ばない        | modal overlay |
| 即時確定picker     | 部分高                     | 選択時に閉じる。明示buttonは必須にしない    | modal overlay |
| 仮入力を持つpicker | 部分高                     | `キャンセル`と`保存`または`完了`            | modal overlay |
| 削除・重要な確認   | action sheet / alert       | `キャンセル`とdestructive action            | modal overlay |

`キャンセル`は、そのsurface内でまだ確定していない変更を破棄する時だけ使う。保存済みまたは自動保存された内容を表示しているだけならclose iconを使う。選択した時点で確定する単一pickerは、選択そのものを主要action兼dismissとしてよい。

## 実装上の正本

- responsiveなPC Dialog / mobile Drawerは`Dialog`を使う
- mobile専用のdrag可能なsurfaceは`Drawer`を使う
- mobile Drawerとして表示する`Dialog`、mobile専用の`Drawer`、`Sheet`は常にmodalとし、共通overlayを自動表示する
- overlayなしで背景を操作するsurfaceはbottom sheetにしない。desktopの補助Dialogでは`responsive="dialog" modal={false}`、文脈操作ではPopoverまたは常設panelを使う
- `showCloseButton`はdesktop Dialogの標準close iconを制御する。mobileでは用途に合うdismiss controlをheaderまたはfooterへ明示する

## 基準

- [Apple Human Interface Guidelines: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Apple Human Interface Guidelines: Modality](https://developer.apple.com/design/human-interface-guidelines/modality)
- [Material 3: Bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets)

## 関連するフィードバック

- モバイルbottom sheetの閉じ方とoverlayの意図を統一したい（削除済み、git 履歴参照）
