"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import "../lib/fontawesome";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faChartLine,
  faClipboardList,
  faComments,
  faGaugeHigh,
  faSliders,
  faTags,
} from "@fortawesome/free-solid-svg-icons";

type NavItem = {
  href: string;
  label: string;
  icon: IconDefinition;
  activeMatch?: "exact" | "prefix";
};

type AdminNavVariant = "horizontal" | "vertical";

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Обзор", icon: faGaugeHigh, activeMatch: "exact" },
  { href: "/quotes", label: "Заявки", icon: faClipboardList, activeMatch: "prefix" },
  { href: "/support", label: "Поддержка", icon: faComments, activeMatch: "prefix" },
  { href: "/products", label: "Товары", icon: faBoxOpen, activeMatch: "prefix" },
  { href: "/promos", label: "Акции", icon: faTags, activeMatch: "prefix" },
  { href: "/analytics", label: "Статистика", icon: faChartLine, activeMatch: "exact" },
  { href: "/settings", label: "Настройки", icon: faSliders, activeMatch: "prefix" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/quotes") {
    return pathname === "/quote" || pathname.startsWith("/quotes");
  }
  if (item.href === "/support") {
    return pathname.startsWith("/support");
  }
  if (item.activeMatch === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminNav({ variant = "horizontal" }: { variant?: AdminNavVariant }): JSX.Element {
  const pathname = usePathname() || "/";

  return (
    <nav className={`adminNav adminNav-${variant}`} aria-label="Навигация">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`adminNavLink ${active ? "adminNavLink-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="adminNavLinkContent">
              <FontAwesomeIcon icon={item.icon} fixedWidth className="adminNavIcon" aria-hidden="true" />
              <span className="adminNavLabel">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
