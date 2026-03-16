"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminSession } from "./AdminSessionProvider";

export function FabMenu(): JSX.Element | null {
  const session = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (session.status !== "ready") return null;

  const go = (to: string) => {
    setOpen(false);
    router.push(to);
  };

  return (
    <>
      {open ? <div className="fabBackdrop" onClick={() => setOpen(false)} /> : null}

      {open ? (
        <div className="fabMenuPanel" role="menu" aria-label="Добавить">
          <button type="button" className="fabItem" role="menuitem" onClick={() => go("/products/new")}>
            Добавить товар
          </button>
          <button type="button" className="fabItem" role="menuitem" onClick={() => go("/gallery/new")}>
            Добавить кейс
          </button>
        </div>
      ) : null}

      <div className="fabWrap">
        <button
          type="button"
          className="fabButton"
          aria-label={open ? "Закрыть меню" : "Добавить"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="fabIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </span>
        </button>
      </div>
    </>
  );
}

