"use client";

import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AdminTheme = "light" | "dark";

type AdminThemeControls = {
  theme: AdminTheme;
  setTheme: (next: AdminTheme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "admin.theme";
const AdminThemeContext = createContext<AdminThemeControls | null>(null);

function isAdminTheme(value: string | null): value is AdminTheme {
  return value === "light" || value === "dark";
}

function applyTheme(theme: AdminTheme): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function AdminThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const [theme, setTheme] = useState<AdminTheme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
      if (isAdminTheme(raw)) {
        setTheme(raw);
      }
    } catch {
      // Ignore storage failures (private mode, restricted environment, etc).
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (!hydrated) return;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures; theme still applies for the current session.
    }
  }, [theme, hydrated]);

  const controls = useMemo<AdminThemeControls>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <AdminThemeContext.Provider value={controls}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme(): AdminThemeControls {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return ctx;
}
