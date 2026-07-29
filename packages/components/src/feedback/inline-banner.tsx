import { AlertTriangle } from 'lucide-react';

import { cn } from '../cn';

interface InlineBannerAction {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

interface InlineBannerProps {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

function InlineBanner({ visible, message, action }: InlineBannerProps) {
  return (
    <div
      data-slot="inline-banner"
      className={cn(
        'grid transition-[grid-template-rows]',
        visible ? 'grid-rows-[1fr] duration-200 ease-out' : 'grid-rows-[0fr] duration-150 ease-in',
      )}
    >
      <div className="overflow-hidden" aria-hidden={!visible}>
        <div
          role="alert"
          aria-live="assertive"
          className="bg-warning-tint flex items-center gap-2 px-4 py-2"
        >
          <AlertTriangle className="text-warning size-3.5 shrink-0" />
          <p className="text-foreground min-w-0 flex-1 text-sm">{message}</p>
          {action && (
            <button
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              tabIndex={visible && !action.disabled ? undefined : -1}
              className="text-foreground focus-visible:ring-ring shrink-0 text-sm underline outline-none focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { InlineBanner };
export type { InlineBannerAction };
