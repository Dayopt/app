import { cn } from '@/lib/utils';

/**
 * ActionFooter - ダイアログ・モーダル・パネルのアクションボタン群レイアウト。
 *
 * モバイル・デスクトップ共通: 横並び右寄せ。
 * Dialog 内では DialogFooter、Dialog 外ではこの ActionFooter を使う。
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
