"use client";

import type { ReactNode } from "react";
import { Badge } from "./ui/badge";
import { Button, type ButtonProps } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Empty, EmptyActions, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Field, FieldDescription, FieldLabel, FieldSet } from "./ui/field";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { ADMIN_TONE_STYLES, type AdminTone } from "../lib/admin-routes";
import { cn } from "../lib/utils";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Info } from "lucide-react";

export function PageAlert({
  title,
  description,
  variant = "destructive",
  className,
}: {
  title: string;
  description: ReactNode;
  variant?: "default" | "destructive" | "warning";
  className?: string;
}): JSX.Element {
  const Icon = variant === "destructive" ? CircleAlert : Info;

  return (
    <Alert variant={variant} className={className}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

export function SectionCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone,
  actions,
  footer,
  className,
  contentClassName,
  children,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: AdminTone;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}): JSX.Element {
  const hasHeader = eyebrow || title || description || actions;
  const toneStyles = tone ? ADMIN_TONE_STYLES[tone] : null;

  return (
    <Card className={cn("border-border/80", toneStyles?.sectionCard, className)}>
      {hasHeader ? (
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {Icon ? (
                <span
                  className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border",
                    toneStyles?.sectionIcon ?? "border-border/70 bg-muted/60 text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
              ) : null}

              <div className="flex min-w-0 flex-col gap-1">
                {eyebrow ? <CardDescription>{eyebrow}</CardDescription> : null}
                {title ? <CardTitle>{title}</CardTitle> : null}
                {description ? <CardDescription className="leading-relaxed">{description}</CardDescription> : null}
              </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </CardHeader>
      ) : null}

      {children ? <CardContent className={cn(hasHeader ? "pt-0" : "", contentClassName)}>{children}</CardContent> : null}
      {footer ? <CardFooter className="flex flex-wrap items-center justify-between gap-3">{footer}</CardFooter> : null}
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  badge,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <Card className={cn("border-border/70 bg-background/75", className)}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {Icon ? (
              <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
                <Icon className="size-4" />
              </span>
            ) : null}
            <span>{label}</span>
          </div>
          {badge}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-2">
          <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
          {description ? <div className="text-sm leading-relaxed text-muted-foreground">{description}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function FieldBlock({
  label,
  description,
  className,
  children,
}: {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Field className={className}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function CheckboxField({
  title,
  description,
  control,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <FieldSet
      className={cn(
        "gap-0",
        className
      )}
    >
      <label className="flex items-start gap-3 text-sm">
        <span className="pt-0.5">{control}</span>
        <span className="grid gap-1">
          <span className="font-medium text-foreground">{title}</span>
          {description ? <span className="text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
        </span>
      </label>
    </FieldSet>
  );
}

export function SwitchField({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  size = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
}): JSX.Element {
  return (
    <FieldSet className={cn("gap-0", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="font-medium text-foreground">{title}</span>
          {description ? <span className="text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} size={size} />
      </div>
    </FieldSet>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyActions>{action}</EmptyActions> : null}
    </Empty>
  );
}

export function DetailRows({
  items,
  columns = 1,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode }>;
  columns?: 1 | 2;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn("grid gap-3", columns === 2 ? "lg:grid-cols-2" : "", className)}>
      {items.map((item, index) => (
        <div key={index} className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="grid gap-1">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
            <div className="min-w-0 break-words text-sm text-foreground">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InlineMeta({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}): JSX.Element {
  const filtered = items.filter(Boolean);
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
      {filtered.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 ? <Separator orientation="vertical" className="h-4" /> : null}
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function ActionIconButton({
  className,
  variant = "outline",
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <Button
      size="icon"
      variant={variant}
      className={cn("rounded-full", variant === "outline" ? "bg-background/80" : "", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export function ToneBadge({
  children,
  tone = "secondary",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "secondary" | "outline" | "success" | "destructive" | "muted";
  className?: string;
}): JSX.Element {
  return (
    <Badge variant={tone} className={className}>
      {children}
    </Badge>
  );
}
