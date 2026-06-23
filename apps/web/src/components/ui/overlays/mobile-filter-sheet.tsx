'use client';

import { Badge, Button, Sheet, SheetContent, SheetHeader, SheetTitle } from '@dayopt/components';
import { Filter } from 'lucide-react';

interface MobileFilterSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  activeFilterCount: number;
  onClear: () => void;
  onApply: () => void;
  title: string;
  clearLabel: string;
  applyLabel: string;
  triggerLabel: string;
}

export function MobileFilterSheet({
  isOpen,
  onOpenChange,
  children,
  activeFilterCount,
  onClear,
  onApply,
  title,
  clearLabel,
  applyLabel,
  triggerLabel,
}: MobileFilterSheetProps) {
  return (
    <>
      {/* トリガーボタン（lg 未満で表示） */}
      <div className="lg:hidden">
        <Button
          onClick={() => onOpenChange(true)}
          variant="outline"
          className="flex w-full items-center justify-center gap-2"
        >
          <Filter className="text-muted-foreground size-4" />
          <span className="text-foreground font-medium">{triggerLabel}</span>
          {activeFilterCount > 0 && (
            <Badge variant="primary" className="ml-auto">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* シート */}
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] p-0">
          <div className="flex h-full flex-col">
            {/* ヘッダー */}
            <SheetHeader className="flex-shrink-0 border-b p-6">
              <div className="flex items-center gap-4">
                <Filter className="text-muted-foreground size-5" />
                <SheetTitle className="text-lg font-medium">{title}</SheetTitle>
                {activeFilterCount > 0 && (
                  <Badge variant="primary" className="ml-auto">
                    {activeFilterCount}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            {/* コンテンツ */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">{children}</div>

            {/* フッター */}
            <div className="flex-shrink-0 space-y-4 border-t p-6">
              <div className="flex gap-4">
                <Button onClick={onClear} variant="outline" className="flex-1">
                  {clearLabel}
                </Button>
                <Button
                  onClick={() => {
                    onApply();
                    onOpenChange(false);
                  }}
                  className="flex-1"
                >
                  {applyLabel}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
