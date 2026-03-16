"use client";

import { usePathname, useRouter } from "next/navigation";

type PromosTab = "banners" | "codes";

function tabFromPathname(pathname: string): PromosTab {
  if (pathname === "/promos/codes" || pathname.startsWith("/promos/codes/")) return "codes";
  return "banners";
}

export function PromosTabs(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname() || "/promos";
  const active = tabFromPathname(pathname);

  return (
    <section className="card" style={{ padding: 12 }}>
      <div className="rowActions" aria-label="Раздел акций">
        <button
          type="button"
          className={`secondary small ${active === "banners" ? "adminNavLink-active" : ""}`}
          onClick={() => router.push("/promos")}
        >
          Баннеры
        </button>
        <button
          type="button"
          className={`secondary small ${active === "codes" ? "adminNavLink-active" : ""}`}
          onClick={() => router.push("/promos/codes")}
        >
          Промокоды
        </button>
      </div>
    </section>
  );
}

