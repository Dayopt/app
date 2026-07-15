'use client';

import * as React from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '../cn';
import { useHasMounted } from '../hooks/useHasMounted';
import { useIsMobile } from '../hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Context: dialog vs drawer モード
// ---------------------------------------------------------------------------

type DialogMode = 'dialog' | 'drawer';

const DialogModeContext = React.createContext<DialogMode>('dialog');

function useDialogMode(): DialogMode {
  return React.useContext(DialogModeContext);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type DialogResponsive = 'auto' | 'dialog' | 'drawer';

interface DialogProps extends React.ComponentProps<typeof DialogPrimitive.Root> {
  /** レスポンシブ制御。'auto' = PC:Dialog / モバイル:Drawer。default: 'auto' */
  responsive?: DialogResponsive;
}

const Dialog = ({ responsive = 'auto', ...props }: DialogProps) => {
  const isMobile = useIsMobile();
  const mounted = useHasMounted();

  const mode: DialogMode =
    responsive === 'dialog'
      ? 'dialog'
      : responsive === 'drawer'
        ? 'drawer'
        : isMobile
          ? 'drawer'
          : 'dialog';

  // SSR / hydration: drawer は mount 後のみ
  if (mode === 'drawer') {
    if (!mounted) return null;
    return (
      <DialogModeContext.Provider value="drawer">
        <DrawerPrimitive.Root data-slot="dialog" {...props} />
      </DialogModeContext.Provider>
    );
  }

  return (
    <DialogModeContext.Provider value="dialog">
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogModeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Trigger / Portal / Close
// ---------------------------------------------------------------------------

const DialogTrigger = (props: React.ComponentProps<typeof DialogPrimitive.Trigger>) => {
  const mode = useDialogMode();
  if (mode === 'drawer') {
    return <DrawerPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
  }
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
};

const DialogPortal = (props: React.ComponentProps<typeof DialogPrimitive.Portal>) => {
  const mode = useDialogMode();
  if (mode === 'drawer') {
    return <DrawerPrimitive.Portal data-slot="dialog-portal" {...props} />;
  }
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
};

const DialogClose = (props: React.ComponentProps<typeof DialogPrimitive.Close>) => {
  const mode = useDialogMode();
  if (mode === 'drawer') {
    return <DrawerPrimitive.Close data-slot="dialog-close" {...props} />;
  }
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
};

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const mode = useDialogMode();

  if (mode === 'drawer') {
    return (
      <DrawerPrimitive.Overlay
        ref={ref}
        data-slot="dialog-overlay"
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-overlay z-sheet fixed inset-0 backdrop-blur-md data-[state=closed]:pointer-events-none',
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-overlay z-overlay-modal fixed inset-0 backdrop-blur-md data-[state=closed]:pointer-events-none motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = 'DialogOverlay';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-4xl',
};

const DialogContent = ({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  size,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** 背景overlayを表示するか。default: true */
  showOverlay?: boolean;
  /** サイズ（max-width）。未指定時は className の max-w- or デフォルト lg */
  size?: DialogSize;
}) => {
  const mode = useDialogMode();
  const contentRef = React.useRef<HTMLDivElement>(null);

  // モバイルキーボード表示時にダイアログを上にシフト + 高さ制約（dialog mode のみ）
  React.useEffect(() => {
    if (mode === 'drawer') return;
    const vv = window.visualViewport;
    const el = contentRef.current;
    if (!vv || !el) return;

    const update = () => {
      const kbHeight = Math.max(0, window.innerHeight - vv.height);
      if (kbHeight > 0) {
        el.style.top = `calc(50% - ${kbHeight / 2}px)`;
        el.style.maxHeight = `${vv.height - 32}px`;
      } else {
        el.style.top = '';
        el.style.maxHeight = '';
      }
    };

    vv.addEventListener('resize', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
    };
  }, [mode]);

  // ---------- Drawer mode ----------
  if (mode === 'drawer') {
    return (
      <DrawerPortalInternal>
        {showOverlay ? <DrawerOverlayInternal /> : null}
        <DrawerPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            'group/drawer-content bg-card z-sheet shadow-card fixed flex h-auto flex-col',
            'border-border inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-2xl border-t',
            className,
          )}
          {...(props as React.ComponentProps<typeof DrawerPrimitive.Content>)}
        >
          {/* ドラッグハンドル */}
          <div className="flex h-6 w-full shrink-0 items-center justify-center" aria-hidden="true">
            <div className="bg-border h-1 w-10 rounded-full" />
          </div>
          {children}
        </DrawerPrimitive.Content>
      </DrawerPortalInternal>
    );
  }

  // ---------- Dialog mode ----------
  // size prop → max-w class。className に max-w- がある場合はそちらを優先
  const hasCustomMaxW = className?.includes('max-w-');
  const sizeClass = !hasCustomMaxW ? SIZE_CLASSES[size ?? 'lg'] : '';

  return (
    <DialogPortal data-slot="dialog-portal">
      {showOverlay ? <DialogOverlay /> : null}
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        className={cn(
          'bg-card text-card-foreground z-overlay-modal border-border-subtle shadow-card fixed top-1/2 left-1/2 grid max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border p-6 transition-[top,max-height] duration-200',
          'w-full max-w-[calc(100vw-2rem)] min-w-80',
          sizeClass,
          'data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'overscroll-contain',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              'text-foreground absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg transition-colors',
              'hover:bg-state-hover active:bg-state-hover',
              'ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
              'disabled:pointer-events-none',
              '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
};

// ---------------------------------------------------------------------------
// Header / Footer / Title / Description（モード対応）
// ---------------------------------------------------------------------------

const DialogHeader = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const mode = useDialogMode();
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        mode === 'drawer' ? 'flex flex-col gap-1 px-4 pb-4' : 'flex flex-col gap-2 text-left',
        className,
      )}
      {...props}
    />
  );
};

const DialogFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const mode = useDialogMode();
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        mode === 'drawer'
          ? 'mt-auto flex flex-row gap-2 p-4 [&>*]:flex-1'
          : 'flex flex-row justify-end gap-2',
        className,
      )}
      {...props}
    />
  );
};

const DialogTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) => {
  const mode = useDialogMode();

  if (mode === 'drawer') {
    return (
      <DrawerPrimitive.Title
        data-slot="dialog-title"
        className={cn('text-foreground font-medium', className)}
        {...props}
      />
    );
  }

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-medium', className)}
      {...props}
    />
  );
};

const DialogDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) => {
  const mode = useDialogMode();

  if (mode === 'drawer') {
    return (
      <DrawerPrimitive.Description
        data-slot="dialog-description"
        className={cn('text-muted-foreground text-sm', className)}
        {...props}
      />
    );
  }

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
};

// ---------------------------------------------------------------------------
// Internal Drawer helpers（DialogContent 内部でのみ使用）
// ---------------------------------------------------------------------------

function DrawerPortalInternal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DrawerOverlayInternal({ className }: { className?: string }) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-overlay z-sheet fixed inset-0 backdrop-blur-md data-[state=closed]:pointer-events-none',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
