import {
  Calculator,
  ChartColumnIncreasing,
  ClipboardList,
  Globe,
  ImageIcon,
  LayoutDashboard,
  MessageSquareMore,
  Package,
  Settings2,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type AdminTone = "sky" | "amber" | "emerald" | "rose" | "violet" | "slate" | "cyan";

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

export type AdminRouteMeta = {
  label: string;
  section: string;
  icon: LucideIcon;
  tone: AdminTone;
  breadcrumbs: AdminBreadcrumbItem[];
};

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: AdminTone;
  matches: (pathname: string) => boolean;
};

type AdminRouteRecord = {
  matches: (pathname: string) => boolean;
  meta: AdminRouteMeta;
};

function isExact(pathname: string, href: string): boolean {
  return pathname === href;
}

function isPrefix(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/",
    label: "Обзор",
    icon: LayoutDashboard,
    tone: "sky",
    matches: (pathname) => isExact(pathname, "/"),
  },
  {
    href: "/quotes",
    label: "Заявки",
    icon: ClipboardList,
    tone: "sky",
    matches: (pathname) => pathname === "/quote" || isPrefix(pathname, "/quotes"),
  },
  {
    href: "/support",
    label: "Поддержка",
    icon: MessageSquareMore,
    tone: "amber",
    matches: (pathname) => isPrefix(pathname, "/support"),
  },
  {
    href: "/products",
    label: "Товары",
    icon: Package,
    tone: "emerald",
    matches: (pathname) => isPrefix(pathname, "/products"),
  },
  {
    href: "/promos",
    label: "Акции",
    icon: Tags,
    tone: "rose",
    matches: (pathname) => isPrefix(pathname, "/promos"),
  },
  {
    href: "/analytics",
    label: "Статистика",
    icon: ChartColumnIncreasing,
    tone: "cyan",
    matches: (pathname) => isExact(pathname, "/analytics"),
  },
  {
    href: "/settings",
    label: "Настройки",
    icon: Settings2,
    tone: "slate",
    matches: (pathname) => isPrefix(pathname, "/settings"),
  },
];

const ROUTE_META: AdminRouteRecord[] = [
  {
    matches: (pathname) => isExact(pathname, "/"),
    meta: {
      label: "Обзор",
      section: "Панель",
      icon: LayoutDashboard,
      tone: "sky",
      breadcrumbs: [{ label: "Обзор" }],
    },
  },
  {
    matches: (pathname) => isExact(pathname, "/quote"),
    meta: {
      label: "Заявка",
      section: "Продажи",
      icon: ClipboardList,
      tone: "sky",
      breadcrumbs: [
        { label: "Заявки", href: "/quotes" },
        { label: "Детали заявки" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/quotes"),
    meta: {
      label: "Заявки",
      section: "Продажи",
      icon: ClipboardList,
      tone: "sky",
      breadcrumbs: [{ label: "Заявки" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/support"),
    meta: {
      label: "Поддержка",
      section: "Коммуникации",
      icon: MessageSquareMore,
      tone: "amber",
      breadcrumbs: [{ label: "Поддержка" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/products/new"),
    meta: {
      label: "Новый товар",
      section: "Каталог",
      icon: Package,
      tone: "emerald",
      breadcrumbs: [
        { label: "Товары", href: "/products" },
        { label: "Новый товар" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/products"),
    meta: {
      label: "Товары",
      section: "Каталог",
      icon: Package,
      tone: "emerald",
      breadcrumbs: [{ label: "Товары" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/gallery/new"),
    meta: {
      label: "Новый кейс",
      section: "Портфолио",
      icon: ImageIcon,
      tone: "violet",
      breadcrumbs: [
        { label: "Портфолио", href: "/gallery" },
        { label: "Новый кейс" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/gallery"),
    meta: {
      label: "Портфолио",
      section: "Портфолио",
      icon: ImageIcon,
      tone: "violet",
      breadcrumbs: [{ label: "Портфолио" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/media"),
    meta: {
      label: "Медиа",
      section: "Контент",
      icon: ImageIcon,
      tone: "violet",
      breadcrumbs: [{ label: "Медиа" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/promos/codes"),
    meta: {
      label: "Промокоды",
      section: "Маркетинг",
      icon: Tags,
      tone: "rose",
      breadcrumbs: [
        { label: "Акции", href: "/promos" },
        { label: "Промокоды" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/promos"),
    meta: {
      label: "Акции",
      section: "Маркетинг",
      icon: Tags,
      tone: "rose",
      breadcrumbs: [{ label: "Акции" }],
    },
  },
  {
    matches: (pathname) => isExact(pathname, "/analytics"),
    meta: {
      label: "Статистика",
      section: "Аналитика",
      icon: ChartColumnIncreasing,
      tone: "cyan",
      breadcrumbs: [{ label: "Статистика" }],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/settings/calc"),
    meta: {
      label: "Калькулятор",
      section: "Конфигурация",
      icon: Calculator,
      tone: "slate",
      breadcrumbs: [
        { label: "Настройки", href: "/settings" },
        { label: "Калькулятор" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/settings/site"),
    meta: {
      label: "Сайт",
      section: "Конфигурация",
      icon: Globe,
      tone: "slate",
      breadcrumbs: [
        { label: "Настройки", href: "/settings" },
        { label: "Сайт" },
      ],
    },
  },
  {
    matches: (pathname) => isPrefix(pathname, "/settings"),
    meta: {
      label: "Настройки",
      section: "Конфигурация",
      icon: Settings2,
      tone: "slate",
      breadcrumbs: [{ label: "Настройки" }],
    },
  },
];

const FALLBACK_ROUTE_META: AdminRouteMeta = {
  label: "Админка",
  section: "Навигация",
  icon: LayoutDashboard,
  tone: "slate",
  breadcrumbs: [{ label: "Админка" }],
};

export const ADMIN_TONE_STYLES: Record<
  AdminTone,
  {
    headerFrame: string;
    headerBadge: string;
    headerPill: string;
    navActive: string;
    navAccent: string;
    navIcon: string;
    sectionCard: string;
    sectionIcon: string;
  }
> = {
  sky: {
    headerFrame: "ring-1 ring-sky-200/45 dark:ring-sky-500/12",
    headerBadge: "border-sky-500/45 bg-sky-100/95 !text-sky-950 dark:border-sky-400/25 dark:bg-sky-400/14 dark:!text-sky-100",
    headerPill: "border-sky-500/35 bg-sky-50/95 !text-sky-950 dark:border-sky-400/25 dark:bg-sky-400/12 dark:!text-sky-100",
    navActive: "border-sky-500/35 bg-sky-100/80 !text-sky-950 hover:bg-sky-100/90 dark:border-sky-500/25 dark:bg-sky-500/10 dark:!text-sky-100 dark:hover:bg-sky-500/15",
    navAccent: "bg-sky-700 dark:bg-sky-300",
    navIcon: "border-sky-500/45 bg-sky-100/95 !text-sky-950 dark:border-sky-400/25 dark:bg-sky-400/14 dark:!text-sky-100",
    sectionCard: "border-sky-500/25 bg-sky-50/65 dark:border-sky-500/18 dark:bg-sky-500/6",
    sectionIcon: "border-sky-500/45 bg-sky-100/95 !text-sky-950 dark:border-sky-400/25 dark:bg-sky-400/14 dark:!text-sky-100",
  },
  amber: {
    headerFrame: "ring-1 ring-amber-200/45 dark:ring-amber-500/12",
    headerBadge: "border-amber-500/45 bg-amber-100/95 !text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/14 dark:!text-amber-100",
    headerPill: "border-amber-500/35 bg-amber-50/95 !text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/12 dark:!text-amber-100",
    navActive: "border-amber-500/35 bg-amber-100/80 !text-amber-950 hover:bg-amber-100/90 dark:border-amber-500/25 dark:bg-amber-500/10 dark:!text-amber-100 dark:hover:bg-amber-500/15",
    navAccent: "bg-amber-700 dark:bg-amber-300",
    navIcon: "border-amber-500/45 bg-amber-100/95 !text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/14 dark:!text-amber-100",
    sectionCard: "border-amber-500/25 bg-amber-50/65 dark:border-amber-500/18 dark:bg-amber-500/6",
    sectionIcon: "border-amber-500/45 bg-amber-100/95 !text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/14 dark:!text-amber-100",
  },
  emerald: {
    headerFrame: "ring-1 ring-emerald-200/45 dark:ring-emerald-500/12",
    headerBadge: "border-emerald-600/45 bg-emerald-100/95 !text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/14 dark:!text-emerald-100",
    headerPill: "border-emerald-600/35 bg-emerald-50/95 !text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/12 dark:!text-emerald-100",
    navActive: "border-emerald-600/35 bg-emerald-100/80 !text-emerald-950 hover:bg-emerald-100/90 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:!text-emerald-100 dark:hover:bg-emerald-500/15",
    navAccent: "bg-emerald-700 dark:bg-emerald-300",
    navIcon: "border-emerald-600/45 bg-emerald-100/95 !text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/14 dark:!text-emerald-100",
    sectionCard: "border-emerald-600/25 bg-emerald-50/65 dark:border-emerald-500/18 dark:bg-emerald-500/6",
    sectionIcon: "border-emerald-600/45 bg-emerald-100/95 !text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/14 dark:!text-emerald-100",
  },
  rose: {
    headerFrame: "ring-1 ring-rose-200/40 dark:ring-rose-500/12",
    headerBadge: "border-rose-500/45 bg-rose-100/95 !text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/14 dark:!text-rose-100",
    headerPill: "border-rose-500/35 bg-rose-50/95 !text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/12 dark:!text-rose-100",
    navActive: "border-rose-500/35 bg-rose-100/80 !text-rose-950 hover:bg-rose-100/90 dark:border-rose-500/25 dark:bg-rose-500/10 dark:!text-rose-100 dark:hover:bg-rose-500/15",
    navAccent: "bg-rose-700 dark:bg-rose-300",
    navIcon: "border-rose-500/45 bg-rose-100/95 !text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/14 dark:!text-rose-100",
    sectionCard: "border-rose-500/25 bg-rose-50/65 dark:border-rose-500/18 dark:bg-rose-500/6",
    sectionIcon: "border-rose-500/45 bg-rose-100/95 !text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/14 dark:!text-rose-100",
  },
  violet: {
    headerFrame: "ring-1 ring-violet-200/35 dark:ring-violet-500/12",
    headerBadge: "border-violet-500/45 bg-violet-100/95 !text-violet-950 dark:border-violet-500/25 dark:bg-violet-500/14 dark:!text-violet-100",
    headerPill: "border-violet-500/35 bg-violet-50/95 !text-violet-950 dark:border-violet-500/25 dark:bg-violet-500/12 dark:!text-violet-100",
    navActive: "border-violet-500/35 bg-violet-100/80 !text-violet-950 hover:bg-violet-100/90 dark:border-violet-500/25 dark:bg-violet-500/10 dark:!text-violet-100 dark:hover:bg-violet-500/15",
    navAccent: "bg-violet-700 dark:bg-violet-300",
    navIcon: "border-violet-500/45 bg-violet-100/95 !text-violet-950 dark:border-violet-500/25 dark:bg-violet-500/14 dark:!text-violet-100",
    sectionCard: "border-violet-500/25 bg-violet-50/65 dark:border-violet-500/18 dark:bg-violet-500/6",
    sectionIcon: "border-violet-500/45 bg-violet-100/95 !text-violet-950 dark:border-violet-500/25 dark:bg-violet-500/14 dark:!text-violet-100",
  },
  slate: {
    headerFrame: "ring-1 ring-zinc-200/55 dark:ring-zinc-500/12",
    headerBadge: "border-zinc-500/45 bg-zinc-100/95 !text-zinc-950 dark:border-zinc-500/25 dark:bg-zinc-400/14 dark:!text-zinc-100",
    headerPill: "border-zinc-500/35 bg-zinc-50/95 !text-zinc-950 dark:border-zinc-500/25 dark:bg-zinc-400/12 dark:!text-zinc-100",
    navActive: "border-zinc-500/35 bg-zinc-100/80 !text-zinc-950 hover:bg-zinc-100/90 dark:border-zinc-500/25 dark:bg-zinc-400/10 dark:!text-zinc-100 dark:hover:bg-zinc-400/15",
    navAccent: "bg-zinc-800 dark:bg-zinc-300",
    navIcon: "border-zinc-500/45 bg-zinc-100/95 !text-zinc-950 dark:border-zinc-500/25 dark:bg-zinc-400/14 dark:!text-zinc-100",
    sectionCard: "border-zinc-500/25 bg-zinc-50/65 dark:border-zinc-500/18 dark:bg-zinc-400/6",
    sectionIcon: "border-zinc-500/45 bg-zinc-100/95 !text-zinc-950 dark:border-zinc-500/25 dark:bg-zinc-400/14 dark:!text-zinc-100",
  },
  cyan: {
    headerFrame: "ring-1 ring-cyan-200/45 dark:ring-cyan-500/12",
    headerBadge: "border-cyan-600/45 bg-cyan-100/95 !text-cyan-950 dark:border-cyan-500/25 dark:bg-cyan-500/14 dark:!text-cyan-100",
    headerPill: "border-cyan-600/35 bg-cyan-50/95 !text-cyan-950 dark:border-cyan-500/25 dark:bg-cyan-500/12 dark:!text-cyan-100",
    navActive: "border-cyan-600/35 bg-cyan-100/80 !text-cyan-950 hover:bg-cyan-100/90 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:!text-cyan-100 dark:hover:bg-cyan-500/15",
    navAccent: "bg-cyan-700 dark:bg-cyan-300",
    navIcon: "border-cyan-600/45 bg-cyan-100/95 !text-cyan-950 dark:border-cyan-500/25 dark:bg-cyan-500/14 dark:!text-cyan-100",
    sectionCard: "border-cyan-600/25 bg-cyan-50/65 dark:border-cyan-500/18 dark:bg-cyan-500/6",
    sectionIcon: "border-cyan-600/45 bg-cyan-100/95 !text-cyan-950 dark:border-cyan-500/25 dark:bg-cyan-500/14 dark:!text-cyan-100",
  },
};

export function getAdminRouteMeta(pathname: string): AdminRouteMeta {
  return ROUTE_META.find((route) => route.matches(pathname))?.meta ?? FALLBACK_ROUTE_META;
}
