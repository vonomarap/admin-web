"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAdminSession } from "./AdminSessionProvider";
import { useAdminTheme } from "./AdminThemeProvider";
import { AdminNav } from "./AdminNav";
import { BellIcon, MoonIcon, SearchIcon, SunIcon, UserIcon } from "./Icons";

export function AdminShell({
  title,
  subtitle,
  rightActions,
  children,
}: {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const session = useAdminSession();
  const { theme, toggleTheme } = useAdminTheme();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    setAvatarOpen(false);
    queueMicrotask(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!avatarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAvatarOpen(false);
    };

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (avatarWrapRef.current?.contains(target)) return;
      setAvatarOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [avatarOpen]);

  const onSubmitSearch = () => {
    const q = searchValue.trim();
    if (!q) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(false);
    router.push(`/quotes?q=${encodeURIComponent(q)}`);
  };

  const onOpenNewQuotes = () => {
    setSearchOpen(false);
    setAvatarOpen(false);
    router.push("/quotes?status=NEW");
  };

  const email = session.user?.email ?? "";

  return (
    <main className="appFrame">
      <div className="appWindow">
        <div className="appShell">
          <aside className="card sidebar" aria-label="Навигация">
            <div className="sidebarBrand">
              <div className="sidebarBrandTitle">Админка</div>
              <small className="sidebarBrandSubtitle">Window &amp; Door Store</small>
            </div>
            <AdminNav variant="vertical" />
          </aside>

          <section className="content">
            <header className="contentHeader">
              <div className="contentHeaderTop">
                <div style={{ minWidth: 0 }}>
                  <h1>{title}</h1>
                  {subtitle ? <small className="breakLong">{subtitle}</small> : null}
                </div>

                <div className="topbarRight">
                  {rightActions ? <div className="topbarActions">{rightActions}</div> : null}

                  <div className="topbarControls" aria-label="Быстрые действия">
                    <button
                      type="button"
                      className="iconBtn iconBtn-circle"
                      aria-label={theme === "dark" ? "Светлая тема" : "Темная тема"}
                      aria-pressed={theme === "dark"}
                      onClick={toggleTheme}
                    >
                      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    </button>

                    <div className={`topbarSearch ${searchOpen ? "topbarSearch-open" : ""}`}>
                      {searchOpen ? (
                        <input
                          ref={searchInputRef}
                          className="topbarSearchInput"
                          placeholder="Поиск по заявкам…"
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSubmitSearch();
                            if (e.key === "Escape") setSearchOpen(false);
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="iconBtn iconBtn-circle"
                        aria-label="Поиск по заявкам"
                        onClick={() => setSearchOpen((v) => !v)}
                      >
                        <SearchIcon />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="iconBtn iconBtn-circle"
                      aria-label="Новые заявки"
                      onClick={onOpenNewQuotes}
                    >
                      <BellIcon />
                    </button>

                    <div ref={avatarWrapRef} className="avatarWrap">
                      <button
                        type="button"
                        className="iconBtn iconBtn-circle avatarBtn"
                        aria-label="Аккаунт"
                        onClick={() => {
                          setSearchOpen(false);
                          setAvatarOpen((v) => !v);
                        }}
                      >
                        <UserIcon />
                      </button>

                      {avatarOpen ? (
                        <div className="popoverMenu" role="menu" aria-label="Аккаунт">
                          <div className="popoverTitle">{email || "Администратор"}</div>
                          <button
                            type="button"
                            className="popoverItem"
                            onClick={() => void signOut(auth!)}
                            disabled={!auth}
                          >
                            Выйти
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mobileNav" aria-label="Навигация (мобильная)">
                <AdminNav variant="horizontal" />
              </div>
            </header>

            <div className="contentBody">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
