"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type ConfirmDialogVariant = "default" | "destructive";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmDialogContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function ConfirmDialogProvider({ children }: PropsWithChildren): JSX.Element {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    return () => {
      setQueue((prev) => {
        prev.forEach((item) => item.resolve(false));
        return [];
      });
    };
  }, []);

  const shiftQueue = useCallback((value: boolean) => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      head?.resolve(value);
      return rest;
    });
  }, []);

  const confirm = useCallback<ConfirmDialogContextValue>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setQueue((prev) => [...prev, { ...options, resolve }]);
      }),
    []
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <AlertDialog open={Boolean(current)} onOpenChange={(open) => !open && current && shiftQueue(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current?.title}</AlertDialogTitle>
            {current?.description ? <AlertDialogDescription>{current.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => shiftQueue(false)}>{current?.cancelLabel ?? "Отмена"}</AlertDialogCancel>
            <AlertDialogAction
              className={current?.variant === "destructive" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={() => shiftQueue(true)}
            >
              {current?.confirmLabel ?? "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmDialogContextValue {
  const value = useContext(ConfirmDialogContext);
  if (!value) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }
  return value;
}
