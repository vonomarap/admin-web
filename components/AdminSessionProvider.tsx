"use client";

import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, firebaseConfigReady } from "../lib/firebase";

export type AdminStatus = "loading" | "missing_config" | "signed_out" | "not_admin" | "role_check_failed" | "ready";

export type AdminSession = {
  status: AdminStatus;
  user: User | null;
  isAdmin: boolean;
  error: string | null;
};

const AdminSessionContext = createContext<AdminSession | null>(null);

function formatRoleCheckError(error: unknown): string {
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code ? `${code} - ${message}` : message;
}

export function AdminSessionProvider({ children }: PropsWithChildren): JSX.Element {
  const [session, setSession] = useState<AdminSession>({
    status: "loading",
    user: null,
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    if (!firebaseConfigReady || !auth || !db) {
      setSession({ status: "missing_config", user: null, isAdmin: false, error: null });
      return;
    }

    const safeAuth = auth;
    const safeDb = db;

    let cancelled = false;
    const unsubscribe = onAuthStateChanged(safeAuth, async (nextUser) => {
      if (cancelled) return;

      if (!nextUser) {
        setSession({ status: "signed_out", user: null, isAdmin: false, error: null });
        return;
      }

      setSession({ status: "loading", user: nextUser, isAdmin: false, error: null });

      try {
        const userDoc = await getDoc(doc(safeDb, "users", nextUser.uid));
        const role = userDoc.data()?.role;
        const isAdmin = role === "admin";
        setSession({ status: isAdmin ? "ready" : "not_admin", user: nextUser, isAdmin, error: null });
      } catch (error) {
        console.error("Admin role check failed:", error);
        setSession({
          status: "role_check_failed",
          user: nextUser,
          isAdmin: false,
          error: formatRoleCheckError(error),
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => session, [session]);
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }
  return ctx;
}
