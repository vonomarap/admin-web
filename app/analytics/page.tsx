"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { Calendar as CalendarIcon, ChartColumnIncreasing, X } from "lucide-react";
import { db, functions as firebaseFunctions } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { EmptyState, FieldBlock, MetricCard, PageAlert, SectionCard, ToneBadge } from "../../components/admin-kit";
import { BarTopChart, type BarDatum } from "../../components/charts/BarTopChart";
import { ConversionAovChart, type ConversionAovPoint } from "../../components/charts/ConversionAovChart";
import { PieBreakdownChart, type PieDatum } from "../../components/charts/PieBreakdownChart";
import { PromoDailyChart, type PromoDailyPoint } from "../../components/charts/PromoDailyChart";
import { TimeSeriesChart, type DailySeriesPoint } from "../../components/charts/TimeSeriesChart";
import { DotDensityMap, type DotDensityPoint, type PlaceDot } from "../../components/geo/DotDensityMap";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  type CalendarPreset,
  calendarPresetRangeKeys,
  dateKeyRange,
  isDateKey,
  rangeKeysToUtcMs,
  toDateKeyUTC,
  toMillis,
} from "../../lib/analytics";
import { dateKeyToLocalDate, localDateToDateKey } from "../../lib/date-pickers";
import { matchKanevskyPlaceFromAddress } from "../../lib/geo/addressToKanevskyPlace";
import { kanevskyDistrictBbox, kanevskyDistrictRing } from "../../lib/geo/kanevskyDistrict";
import { kanevskyPlaces } from "../../lib/geo/kanevskyPlaces";

type Quote = {
  id: string;
  status?: string;
  totalPrice?: number;
  calcInput?: unknown;
  items?: unknown;
  address?: unknown;
  createdAt?: unknown;
  confirmedAt?: unknown;
};

type PromoUsage = {
  id: string;
  promoCode?: unknown;
  discount?: unknown;
  currency?: unknown;
  usedAt?: unknown;
};

type Preset = CalendarPreset | "custom" | "all_time";
type AnalyticsTab = "general" | "promo" | "calc" | "geo";

const MAX_QUOTES = 10_000;
const QUOTES_PAGE_SIZE = 1000;
const MAX_PROMO_USAGES = 20_000;
const PROMO_USAGES_PAGE_SIZE = 2000;

const ANALYTICS_TAB_STORAGE_KEY = "admin:analytics:tab:v1";

function coerceNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function compareDesc(a: number, b: number): number {
  return b - a;
}

function formatDateKeyRangeLabel(startKey: string, endKey: string): string {
  return `${startKey} — ${endKey}`;
}

type CalcAgg = {
  productType: Record<string, number>;
  doorSubtype: Record<string, number>;
  profileModel: Record<string, number>;
  profileSeries: Record<string, number>;
  glazing: Record<string, number>;
  glassOptions: Record<string, number>;
  lamination: Record<string, number>;
  laminationGroup: Record<string, number>;
  laminationColor: Record<string, number>;
  designOption: Record<string, number>;
  options: Record<string, number>;
  services: {
    installEnabledCount: number;
    deliveryEnabledCount: number;
    deliveryKmSum: number;
    deliveryKmCount: number;
  };
};

type ProductViewsAggItem = {
  productId: string;
  views: number;
  title?: string;
  image?: string;
};

type ProductViewsAgg = {
  viewsTotal: number;
  byId: Record<string, ProductViewsAggItem>;
};

function emptyCalcAgg(): CalcAgg {
  return {
    productType: {},
    doorSubtype: {},
    profileModel: {},
    profileSeries: {},
    glazing: {},
    glassOptions: {},
    lamination: {},
    laminationGroup: {},
    laminationColor: {},
    designOption: {},
    options: {},
    services: { installEnabledCount: 0, deliveryEnabledCount: 0, deliveryKmSum: 0, deliveryKmCount: 0 },
  };
}

function emptyProductViewsAgg(): ProductViewsAgg {
  return {
    viewsTotal: 0,
    byId: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

const ANALYTICS_OPTION_KEYS = new Set<string>([
  "mosquito_net",
  "window_sill",
  "drip_edge",
  "casing",
  "child_lock",
  "decor_bars",
  "triplex",
  "tinted_glass",
  "vent_valve",
  "door_closer",
  "peephole",
  "reinforced_hinges",
  "warm_install",
  "trash_removal",
]);

function normalizeProductType(raw: string): "window" | "door" | "other" {
  if (raw === "window" || raw === "door") return raw;
  return "other";
}

function normalizeDoorSubtype(raw: string): "balcony" | "entrance" | "interior" | "other" {
  if (raw === "balcony" || raw === "entrance" || raw === "interior") return raw;
  return "other";
}

function normalizeProfileSeries(raw: string): "bautex" | "kbe" | "rehau" | "kommerling" | "other" {
  if (!raw) return "other";
  if (raw === "budget") return "bautex";
  if (raw === "standard") return "kbe";
  if (raw === "premium") return "rehau";
  if (raw === "bautex" || raw === "kbe" || raw === "rehau" || raw === "kommerling") return raw;
  return "other";
}

function normalizeProfileModel(raw: string): string {
  return raw.trim().toLowerCase() || "other";
}

const ANALYTICS_GLASS_OPTION_KEYS = new Set<string>([
  "energysaving",
  "multifunctional",
]);

function normalizeGlassOptionKey(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[_\-\s]/g, "");
  if (!normalized) return "other";
  if (ANALYTICS_GLASS_OPTION_KEYS.has(normalized)) {
    if (normalized === "energysaving") return "energySaving";
    if (normalized === "multifunctional") return "multiFunctional";
    return normalized;
  }
  return "other";
}

function normalizeGlazing(raw: string): "single" | "double" | "other" {
  if (raw === "single" || raw === "double") return raw;
  return "other";
}

function normalizeLamination(raw: string): "none" | "oneside" | "twoside" | "other" {
  if (raw === "none" || raw === "oneside" || raw === "twoside") return raw;
  return "other";
}

function normalizeLaminationGroup(raw: string): "white" | "wood" | "color" | "other" {
  if (raw === "white" || raw === "wood" || raw === "color") return raw;
  return "other";
}

function normalizeLaminationSide(raw: string): "outside" | "inside" | "other" {
  if (raw === "outside" || raw === "inside") return raw;
  return "other";
}

function normalizeLaminationColor(raw: string): "gold_oak" | "grey_oak" | "dark_oak" | "other" {
  if (!raw) return "other";
  const key = raw.replace(/ё/g, "е");
  if (key === "gold_oak" || key === "golden_oak" || key === "золотой дуб") return "gold_oak";
  if (key === "grey_oak" || key === "gray_oak" || key === "серый дуб") return "grey_oak";
  if (key === "dark_oak" || key === "темный дуб") return "dark_oak";
  return "other";
}

type DesignOptionKey = "none" | "outside" | "inside" | "twoside_white" | "twoside_color" | "twoside_wood" | "other";

function normalizeDesignOption(input: Record<string, unknown>): DesignOptionKey {
  const lamination = normalizeLamination(normalizeKey(input.lamination));
  if (lamination === "none") return "none";
  if (lamination === "oneside") {
    const side = normalizeLaminationSide(normalizeKey(input.laminationSide));
    return side === "inside" ? "inside" : "outside";
  }
  if (lamination === "twoside") {
    const group = normalizeLaminationGroup(normalizeKey(input.laminationGroup));
    if (group === "color") return "twoside_color";
    if (group === "wood") return "twoside_wood";
    return "twoside_white";
  }
  return "other";
}

function bump(map: Record<string, number>, key: string, delta = 1): void {
  map[key] = (map[key] ?? 0) + delta;
}

function sumNumberMap(target: Record<string, number>, source: unknown): void {
  if (!isRecord(source)) return;
  for (const [key, value] of Object.entries(source)) {
    const num = coerceNumber(value);
    if (!num) continue;
    target[key] = (target[key] ?? 0) + num;
  }
}

function sumMapValues(map: Record<string, number>): number {
  return Object.values(map).reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}

function accumulateProductViewsAggFromAnalytics(agg: ProductViewsAgg, rawProducts: unknown): void {
  if (!isRecord(rawProducts)) return;

  agg.viewsTotal += coerceNumber(rawProducts.viewsTotal);

  const rawById = isRecord(rawProducts.byId) ? rawProducts.byId : {};
  for (const [productId, rawEntry] of Object.entries(rawById)) {
    if (!isRecord(rawEntry)) continue;
    const views = coerceNumber(rawEntry.views);
    if (!views) continue;
    const title = typeof rawEntry.title === "string" ? rawEntry.title.trim() : "";
    const image = typeof rawEntry.image === "string" ? rawEntry.image.trim() : "";
    const current = agg.byId[productId] ?? { productId, views: 0 };
    current.views += views;
    if (title) current.title = title;
    if (image) current.image = image;
    agg.byId[productId] = current;
  }
}

function extractQuoteCalcInputs(quote: Quote): Record<string, unknown>[] {
  const fromItems: Record<string, unknown>[] = [];
  if (Array.isArray(quote.items)) {
    for (const item of quote.items) {
      if (!isRecord(item)) continue;
      const calcInput = item.calcInput;
      if (!isRecord(calcInput)) continue;
      fromItems.push(calcInput);
    }
  }
  if (fromItems.length) {
    return fromItems;
  }

  if (isRecord(quote.calcInput)) {
    return [quote.calcInput];
  }

  return [];
}

function buildCalcAggFromQuotes(quotes: Quote[]): CalcAgg {
  const agg = emptyCalcAgg();

  for (const quote of quotes) {
    const calcInputs = extractQuoteCalcInputs(quote);
    for (const input of calcInputs) {
      const productType = normalizeProductType(normalizeKey(input.productType));
      bump(agg.productType, productType);

      if (productType === "door") {
        bump(agg.doorSubtype, normalizeDoorSubtype(normalizeKey(input.doorSubtype)));
      }

      const profileModelRaw = normalizeKey(input.profileModel);
      if (profileModelRaw) {
        bump(agg.profileModel, normalizeProfileModel(profileModelRaw));
      }
      bump(agg.profileSeries, normalizeProfileSeries(normalizeKey(input.profileSeries)));
      bump(agg.glazing, normalizeGlazing(normalizeKey(input.glazing)));
      const glassOptionsRaw = input.glassOptions;
      if (isRecord(glassOptionsRaw)) {
        for (const [key, value] of Object.entries(glassOptionsRaw)) {
          if (value !== true) continue;
          const normalizedKey = normalizeGlassOptionKey(key);
          if (normalizedKey === "other") continue;
          bump(agg.glassOptions, normalizedKey);
        }
      }
      const lamination = normalizeLamination(normalizeKey(input.lamination));
      bump(agg.lamination, lamination);
      bump(agg.designOption, normalizeDesignOption(input));

      const laminationGroupRaw = normalizeKey(input.laminationGroup);
      if (lamination !== "none" && laminationGroupRaw) {
        bump(agg.laminationGroup, normalizeLaminationGroup(laminationGroupRaw));
      }

      const laminationColorRaw = normalizeKey(input.laminationColor);
      if (lamination !== "none" && laminationColorRaw) {
        bump(agg.laminationColor, normalizeLaminationColor(laminationColorRaw));
      }

      const optionsRaw = input.options;
      if (Array.isArray(optionsRaw)) {
        const unique = new Set<string>();
        for (const option of optionsRaw) {
          if (typeof option !== "string") continue;
          const normalized = option.trim().toLowerCase();
          if (!normalized) continue;
          unique.add(normalized);
        }

        for (const optionKey of unique) {
          const safeKey = ANALYTICS_OPTION_KEYS.has(optionKey) ? optionKey : "other";
          bump(agg.options, safeKey);
        }
      }

      const servicesRaw = input.services;
      if (isRecord(servicesRaw)) {
        if (servicesRaw.installEnabled === true) agg.services.installEnabledCount += 1;
        if (servicesRaw.deliveryEnabled === true) agg.services.deliveryEnabledCount += 1;
        const km = typeof servicesRaw.deliveryKm === "number" ? servicesRaw.deliveryKm : Number(servicesRaw.deliveryKm);
        if (Number.isFinite(km) && km > 0) {
          agg.services.deliveryKmSum += km;
          agg.services.deliveryKmCount += 1;
        }
      }
    }
  }

  return agg;
}

async function fetchAllQuotesInRange(startMs: number, endMsExclusive: number): Promise<{ quotes: Quote[]; truncated: boolean }> {
  if (!db) return { quotes: [], truncated: false };

  const results: Quote[] = [];
  let cursor: any = null;

  for (;;) {
    const constraints: any[] = [
      where("createdAt", ">=", new Date(startMs)),
      where("createdAt", "<", new Date(endMsExclusive)),
      orderBy("createdAt", "asc"),
      limit(QUOTES_PAGE_SIZE),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snap = await getDocs(query(collection(db, "quotes"), ...constraints));
    for (const docRef of snap.docs) {
      results.push({ id: docRef.id, ...(docRef.data() as Omit<Quote, "id">) });
      if (results.length >= MAX_QUOTES) {
        return { quotes: results, truncated: true };
      }
    }

    if (snap.docs.length < QUOTES_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return { quotes: results, truncated: false };
}

async function fetchAllPromoUsagesInRange(
  startMs: number,
  endMsExclusive: number
): Promise<{ usages: PromoUsage[]; truncated: boolean }> {
  if (!db) return { usages: [], truncated: false };

  const results: PromoUsage[] = [];
  let cursor: any = null;

  for (;;) {
    const constraints: any[] = [
      where("usedAt", ">=", new Date(startMs)),
      where("usedAt", "<", new Date(endMsExclusive)),
      orderBy("usedAt", "asc"),
      limit(PROMO_USAGES_PAGE_SIZE),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snap = await getDocs(query(collection(db, "promo_usages"), ...constraints));
    for (const docRef of snap.docs) {
      results.push({ id: docRef.id, ...(docRef.data() as Omit<PromoUsage, "id">) });
      if (results.length >= MAX_PROMO_USAGES) {
        return { usages: results, truncated: true };
      }
    }

    if (snap.docs.length < PROMO_USAGES_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return { usages: results, truncated: false };
}

function accumulateCalcAggFromAnalytics(agg: CalcAgg, rawCalc: unknown): void {
  if (!isRecord(rawCalc)) return;
  sumNumberMap(agg.productType, rawCalc.productType);
  sumNumberMap(agg.doorSubtype, rawCalc.doorSubtype);
  sumNumberMap(agg.profileModel, rawCalc.profileModel);
  sumNumberMap(agg.profileSeries, rawCalc.profileSeries);
  sumNumberMap(agg.glazing, rawCalc.glazing);
  sumNumberMap(agg.glassOptions, rawCalc.glassOptions);
  sumNumberMap(agg.lamination, rawCalc.lamination);
  sumNumberMap(agg.laminationGroup, rawCalc.laminationGroup);
  sumNumberMap(agg.laminationColor, rawCalc.laminationColor);
  sumNumberMap(agg.designOption, rawCalc.designOption);
  sumNumberMap(agg.options, rawCalc.options);

  const servicesRaw = rawCalc.services;
  if (isRecord(servicesRaw)) {
    agg.services.installEnabledCount += coerceNumber(servicesRaw.installEnabledCount);
    agg.services.deliveryEnabledCount += coerceNumber(servicesRaw.deliveryEnabledCount);
    agg.services.deliveryKmSum += coerceNumber(servicesRaw.deliveryKmSum);
    agg.services.deliveryKmCount += coerceNumber(servicesRaw.deliveryKmCount);
  }
}

async function fetchDailyAnalyticsRange(
  startKey: string,
  endKey: string
): Promise<{ series: DailySeriesPoint[]; calcAgg: CalcAgg; siteVisits: number; productViewsAgg: ProductViewsAgg; hasDocs: boolean }> {
  if (!db) return { series: [], calcAgg: emptyCalcAgg(), siteVisits: 0, productViewsAgg: emptyProductViewsAgg(), hasDocs: false };
  const snap = await getDocs(
    query(
      collection(db, "analytics_daily"),
      where(documentId(), ">=", startKey),
      where(documentId(), "<=", endKey),
      orderBy(documentId(), "asc")
    )
  );

  const byKey = new Map<string, DailySeriesPoint>();
  const calcAgg = emptyCalcAgg();
  const productViewsAgg = emptyProductViewsAgg();
  let siteVisits = 0;
  for (const docRef of snap.docs) {
    const data = docRef.data() as Record<string, unknown>;
    byKey.set(docRef.id, {
      dateKey: docRef.id,
      leads: coerceNumber(data.leads),
      confirmed: coerceNumber(data.confirmed),
      revenue: coerceNumber(data.revenue),
    });
    accumulateCalcAggFromAnalytics(calcAgg, data.calc);
    siteVisits += coerceNumber(isRecord(data.site) ? data.site.visits : 0);
    accumulateProductViewsAggFromAnalytics(productViewsAgg, data.products);
  }

  const keys = dateKeyRange(startKey, endKey);
  const series = keys.map((key) => byKey.get(key) ?? { dateKey: key, leads: 0, confirmed: 0, revenue: 0 });
  return { series, calcAgg, siteVisits, productViewsAgg, hasDocs: snap.docs.length > 0 };
}

async function fetchSiteVisitsRange(startKey: string, endKey: string): Promise<number> {
  if (!db) return 0;
  const snap = await getDocs(
    query(
      collection(db, "analytics_site_daily"),
      where("dayKey", ">=", startKey),
      where("dayKey", "<=", endKey),
      orderBy("dayKey", "asc")
    )
  );

  return snap.docs.reduce((sum, docRef) => {
    const data = docRef.data() as Record<string, unknown>;
    return sum + coerceNumber(data.visits);
  }, 0);
}

async function fetchProductViewsRange(startKey: string, endKey: string): Promise<ProductViewsAgg> {
  if (!db) return emptyProductViewsAgg();

  const snap = await getDocs(
    query(
      collection(db, "analytics_product_daily"),
      where("dayKey", ">=", startKey),
      where("dayKey", "<=", endKey),
      orderBy("dayKey", "asc")
    )
  );

  const agg = emptyProductViewsAgg();
  for (const docRef of snap.docs) {
    const data = docRef.data() as Record<string, unknown>;
    const productId = typeof data.productId === "string" ? data.productId.trim() : "";
    const views = coerceNumber(data.views);
    if (!productId || !views) continue;

    agg.viewsTotal += views;

    const current = agg.byId[productId] ?? { productId, views: 0 };
    current.views += views;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const image = typeof data.image === "string" ? data.image.trim() : "";
    if (title) current.title = title;
    if (image) current.image = image;
    agg.byId[productId] = current;
  }

  return agg;
}

function buildFallbackDailySeries(startKey: string, endKey: string, quotes: Quote[]): DailySeriesPoint[] {
  const keys = dateKeyRange(startKey, endKey);
  const leads: Record<string, number> = {};
  const confirmed: Record<string, number> = {};
  const revenue: Record<string, number> = {};

  for (const quote of quotes) {
    const createdMs = toMillis(quote.createdAt);
    if (createdMs !== null) {
      const dayKey = toDateKeyUTC(createdMs);
      leads[dayKey] = (leads[dayKey] ?? 0) + 1;
    }

    const isConfirmed = quote.status === "CONFIRMED";
    if (isConfirmed) {
      const confirmedMs = toMillis(quote.confirmedAt) ?? createdMs;
      if (confirmedMs !== null) {
        const dayKey = toDateKeyUTC(confirmedMs);
        confirmed[dayKey] = (confirmed[dayKey] ?? 0) + 1;
        revenue[dayKey] = (revenue[dayKey] ?? 0) + (Number(quote.totalPrice) || 0);
      }
    }
  }

  return keys.map((dateKey) => ({
    dateKey,
    leads: leads[dateKey] ?? 0,
    confirmed: confirmed[dateKey] ?? 0,
    revenue: revenue[dateKey] ?? 0,
  }));
}

function buildPromoStats(usages: PromoUsage[]): {
  topUses: { name: string; value: number }[];
  topDiscountByCurrency: Record<string, { name: string; value: number }[]>;
  totals: { uses: number; discountByCurrency: Record<string, number> };
} {
  const usesByCode = new Map<string, number>();
  const discountByCurrency: Record<string, number> = {};
  const discountByCodeCurrency: Record<string, Record<string, number>> = {};

  for (const usage of usages) {
    const promoCode = normalizeLabel(usage.promoCode, "UNKNOWN");
    const currency = normalizeLabel(usage.currency, "RUB");
    const discount = coerceNumber(usage.discount);

    usesByCode.set(promoCode, (usesByCode.get(promoCode) ?? 0) + 1);
    discountByCurrency[currency] = (discountByCurrency[currency] ?? 0) + discount;

    discountByCodeCurrency[promoCode] ??= {};
    discountByCodeCurrency[promoCode][currency] = (discountByCodeCurrency[promoCode][currency] ?? 0) + discount;
  }

  const topUses = [...usesByCode.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => compareDesc(a.value, b.value))
    .slice(0, 10);

  const topDiscountByCurrency: Record<string, { name: string; value: number }[]> = {};
  for (const currency of Object.keys(discountByCurrency).sort()) {
    const data = Object.entries(discountByCodeCurrency)
      .map(([code, byCur]) => ({ name: code, value: byCur[currency] ?? 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => compareDesc(a.value, b.value))
      .slice(0, 10);
    topDiscountByCurrency[currency] = data;
  }

  return {
    topUses,
    topDiscountByCurrency,
    totals: { uses: usages.length, discountByCurrency },
  };
}

function buildPromoDailyByCurrency(startKey: string, endKey: string, usages: PromoUsage[]): Record<string, PromoDailyPoint[]> {
  const keys = dateKeyRange(startKey, endKey);
  const usesByDay: Record<string, number> = {};
  const discountByCurrencyDay: Record<string, Record<string, number>> = {};

  for (const usage of usages) {
    const usedMs = toMillis(usage.usedAt);
    if (usedMs === null) continue;
    const dayKey = toDateKeyUTC(usedMs);
    usesByDay[dayKey] = (usesByDay[dayKey] ?? 0) + 1;

    const currency = normalizeLabel(usage.currency, "RUB");
    const discount = coerceNumber(usage.discount);
    discountByCurrencyDay[currency] ??= {};
    discountByCurrencyDay[currency][dayKey] = (discountByCurrencyDay[currency][dayKey] ?? 0) + discount;
  }

  const result: Record<string, PromoDailyPoint[]> = {};
  for (const currency of Object.keys(discountByCurrencyDay).sort()) {
    const discounts = discountByCurrencyDay[currency] ?? {};
    result[currency] = keys.map((dateKey) => ({
      dateKey,
      uses: usesByDay[dateKey] ?? 0,
      discount: discounts[dateKey] ?? 0,
    }));
  }

  return result;
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  window: "Окно",
  door: "Дверь",
  other: "Другое/не указано",
};

const DOOR_SUBTYPE_LABELS: Record<string, string> = {
  balcony: "Балконная",
  entrance: "Входная",
  interior: "Межкомнатная",
  other: "Другое/не указано",
};

const PROFILE_SERIES_LABELS: Record<string, string> = {
  bautex: "Bautex",
  kbe: "KBE",
  rehau: "Rehau",
  kommerling: "Kommerling",
  other: "Другое/не указано",
};

const PROFILE_MODEL_LABELS: Record<string, string> = {
  bautex_58: "Bautex 58",
  kbe_58: "KBE 58",
  kbe_expert_70: "KBE Expert 70",
  kbe_76: "KBE 76",
  rehau_blitz_new: "Rehau Blitz New",
  rehau_thermo_design: "Rehau Thermo-Design",
  rehau_grazio: "Rehau Grazio",
  rehau_delight_design: "Rehau Delight-Design",
  rehau_intelio: "Rehau Intelio",
  rehau_geneo: "Rehau Geneo",
  kommerling_70_ad: "Kommerling 70 AD",
  kommerling_76_ad: "Kommerling 76 AD",
  other: "Другое/не указано",
};

const GLAZING_LABELS: Record<string, string> = {
  single: "Однокамерный",
  double: "Двухкамерный",
  other: "Другое/не указано",
};

const GLASS_OPTION_LABELS: Record<string, string> = {
  energySaving: "Энергосберегающий стеклопакет",
  multiFunctional: "Мультифункциональный стеклопакет",
  other: "Другое/не указано",
};

const LAMINATION_COLOR_LABELS: Record<string, string> = {
  gold_oak: "Золотой дуб",
  grey_oak: "Серый дуб",
  dark_oak: "Тёмный дуб",
  other: "Другой цвет",
};

const DESIGN_OPTION_LABELS: Record<string, string> = {
  none: "Нет",
  outside: "Наружная",
  inside: "Внутренняя",
  twoside_white: "Двусторонняя (белая основа)",
  twoside_color: "Двусторонняя (цветная основа)",
  twoside_wood: "Двусторонняя (под дерево)",
  other: "Другое/не указано",
};

const OPTION_LABELS: Record<string, string> = {
  mosquito_net: "Москитная сетка",
  window_sill: "Подоконник",
  drip_edge: "Отлив",
  casing: "Наличники",
  child_lock: "Детский замок",
  decor_bars: "Декоративные шпросы",
  triplex: "Триплекс",
  tinted_glass: "Тонировка",
  vent_valve: "Клапан проветривания",
  door_closer: "Доводчик",
  peephole: "Глазок",
  reinforced_hinges: "Усиленные петли",
  warm_install: "Теплый монтаж",
  trash_removal: "Вывоз мусора",
  other: "Другое/не указано",
};

function toBarData(map: Record<string, number>, labels: Record<string, string>, top = 10): BarDatum[] {
  return Object.entries(map)
    .map(([key, value]) => ({ key, value: coerceNumber(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => compareDesc(a.value, b.value))
    .slice(0, top)
    .map(({ key, value }) => ({ name: labels[key] ?? key, value }));
}

function toPieData(map: Record<string, number>, labels: Record<string, string>, top = 8): PieDatum[] {
  return Object.entries(map)
    .map(([key, value]) => ({ key, value: coerceNumber(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => compareDesc(a.value, b.value))
    .slice(0, top)
    .map(({ key, value }) => ({ key, name: labels[key] ?? key, value }));
}

const PIE_COLOR_BLACK_1 = "#0f172a";
const PIE_COLOR_BLACK_2 = "#111827";
const PIE_COLOR_BLACK_3 = "#1f2937";
const PIE_COLOR_BLACK_4 = "#334155";
const PIE_COLOR_BLACK_5 = "#4b5563";
const PIE_COLOR_ORANGE_1 = "#ff7a00";
const PIE_COLOR_ORANGE_2 = "#ea580c";
const PIE_COLOR_ORANGE_3 = "#c2410c";
const PIE_COLOR_ORANGE_4 = "#fb923c";
const PIE_COLOR_ORANGE_5 = "#9a3412";
const PIE_COLOR_RED_1 = "#ef4444";
const PIE_COLOR_RED_2 = "#dc2626";
const PIE_COLOR_RED_3 = "#b91c1c";
const PIE_COLOR_RED_4 = "#7f1d1d";
const PIE_COLOR_RED_5 = "#f87171";

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  window: PIE_COLOR_ORANGE_1,
  door: PIE_COLOR_RED_1,
  other: PIE_COLOR_BLACK_2,
};

const DOOR_SUBTYPE_COLORS: Record<string, string> = {
  balcony: PIE_COLOR_ORANGE_2,
  entrance: PIE_COLOR_RED_2,
  interior: PIE_COLOR_BLACK_1,
  other: PIE_COLOR_BLACK_4,
};

const PROFILE_SERIES_COLORS: Record<string, string> = {
  bautex: PIE_COLOR_BLACK_2,
  kbe: PIE_COLOR_ORANGE_1,
  rehau: PIE_COLOR_RED_1,
  other: PIE_COLOR_BLACK_4,
};

const GLAZING_COLORS: Record<string, string> = {
  single: PIE_COLOR_BLACK_2,
  double: PIE_COLOR_ORANGE_1,
  other: PIE_COLOR_RED_1,
};

const LAMINATION_COLOR_COLORS: Record<string, string> = {
  gold_oak: PIE_COLOR_ORANGE_1,
  grey_oak: PIE_COLOR_BLACK_4,
  dark_oak: PIE_COLOR_BLACK_2,
  other: PIE_COLOR_BLACK_5,
};

const DESIGN_OPTION_COLORS: Record<string, string> = {
  none: PIE_COLOR_BLACK_2,
  outside: PIE_COLOR_ORANGE_1,
  inside: PIE_COLOR_ORANGE_2,
  twoside_white: PIE_COLOR_BLACK_3,
  twoside_color: PIE_COLOR_RED_2,
  twoside_wood: PIE_COLOR_ORANGE_3,
  other: PIE_COLOR_BLACK_4,
};

const SERVICES_COLORS: Record<string, string> = {
  install: PIE_COLOR_ORANGE_1,
  delivery: PIE_COLOR_RED_1,
};

const OPTION_COLORS: Record<string, string> = {
  mosquito_net: PIE_COLOR_ORANGE_1,
  window_sill: PIE_COLOR_BLACK_1,
  drip_edge: PIE_COLOR_RED_2,
  casing: PIE_COLOR_ORANGE_2,
  child_lock: PIE_COLOR_BLACK_2,
  decor_bars: PIE_COLOR_RED_3,
  triplex: PIE_COLOR_ORANGE_4,
  tinted_glass: PIE_COLOR_BLACK_3,
  vent_valve: PIE_COLOR_ORANGE_5,
  door_closer: PIE_COLOR_BLACK_4, // Доводчик — "черный"
  peephole: PIE_COLOR_RED_4,
  reinforced_hinges: PIE_COLOR_RED_1, // Усиленные петли — "красный"
  warm_install: PIE_COLOR_BLACK_5,
  trash_removal: PIE_COLOR_RED_5,
  other: PIE_COLOR_ORANGE_3,
};

function withPieColors(data: PieDatum[], colorByKey: Record<string, string>): PieDatum[] {
  return data.map((item) => {
    const key = item.key ?? "";
    return { ...item, color: colorByKey[key] ?? PIE_COLOR_ORANGE_1 };
  });
}

export default function AnalyticsPage(): JSX.Element {
  const session = useAdminSession();

  const [preset, setPreset] = useState<Preset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [allTimeStartKey, setAllTimeStartKey] = useState<string | null>(null);
  const [allTimeLoading, setAllTimeLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("general");

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [dailySeries, setDailySeries] = useState<DailySeriesPoint[]>([]);
  const [dailySource, setDailySource] = useState<"analytics_daily" | "quotes_fallback">("analytics_daily");
  const [siteVisits, setSiteVisits] = useState(0);
  const [productViewsAgg, setProductViewsAgg] = useState<ProductViewsAgg>(() => emptyProductViewsAgg());

  const [quotesTruncated, setQuotesTruncated] = useState(false);

  const [calcAgg, setCalcAgg] = useState<CalcAgg>(() => emptyCalcAgg());
  const [calcSource, setCalcSource] = useState<"analytics_daily" | "quotes_fallback">("analytics_daily");

  const [promoTruncated, setPromoTruncated] = useState(false);
  const [promoTopUses, setPromoTopUses] = useState<{ name: string; value: number }[]>([]);
  const [promoTopDiscountByCurrency, setPromoTopDiscountByCurrency] = useState<Record<string, { name: string; value: number }[]>>({});
  const [promoTotals, setPromoTotals] = useState<{ uses: number; discountByCurrency: Record<string, number> }>({
    uses: 0,
    discountByCurrency: {},
  });

  const [promoDailyByCurrency, setPromoDailyByCurrency] = useState<Record<string, PromoDailyPoint[]>>({});
  const [promoDailyCurrency, setPromoDailyCurrency] = useState("");

  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillInfo, setBackfillInfo] = useState<{ updatedDays: number; processedQuotes: number; days: number } | null>(null);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoData, setGeoData] = useState<{
    points: DotDensityPoint[];
    places: PlaceDot[];
    topPlaces: BarDatum[];
    totalQuotes: number;
    matchedQuotes: number;
    unknownQuotes: number;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANALYTICS_TAB_STORAGE_KEY);
      if (raw === "general" || raw === "promo" || raw === "calc" || raw === "geo") {
        setActiveTab(raw);
      }
    } catch {
      // Ignore.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_TAB_STORAGE_KEY, activeTab);
    } catch {
      // Ignore.
    }
  }, [activeTab]);

  const fetchAllTimeStartKey = useCallback(async (): Promise<string | null> => {
    if (!db) return null;
    const snap = await getDocs(
      query(collection(db, "analytics_daily"), orderBy(documentId(), "asc"), limit(20))
    );
    for (const docRef of snap.docs) {
      if (isDateKey(docRef.id)) return docRef.id;
    }
    return null;
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (preset !== "all_time") return;
    if (allTimeLoading || allTimeStartKey) return;

    let cancelled = false;

    setAllTimeLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const startKey = await fetchAllTimeStartKey();
        if (cancelled) return;
        if (!startKey) {
          setLoadError("Нет данных analytics_daily для периода «за всё время».");
          return;
        }
        setAllTimeStartKey(startKey);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (cancelled) return;
        setAllTimeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allTimeLoading, allTimeStartKey, fetchAllTimeStartKey, preset, session.status]);

  const rangeKeys = useMemo(() => {
    if (preset === "custom") {
      const startKey = customFrom.trim();
      const endKey = customTo.trim();
      if (!isDateKey(startKey) || !isDateKey(endKey)) return null;
      if (startKey > endKey) return { startKey: endKey, endKey: startKey };
      return { startKey, endKey };
    }
    if (preset === "all_time") {
      if (!allTimeStartKey) return null;
      const endKey = toDateKeyUTC(Date.now());
      const startKey = allTimeStartKey;
      if (startKey > endKey) return { startKey: endKey, endKey };
      return { startKey, endKey };
    }
    return calendarPresetRangeKeys(preset);
  }, [allTimeStartKey, customFrom, customTo, preset]);

  const rangeMs = useMemo(() => {
    if (!rangeKeys) return null;
    return rangeKeysToUtcMs(rangeKeys.startKey, rangeKeys.endKey);
  }, [rangeKeys]);

  const rangeLabel = useMemo(() => {
    if (preset === "all_time") {
      if (allTimeLoading) return "За всё время (загрузка...)";
      if (!rangeKeys) return "За всё время";
    }
    if (!rangeKeys) return "—";
    return formatDateKeyRangeLabel(rangeKeys.startKey, rangeKeys.endKey);
  }, [allTimeLoading, preset, rangeKeys]);

  const rangeDays = useMemo(() => {
    if (!rangeKeys) return 0;
    return dateKeyRange(rangeKeys.startKey, rangeKeys.endKey).length;
  }, [rangeKeys]);
  const customFromDate = useMemo(() => dateKeyToLocalDate(customFrom), [customFrom]);
  const customToDate = useMemo(() => dateKeyToLocalDate(customTo), [customTo]);

  const canBackfill = rangeDays > 0 && rangeDays <= 31;

  const loadAll = useCallback(async () => {
    if (!db) return;
    if (!rangeKeys || !rangeMs) {
      if (preset === "all_time") return;
      setLoadError("Неверный период. Укажите даты в формате YYYY-MM-DD.");
      return;
    }

    setLoading(true);
    setLoadError(null);
    setQuotesTruncated(false);
    setCalcAgg(emptyCalcAgg());
    setCalcSource("analytics_daily");
    setSiteVisits(0);
    setProductViewsAgg(emptyProductViewsAgg());
    setPromoTruncated(false);
    setPromoDailyByCurrency({});

    try {
      const [dailyResult, promoResult, siteVisitsResult, productViewsResult] = await Promise.all([
        fetchDailyAnalyticsRange(rangeKeys.startKey, rangeKeys.endKey).catch(() => ({
          series: [],
          calcAgg: emptyCalcAgg(),
          siteVisits: 0,
          productViewsAgg: emptyProductViewsAgg(),
          hasDocs: false,
        })),
        fetchAllPromoUsagesInRange(rangeMs.startMs, rangeMs.endMsExclusive),
        fetchSiteVisitsRange(rangeKeys.startKey, rangeKeys.endKey).catch(() => 0),
        fetchProductViewsRange(rangeKeys.startKey, rangeKeys.endKey).catch(() => emptyProductViewsAgg()),
      ]);

      let quotesCache: Quote[] = [];
      let quotesLoaded = false;
      let quotesWasTruncated = false;

      let resolvedDailySeries: DailySeriesPoint[] = [];
      let resolvedDailySource: "analytics_daily" | "quotes_fallback" = "analytics_daily";

      if (dailyResult.hasDocs) {
        resolvedDailySeries = dailyResult.series;
        resolvedDailySource = "analytics_daily";
      } else {
        const quotesResult = await fetchAllQuotesInRange(rangeMs.startMs, rangeMs.endMsExclusive);
        quotesCache = quotesResult.quotes;
        quotesWasTruncated = quotesResult.truncated;
        quotesLoaded = true;
        resolvedDailySeries = buildFallbackDailySeries(rangeKeys.startKey, rangeKeys.endKey, quotesCache);
        resolvedDailySource = "quotes_fallback";
      }

      setDailySource(resolvedDailySource);
      setDailySeries(resolvedDailySeries);
      setSiteVisits(siteVisitsResult);
      setProductViewsAgg(productViewsResult);
      setQuotesTruncated(quotesWasTruncated);

	      const calcTotal = sumMapValues(dailyResult.calcAgg.productType);
	      const laminationUsedTotal =
	        sumMapValues(dailyResult.calcAgg.lamination) - (dailyResult.calcAgg.lamination.none ?? 0);
	      const laminationColorTotal = sumMapValues(dailyResult.calcAgg.laminationColor);
	      const preferQuoteCalc = calcTotal <= 0 || (laminationUsedTotal > 0 && laminationColorTotal === 0);

	      if (!preferQuoteCalc) {
	        setCalcSource("analytics_daily");
	        setCalcAgg(dailyResult.calcAgg);
	      } else {
	        if (!quotesLoaded) {
	          const quotesResult = await fetchAllQuotesInRange(rangeMs.startMs, rangeMs.endMsExclusive);
	          quotesCache = quotesResult.quotes;
	          quotesWasTruncated = quotesResult.truncated;
	          quotesLoaded = true;
	          setQuotesTruncated(quotesWasTruncated);
	        }
	        setCalcSource("quotes_fallback");
	        setCalcAgg(buildCalcAggFromQuotes(quotesCache));
	      }

      const { usages, truncated: promoWasTruncated } = promoResult;
      setPromoTruncated(promoWasTruncated);
      const promoStats = buildPromoStats(usages);
      setPromoTopUses(promoStats.topUses);
      setPromoTopDiscountByCurrency(promoStats.topDiscountByCurrency);
      setPromoTotals(promoStats.totals);
      const promoDaily = buildPromoDailyByCurrency(rangeKeys.startKey, rangeKeys.endKey, usages);
      setPromoDailyByCurrency(promoDaily);
      const currencies = Object.keys(promoDaily).sort();
      setPromoDailyCurrency((prev) => (currencies.includes(prev) ? prev : currencies[0] ?? ""));

      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error("Analytics load failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [preset, rangeKeys, rangeMs]);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadAll();
  }, [loadAll, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loading) return;
      void loadAll();
    };

    const onVisibility = () => {
      if (docRef.visibilityState === "visible") refresh();
    };

    win.addEventListener?.("focus", refresh);
    docRef.addEventListener?.("visibilitychange", onVisibility);
    return () => {
      win.removeEventListener?.("focus", refresh);
      docRef.removeEventListener?.("visibilitychange", onVisibility);
    };
  }, [loadAll, loading, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (activeTab !== "geo") return;
    if (!rangeMs) return;

    let cancelled = false;

    setGeoLoading(true);
    setGeoError(null);

    void (async () => {
      try {
        const { quotes, truncated } = await fetchAllQuotesInRange(rangeMs.startMs, rangeMs.endMsExclusive);
        if (cancelled) return;

        if (truncated) setQuotesTruncated(true);

        type KanevskyPlaceId = (typeof kanevskyPlaces)[number]["id"];
        const placeById = new Map<KanevskyPlaceId, (typeof kanevskyPlaces)[number]>(
          kanevskyPlaces.map((place) => [place.id, place] as const)
        );
        const countsByPlace = new Map<KanevskyPlaceId, number>();
        let matchedQuotes = 0;
        let unknownQuotes = 0;

        for (const quote of quotes) {
          const address = typeof quote.address === "string" ? quote.address : "";
          if (!address) {
            unknownQuotes += 1;
            continue;
          }

          const match = matchKanevskyPlaceFromAddress(address);
          if (!match) {
            unknownQuotes += 1;
            continue;
          }

          matchedQuotes += 1;
          const placeId = match.place.id;
          countsByPlace.set(placeId, (countsByPlace.get(placeId) ?? 0) + 1);
        }

        const sortedPlaces = Array.from(countsByPlace.entries())
          .map(([id, value]) => ({ id, value, name: placeById.get(id)?.name ?? id }))
          .sort((a, b) => compareDesc(a.value, b.value));

        const points: DotDensityPoint[] = sortedPlaces
          .map((item) => {
            const place = placeById.get(item.id);
            if (!place) return null;
            return { lon: place.lon, lat: place.lat, weight: item.value };
          })
          .filter((item): item is DotDensityPoint => Boolean(item));

        const topPlaces: BarDatum[] = sortedPlaces.slice(0, 12).map((item) => ({ name: item.name, value: item.value }));
        const places: PlaceDot[] = kanevskyPlaces.map((place) => ({
          id: place.id,
          name: place.name,
          lon: place.lon,
          lat: place.lat,
          count: countsByPlace.get(place.id) ?? 0,
        }));

        setGeoData({
          points,
          places,
          topPlaces,
          totalQuotes: quotes.length,
          matchedQuotes,
          unknownQuotes,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Geo analytics load failed:", error);
        setGeoError(error instanceof Error ? error.message : String(error));
        setGeoData(null);
      } finally {
        if (cancelled) return;
        setGeoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, lastUpdatedAt, rangeMs, session.status]);

  const runBackfill = useCallback(async () => {
    if (!firebaseFunctions) {
      setBackfillError("Firebase Functions не настроены в этом приложении.");
      return;
    }
    if (!rangeKeys) return;
    if (!canBackfill) {
      setBackfillError("Backfill доступен только для периодов до 31 дня.");
      return;
    }

    setBackfillRunning(true);
    setBackfillError(null);
    setBackfillInfo(null);
    try {
      const callable = httpsCallable(firebaseFunctions, "backfillAnalyticsDailyCalc");
      const result = await callable({ from: rangeKeys.startKey, to: rangeKeys.endKey });
      const data = result.data as any;
      setBackfillInfo({
        updatedDays: Number(data?.updatedDays) || 0,
        processedQuotes: Number(data?.processedQuotes) || 0,
        days: Number(data?.range?.days) || rangeDays,
      });
      await loadAll();
    } catch (error) {
      console.error("Backfill failed:", error);
      setBackfillError(error instanceof Error ? error.message : String(error));
    } finally {
      setBackfillRunning(false);
    }
  }, [canBackfill, loadAll, rangeDays, rangeKeys]);

  const presets = useMemo(
    () =>
      [
        { key: "today" as const, label: "Сегодня" },
        { key: "yesterday" as const, label: "Вчера" },
        { key: "week" as const, label: "Неделя" },
        { key: "month" as const, label: "Месяц" },
        { key: "quarter" as const, label: "Квартал" },
        { key: "year" as const, label: "Год" },
        { key: "all_time" as const, label: "За всё время" },
        { key: "custom" as const, label: "Свои" },
      ] as const,
    []
  );

  const promoCurrencies = useMemo(() => Object.keys(promoTotals.discountByCurrency).sort(), [promoTotals.discountByCurrency]);
  const promoDailyCurrencies = useMemo(() => Object.keys(promoDailyByCurrency).sort(), [promoDailyByCurrency]);
  const promoDailySeries = useMemo(
    () => (promoDailyCurrency ? promoDailyByCurrency[promoDailyCurrency] ?? [] : []),
    [promoDailyByCurrency, promoDailyCurrency]
  );

  const dailyTotals = useMemo(() => {
    let leads = 0;
    let confirmed = 0;
    let revenue = 0;
    for (const point of dailySeries) {
      leads += point.leads;
      confirmed += point.confirmed;
      revenue += point.revenue;
    }
    const conversionPct = leads ? (confirmed / leads) * 100 : 0;
    const aov = confirmed ? revenue / confirmed : 0;
    return { leads, confirmed, revenue, conversionPct, aov };
  }, [dailySeries]);

  const conversionAovSeries = useMemo<ConversionAovPoint[]>(
    () =>
      dailySeries.map((point) => ({
        dateKey: point.dateKey,
        conversionPct: point.leads ? (point.confirmed / point.leads) * 100 : 0,
        aov: point.confirmed ? point.revenue / point.confirmed : 0,
      })),
    [dailySeries]
  );

  const calcTotal = useMemo(() => sumMapValues(calcAgg.productType), [calcAgg.productType]);
  const calcCoveragePct = useMemo(() => (dailyTotals.leads ? (calcTotal / dailyTotals.leads) * 100 : 100), [calcTotal, dailyTotals.leads]);

  const calcProductTypePie = useMemo(
    () => withPieColors(toPieData(calcAgg.productType, PRODUCT_TYPE_LABELS), PRODUCT_TYPE_COLORS),
    [calcAgg.productType]
  );
  const calcDoorSubtypePie = useMemo(
    () => withPieColors(toPieData(calcAgg.doorSubtype, DOOR_SUBTYPE_LABELS), DOOR_SUBTYPE_COLORS),
    [calcAgg.doorSubtype]
  );
  const calcProfileModelPie = useMemo(
    () => withPieColors(toPieData(calcAgg.profileModel, PROFILE_MODEL_LABELS), PROFILE_SERIES_COLORS),
    [calcAgg.profileModel]
  );
  const calcProfileSeriesPie = useMemo(
    () => withPieColors(toPieData(calcAgg.profileSeries, PROFILE_SERIES_LABELS), PROFILE_SERIES_COLORS),
    [calcAgg.profileSeries]
  );
  const calcGlazingPie = useMemo(
    () => withPieColors(toPieData(calcAgg.glazing, GLAZING_LABELS), GLAZING_COLORS),
    [calcAgg.glazing]
  );
  const calcGlassOptionsPie = useMemo(
    () =>
      withPieColors(
        toPieData(
          Object.fromEntries(
            Object.entries(calcAgg.glassOptions).filter(
              ([key]) => key === "energySaving" || key === "multiFunctional"
            )
          ),
          GLASS_OPTION_LABELS
        ),
        GLAZING_COLORS
      ),
    [calcAgg.glassOptions]
  );
  const calcLaminationColorPie = useMemo(
    () => withPieColors(toPieData(calcAgg.laminationColor, LAMINATION_COLOR_LABELS), LAMINATION_COLOR_COLORS),
    [calcAgg.laminationColor]
  );
  const calcDesignOptionPie = useMemo(
    () => withPieColors(toPieData(calcAgg.designOption, DESIGN_OPTION_LABELS), DESIGN_OPTION_COLORS),
    [calcAgg.designOption]
  );
  const calcOptionsPie = useMemo(
    () => withPieColors(toPieData(calcAgg.options, OPTION_LABELS), OPTION_COLORS),
    [calcAgg.options]
  );

  const servicesPie = useMemo<PieDatum[]>(
    () =>
      withPieColors(
        [
          { key: "install", name: "Монтаж", value: calcAgg.services.installEnabledCount },
          { key: "delivery", name: "Доставка", value: calcAgg.services.deliveryEnabledCount },
        ].filter((item) => item.value > 0),
        SERVICES_COLORS
      ),
    [calcAgg.services.deliveryEnabledCount, calcAgg.services.installEnabledCount]
  );

  const avgDeliveryKm = useMemo(() => {
    if (!calcAgg.services.deliveryKmCount) return 0;
    return calcAgg.services.deliveryKmSum / calcAgg.services.deliveryKmCount;
  }, [calcAgg.services.deliveryKmCount, calcAgg.services.deliveryKmSum]);

  const topViewedProducts = useMemo(
    () =>
      Object.values(productViewsAgg.byId)
        .filter((item) => item.views > 0)
        .sort((a, b) => {
          if (b.views !== a.views) return b.views - a.views;
          const aLabel = (a.title ?? a.productId).toLowerCase();
          const bLabel = (b.title ?? b.productId).toLowerCase();
          return aLabel.localeCompare(bLabel, "ru");
        })
        .slice(0, 10),
    [productViewsAgg.byId]
  );

  const topViewedProductsBar = useMemo<BarDatum[]>(
    () =>
      topViewedProducts.map((item) => ({
        name: item.title || item.productId,
        value: item.views,
      })),
    [topViewedProducts]
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Статистика" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Статистика"
      subtitle={session.user?.email ?? ""}
    >
      <SectionCard
        eyebrow="Период"
        title="Окно анализа"
        description="Все графики и агрегаты пересчитываются для выбранного интервала. Даты интерпретируются в UTC."
        icon={ChartColumnIncreasing}
        tone="cyan"
        actions={<Badge variant="outline">{rangeLabel}</Badge>}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={preset === item.key ? "default" : "outline"}
                onClick={() => setPreset(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="С">
                <div className="flex min-w-0 items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        data-empty={!customFromDate || undefined}
                        className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                      >
                        <CalendarIcon data-icon="inline-start" />
                        {customFromDate ? <span>{format(customFromDate, "PPP", { locale: ru })}</span> : <span>Выберите дату</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto overflow-hidden p-0">
                      <Calendar
                        mode="single"
                        selected={customFromDate}
                        onSelect={(date) => {
                          if (!date) return;
                          setCustomFrom(localDateToDateKey(date));
                        }}
                        className="rounded-lg"
                      />
                    </PopoverContent>
                  </Popover>
                  {customFrom ? (
                    <Button type="button" size="icon" variant="outline" aria-label="Очистить дату начала" onClick={() => setCustomFrom("")}>
                      <X />
                    </Button>
                  ) : null}
                </div>
              </FieldBlock>
              <FieldBlock label="По">
                <div className="flex min-w-0 items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        data-empty={!customToDate || undefined}
                        className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                      >
                        <CalendarIcon data-icon="inline-start" />
                        {customToDate ? <span>{format(customToDate, "PPP", { locale: ru })}</span> : <span>Выберите дату</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto overflow-hidden p-0">
                      <Calendar
                        mode="single"
                        selected={customToDate}
                        onSelect={(date) => {
                          if (!date) return;
                          setCustomTo(localDateToDateKey(date));
                        }}
                        className="rounded-lg"
                      />
                    </PopoverContent>
                  </Popover>
                  {customTo ? (
                    <Button type="button" size="icon" variant="outline" aria-label="Очистить дату конца" onClick={() => setCustomTo("")}>
                      <X />
                    </Button>
                  ) : null}
                </div>
              </FieldBlock>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <div>{lastUpdatedAt ? `Обновлено: ${lastUpdatedAt.toLocaleString("ru-RU")}` : ""}</div>
            {rangeDays ? <div>Дней: {rangeDays}</div> : null}
          </div>

          {dailySource === "analytics_daily" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void runBackfill()}
                disabled={!firebaseFunctions || backfillRunning || !canBackfill}
                title={canBackfill ? "Заполнить calc.* в analytics_daily за период" : "Backfill доступен только до 31 дня"}
              >
                {backfillRunning ? "Backfill..." : "Backfill calc.*"}
              </Button>
              {!canBackfill ? <ToneBadge tone="muted">Доступно до 31 дня</ToneBadge> : null}
              {backfillInfo ? (
                <ToneBadge tone="success">
                  Готово: {backfillInfo.updatedDays} дней, {backfillInfo.processedQuotes} заявок
                </ToneBadge>
              ) : null}
              {backfillError ? <PageAlert title="Ошибка backfill" description={backfillError} className="w-full" /> : null}
            </div>
          ) : null}

          {quotesTruncated ? (
            <PageAlert
              title="Данные по заявкам усечены"
              description={
                <>
                  Загружено только {MAX_QUOTES.toLocaleString("ru-RU")} заявок за период. Метрики на основе <b>quotes</b> могут быть неточны.
                </>
              }
              variant="warning"
            />
          ) : null}

          {promoTruncated ? (
            <PageAlert
              title="Данные по promo_usages усечены"
              description={`Загружено только ${MAX_PROMO_USAGES.toLocaleString("ru-RU")} записей promo_usages. Уменьшите период для точных данных.`}
              variant="warning"
            />
          ) : null}
        </div>
      </SectionCard>

      {loadError ? <PageAlert title="Ошибка загрузки аналитики" description={loadError} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <MetricCard label="Заявки" value={dailyTotals.leads.toLocaleString("ru-RU")} />
        <MetricCard label="Подтверждено" value={dailyTotals.confirmed.toLocaleString("ru-RU")} />
        <MetricCard label="Выручка" value={dailyTotals.revenue.toLocaleString("ru-RU")} />
        <MetricCard label="Конверсия" value={`${dailyTotals.conversionPct.toFixed(1)}%`} />
        <MetricCard label="Средний чек" value={dailyTotals.aov.toLocaleString("ru-RU")} description="UTC. Конверсия = confirmed/leads в тот же день." />
        <MetricCard label="Заходы на сайт" value={siteVisits.toLocaleString("ru-RU")} description="Уникальные сессии по 30-минутному окну." />
        <MetricCard label="Просмотры товаров" value={productViewsAgg.viewsTotal.toLocaleString("ru-RU")} description="Открытия карточек товаров за выбранный период." />
      </div>

      <SectionCard
        eyebrow="Раздел"
        title="Витрины аналитики"
        description="Переключение между общими, промо-, калькуляторными и гео-отчётами."
        icon={ChartColumnIncreasing}
        tone="cyan"
      >
        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(next) => {
            if (next) setActiveTab(next as AnalyticsTab);
          }}
          variant="outline"
          size="sm"
          className="flex w-full flex-wrap gap-2"
          aria-label="Раздел статистики"
        >
          <ToggleGroupItem value="general">
            Общее
          </ToggleGroupItem>
          <ToggleGroupItem value="promo">
            Промокоды
          </ToggleGroupItem>
          <ToggleGroupItem value="calc">
            Калькулятор
          </ToggleGroupItem>
          <ToggleGroupItem value="geo">
            География
          </ToggleGroupItem>
        </ToggleGroup>
      </SectionCard>

      {activeTab === "general" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Заявки / Подтверждения / Выручка" description="По дням (UTC).">
            <TimeSeriesChart data={dailySeries} />
          </SectionCard>
          <SectionCard title="Конверсия / Средний чек" description="По дням (UTC).">
            <ConversionAovChart data={conversionAovSeries} />
          </SectionCard>
          <SectionCard
            title="Топ товаров по просмотрам"
            description={`Просмотры карточек товаров за период: ${productViewsAgg.viewsTotal.toLocaleString("ru-RU")}`}
            className="xl:col-span-2"
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <ToneBadge tone="outline">Заходы на сайт: {siteVisits.toLocaleString("ru-RU")}</ToneBadge>
                <ToneBadge tone="outline">Товаров в рейтинге: {topViewedProducts.length.toLocaleString("ru-RU")}</ToneBadge>
              </div>
              {topViewedProductsBar.length ? (
                <BarTopChart data={topViewedProductsBar} valueLabel="просм." />
              ) : (
                <EmptyState title="Нет просмотров товаров" description="Карточки товаров за выбранный период еще не открывали." />
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "promo" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="По дням" description={`Использования и сумма скидок (${promoDailyCurrency || "—"}), UTC.`}>
            <div className="grid gap-4">
              {promoDailyCurrencies.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {promoDailyCurrencies.map((currency) => (
                    <Button
                      key={currency}
                      type="button"
                      size="sm"
                      variant={promoDailyCurrency === currency ? "default" : "outline"}
                      onClick={() => setPromoDailyCurrency(currency)}
                    >
                      {currency}
                    </Button>
                  ))}
                </div>
              ) : null}
              {promoDailySeries.length ? (
                <PromoDailyChart data={promoDailySeries} discountCurrency={promoDailyCurrency} />
              ) : (
                <EmptyState title="Нет использований промокодов" description="За выбранный период записи не найдены." />
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Топ по использованиям"
            description={`Всего использований: ${promoTotals.uses.toLocaleString("ru-RU")}`}
          >
            {promoTopUses.length ? <BarTopChart data={promoTopUses} valueLabel="исп." /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Топ по сумме скидок" description="Сводка по валютам и лидерам каждой валютной группы." className="xl:col-span-2">
            <div className="grid gap-4">
              {promoCurrencies.length ? (
                <div className="flex flex-wrap gap-2">
                  {promoCurrencies.map((currency) => (
                    <ToneBadge key={currency} tone="outline">
                      {currency}: {promoTotals.discountByCurrency[currency]?.toLocaleString("ru-RU") ?? 0}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <EmptyState title="Нет данных по скидкам" />
              )}

              {promoCurrencies.map((currency) => (
                <div key={currency} className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="text-base font-semibold">{currency}</div>
                  {promoTopDiscountByCurrency[currency]?.length ? (
                    <BarTopChart data={promoTopDiscountByCurrency[currency]} valueLabel={currency} />
                  ) : (
                    <div className="text-sm text-muted-foreground">Нет скидок в валюте {currency}.</div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "geo" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
          <SectionCard title="Каневской район" description="Карта заказов по адресу из `quotes.address`.">
            {!rangeMs ? (
              <EmptyState title="Неверный период" description="Укажите даты в формате YYYY-MM-DD." />
            ) : geoLoading ? (
              <EmptyState title="Загрузка..." />
            ) : geoError ? (
              <PageAlert title="Ошибка гео-аналитики" description={geoError} />
            ) : geoData ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  <ToneBadge tone="outline">Всего: {geoData.totalQuotes.toLocaleString("ru-RU")}</ToneBadge>
                  <ToneBadge tone="success">Распознано: {geoData.matchedQuotes.toLocaleString("ru-RU")}</ToneBadge>
                  <ToneBadge tone="muted">Не распознано: {geoData.unknownQuotes.toLocaleString("ru-RU")}</ToneBadge>
                </div>
                <DotDensityMap
                  bbox={kanevskyDistrictBbox}
                  ring={kanevskyDistrictRing}
                  points={geoData.points}
                  places={geoData.places}
                  showTooltip
                  minHeight={320}
                />
                <div className="text-sm text-muted-foreground">
                  Локация определяется по совпадению населённого пункта в поле `address`; внешние геосервисы не используются.
                </div>
              </div>
            ) : (
              <EmptyState title="Нет данных за период" />
            )}
          </SectionCard>

          <SectionCard title="Топ населённых пунктов" description="Рейтинг по числу распознанных заявок.">
            {geoData?.topPlaces?.length ? <BarTopChart data={geoData.topPlaces} valueLabel="заяв." /> : <EmptyState title="Нет данных" />}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "calc" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Тип изделия"
            description={
              calcSource === "analytics_daily" && dailyTotals.leads
                ? `Всего: ${calcTotal.toLocaleString("ru-RU")} (${Math.min(100, calcCoveragePct).toFixed(0)}%)`
                : `Всего: ${calcTotal.toLocaleString("ru-RU")}`
            }
          >
            {calcProductTypePie.length ? <PieBreakdownChart data={calcProductTypePie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Топ опций">
            {calcOptionsPie.length ? <PieBreakdownChart data={calcOptionsPie} /> : <EmptyState title="Нет опций за период" />}
          </SectionCard>

          <SectionCard title="Профиль">
            {calcProfileModelPie.length ? <PieBreakdownChart data={calcProfileModelPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Серии профиля">
            {calcProfileSeriesPie.length ? <PieBreakdownChart data={calcProfileSeriesPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Стеклопакет">
            {calcGlazingPie.length ? <PieBreakdownChart data={calcGlazingPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Опции стеклопакета">
            {calcGlassOptionsPie.length ? <PieBreakdownChart data={calcGlassOptionsPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Дизайн ламинации">
            {calcDesignOptionPie.length ? <PieBreakdownChart data={calcDesignOptionPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Сервисы" description={avgDeliveryKm ? `Средняя доставка: ~${avgDeliveryKm.toFixed(1)} км` : undefined}>
            {servicesPie.length ? <PieBreakdownChart data={servicesPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>

          <SectionCard title="Тип двери">
            {calcDoorSubtypePie.length ? <PieBreakdownChart data={calcDoorSubtypePie} /> : <EmptyState title="Нет данных по дверям" />}
          </SectionCard>

          <SectionCard title="Цвет ламинации">
            {calcLaminationColorPie.length ? <PieBreakdownChart data={calcLaminationColorPie} /> : <EmptyState title="Нет данных" />}
          </SectionCard>
        </div>
      ) : null}
    </AdminShell>
  );
}
