import { cn } from '../cn';

/**
 * ActionFooter - ダイアログ・モーダル・パネルのアクションボタン群レイアウト。
 *
 * モバイル・デスクトップ共通: 横並び右寄せ。
 * Dialog 内では DialogFooter、Dialog 外ではこの ActionFooter を使う。
 *
 * レイアウト (`flex flex-row justify-end gap-2`) は DialogFooter (dialog mode) および
 * AlertDialogFooter と同一。変更する場合は3箇所を同時に更新すること:
 * - ActionFooter (このファイル)
 * - DialogFooter in dialog.tsx (dialog mode のみ。drawer mode は別レイアウト)
 * - AlertDialogFooter in alert-dialog.tsx
 *
 * @example
 * <ActionFooter>
 *   <Button variant="outline" onClick={onCancel}>キャンセル</Button>
 *   <Button onClick={onSave}>保存</Button>
 * </ActionFooter>
 */
function ActionFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="action-footer"
      className={cn('flex flex-row justify-end gap-2', className)}
      {...props}
    />
  );
}

export { ActionFooter };
