"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import { Card } from "./ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

export function CollapsibleSection({
  storageKey,
  title,
  subtitle,
  defaultOpen = true,
  children,
  onToggle,
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  onToggle?: (open: boolean) => void;
}): JSX.Element {
  const contentId = useId();
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return;
      const next = raw === "1" || raw === "true";
      setOpen(next);
    } catch {
      // Ignore localStorage failures (private mode etc).
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // Ignore.
    }
  }, [hydrated, open, storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  };

  return (
    <Collapsible open={open} onOpenChange={() => toggle()}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger
          type="button"
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/40"
          aria-expanded={open}
          aria-controls={contentId}
        >
          <div className="grid gap-1">
            <h2>{title}</h2>
            {subtitle ? <small>{subtitle}</small> : null}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")} aria-hidden="true" />
        </CollapsibleTrigger>

        <CollapsibleContent id={contentId} className="px-5 pb-5">
          {children}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
