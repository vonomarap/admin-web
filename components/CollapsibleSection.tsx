"use client";

import { ReactNode, useEffect, useId, useState } from "react";

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
    <section className="card collapsible" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="collapsibleHeader"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
      >
        <div className="collapsibleHeaderText">
          <h2>{title}</h2>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <span className="collapsibleChevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div id={contentId} className="collapsibleBody">
          {children}
        </div>
      ) : null}
    </section>
  );
}

