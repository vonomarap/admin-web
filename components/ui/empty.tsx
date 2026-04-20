import * as React from "react";
import { cn } from "../../lib/utils";

const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-background/55 px-6 py-10 text-center",
      className
    )}
    {...props}
  />
));
Empty.displayName = "Empty";

const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("grid gap-2", className)} {...props} />
));
EmptyHeader.displayName = "EmptyHeader";

const EmptyTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
EmptyTitle.displayName = "EmptyTitle";

const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("max-w-xl text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  )
);
EmptyDescription.displayName = "EmptyDescription";

const EmptyActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-wrap items-center justify-center gap-2", className)} {...props} />
));
EmptyActions.displayName = "EmptyActions";

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyActions };
