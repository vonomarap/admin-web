"use client";

import * as React from "react";
import { Label } from "./label";
import { cn } from "../../lib/utils";

const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-4", className)} {...props} />
));
FieldGroup.displayName = "FieldGroup";

const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />
));
Field.displayName = "Field";

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => (
  <Label ref={ref} className={cn("text-sm font-medium text-foreground", className)} {...props} />
));
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />
  )
);
FieldDescription.displayName = "FieldDescription";

const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => (
    <fieldset ref={ref} className={cn("grid gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3", className)} {...props} />
  )
);
FieldSet.displayName = "FieldSet";

const FieldLegend = React.forwardRef<HTMLLegendElement, React.HTMLAttributes<HTMLLegendElement>>(({ className, ...props }, ref) => (
  <legend ref={ref} className={cn("px-1 text-sm font-medium text-foreground", className)} {...props} />
));
FieldLegend.displayName = "FieldLegend";

export { FieldGroup, Field, FieldLabel, FieldDescription, FieldSet, FieldLegend };
