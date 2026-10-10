import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}>({ open: false });

export function Collapsible({
  open: controlledOpen,
  onOpenChange,
  disabled,
  children,
  className,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleToggle = React.useCallback(() => {
    if (disabled) return;
    if (isControlled) {
      onOpenChange?.(!open);
    } else {
      setUncontrolledOpen((prev) => {
        const next = !prev;
        onOpenChange?.(next);
        return next;
      });
    }
  }, [disabled, isControlled, onOpenChange, open]);

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleToggle, disabled }}>
      <div data-slot="collapsible" data-state={open ? "open" : "closed"} className={className} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({
  className,
  onClick,
  children,
  disabled: triggerDisabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(CollapsibleContext);
  const disabled = triggerDisabled || context.disabled;

  return (
    <button
      type="button"
      data-slot="collapsible-trigger"
      data-state={context.open ? "open" : "closed"}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          context.onOpenChange?.(context.open);
        }
      }}
      className={cn("w-full text-left", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(CollapsibleContext);
  if (!context.open) return null;

  return (
    <div
      data-slot="collapsible-content"
      data-state="open"
      className={cn("overflow-hidden transition-all", className)}
      {...props}
    >
      {children}
    </div>
  );
}
