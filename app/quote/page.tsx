"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Settings2, ShieldCheck, TrendingUp, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { DetailRows, EmptyState, PageAlert, SectionCard, ToneBadge } from "../../components/admin-kit";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import type { CalcBreakdown, CalcLineItem, CalcResultDTO } from "window-door-store-calc-engine";

type QuoteDoc = {
  uid?: string;
  status?: string;
  totalPrice?: number;
  currency?: string;
  preferredMeasurementDate?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  adminViewedAt?: unknown;
  adminViewedBy?: string;
  source?: string;
  promoCode?: string | null;
  address?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  calcInput?: unknown;
  calcResult?: {
    subtotal?: number;
    discount?: number;
    total?: number;
    currency?: string;
    breakdown?: CalcBreakdown;
    calcDto?: CalcResultDTO;
  };
};

type UserProfile = {
  email?: string;
  displayName?: string;
  phone?: string;
  locale?: string;
};

type CalcInput = {
  width?: number;
  height?: number;
  quantity?: number;
  productType?: string;
  options?: string[];
  windowSillWidthCm?: number;
  dripEdgeWidthCm?: number;
  decorBarsColor?: string;

  profileModel?: string;
  profileSeries?: string;
  profileDepthMm?: number;
  glazing?: string;
  glassOptions?: {
    energySaving?: boolean;
    multiFunctional?: boolean;
  };
  lamination?: string;
  laminationGroup?: string;
  laminationSide?: string;
  laminationColor?: string;

  sashCount?: number;
  openingSashes?: number;
  openingType?: string;
  sashes?: Array<{
    widthCm?: number;
    opening?: string;
    handleSide?: string;
  }>;

  doorSubtype?: string;
  doorHandleSide?: string;
  entranceOptions?: {
    fillType?: string;
    fillTop?: string;
    fillBottom?: string;
  };

  hardwareKey?: string;
  hardwareLabel?: string;

  services?: {
    installEnabled?: boolean;
    deliveryEnabled?: boolean;
    deliveryKm?: number;
  };
};

const STATUSES = ["NEW", "IN_REVIEW", "OFFER_SENT", "CONFIRMED", "CANCELLED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Новая",
  IN_REVIEW: "В работе",
  OFFER_SENT: "КП отправлено",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  window: "Окно",
  door: "Дверь",
};

const DOOR_SUBTYPE_LABELS: Record<string, string> = {
  balcony: "Балконная",
  entrance: "Входная",
  interior: "Межкомнатная",
};

const PROFILE_SERIES_LABELS: Record<string, string> = {
  bautex: "Bautex",
  kbe: "KBE",
  rehau: "Rehau",
  kommerling: "Kommerling",
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
};

const GLAZING_LABELS: Record<string, string> = {
  single: "Однокамерный",
  double: "Двухкамерный",
};

const GLASS_OPTION_LABELS: Record<string, string> = {
  energy_saving: "Энергосберегающий стеклопакет",
  multi_functional: "Мультифункциональный стеклопакет",
};

const OPENING_TYPE_LABELS: Record<string, string> = {
  turn: "Поворотное",
  tiltturn: "Поворотно-откидное",
};

const SASH_OPENING_LABELS: Record<string, string> = {
  fixed: "Глухая",
  turn: "Поворотная",
  tiltturn: "Повор.-откидная",
};

const HANDLE_SIDE_LABELS: Record<string, string> = {
  left: "ручка слева",
  right: "ручка справа",
};

const LAMINATION_LABELS: Record<string, string> = {
  none: "Без ламинации",
  oneSide: "Ламинация (1 сторона)",
  twoSide: "Ламинация (2 стороны)",
};

const LAMINATION_GROUP_LABELS: Record<string, string> = {
  white: "Белая",
  wood: "Под дерево",
  color: "Цветная",
};

const DESIGN_OPTION_LABELS: Record<string, string> = {
  none: "Нет",
  outside: "Наружная",
  inside: "Внутренняя",
  twoSideWhite: "Двусторонняя на белой основе",
  twoSideColor: "Двусторонняя на цветной основе",
  twoSideWood: "Двусторонняя (под дерево)",
};

const BREAKDOWN_GROUP_LABELS: Record<string, string> = {
  product: "Изделие",
  profile: "Профиль",
  glazing: "Стеклопакет",
  design: "Дизайн",
  door: "Дверь",
  construction: "Конструкция",
  hardware: "Фурнитура",
  options: "Комплектующие",
  services: "Услуги",
  discount: "Скидка",
  adjustments: "Корректировки",
};

const LAMINATION_COLOR_LABELS: Record<string, string> = {
  gold_oak: "Золотой дуб",
  grey_oak: "Серый дуб",
  dark_oak: "Тёмный дуб",
  other: "Другой цвет",
};

const ENTRANCE_FILL_LABELS: Record<string, string> = {
  glass: "Стекло",
  sandwich: "Сэндвич",
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
};

const DECOR_BARS_COLOR_LABELS: Record<string, string> = {
  white: "Белая",
  gold: "Золотая",
  brown: "Коричневая",
};
const QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS = Date.parse("2026-02-27T00:00:00Z");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function toMillis(input: unknown): number | null {
  if (!input) return null;

  if (typeof input === "string") {
    const parsed = Date.parse(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof input === "object") {
    const ts = input as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof ts.toMillis === "function") {
      const ms = ts.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof ts.toDate === "function") {
      const date = ts.toDate();
      const ms = date?.getTime?.();
      return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
    }
    if (typeof ts.seconds === "number") {
      return ts.seconds * 1000;
    }
  }

  return null;
}

function formatIsoDate(iso?: string | null): string {
  if (!iso) return "-";
  const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatDateTime(value: unknown): string {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("ru-RU");
}

function formatCurrency(amount: number, currency?: string): string {
  const code = (currency || "").trim().toUpperCase() || "RUB";
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString(code === "RUB" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });
  if (code === "RUB") return `${formatted} ₽`;
  if (code === "USD") return `$${formatted}`;
  return `${formatted} ${code}`;
}

function isQuoteUnseenByAdmin(quote: Pick<QuoteDoc, "createdAt" | "adminViewedAt"> | null | undefined): boolean {
  if (!quote) return false;
  if (toMillis(quote.adminViewedAt) !== null) return false;
  const createdMs = toMillis(quote.createdAt);
  if (createdMs === null) return false;
  return createdMs >= QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS;
}

function boolLabel(value: unknown): string {
  return value === true ? "Да" : "Нет";
}

function optionLabel(
  value: string,
  meta?: { windowSillWidthCm?: number; dripEdgeWidthCm?: number; decorBarsColor?: string }
): string {
  const key = value.trim().toLowerCase();
  const base = OPTION_LABELS[key] ?? value;
  const windowSillWidth =
    typeof meta?.windowSillWidthCm === "number" && Number.isFinite(meta.windowSillWidthCm) ? Math.round(meta.windowSillWidthCm) : null;
  const dripEdgeWidth =
    typeof meta?.dripEdgeWidthCm === "number" && Number.isFinite(meta.dripEdgeWidthCm) ? Math.round(meta.dripEdgeWidthCm) : null;
  const decorBarsColorRaw = typeof meta?.decorBarsColor === "string" ? meta.decorBarsColor.trim().toLowerCase() : "";
  const decorBarsColorLabel = DECOR_BARS_COLOR_LABELS[decorBarsColorRaw] ?? "";

  if (key === "window_sill" && windowSillWidth) return `${base} (${windowSillWidth} см)`;
  if (key === "drip_edge" && dripEdgeWidth) return `${base} (${dripEdgeWidth} см)`;
  if (key === "decor_bars" && decorBarsColorLabel) return `${base} (${decorBarsColorLabel})`;
  return base;
}

function breakdownItemLabel(item: CalcLineItem): string {
  const [prefix, rawValue = ""] = item.key.split(":");

  if (prefix === "base_product") {
    if (rawValue === "window") return "База: окно";
    if (rawValue === "balcony_door") return "База: балконная дверь";
    if (rawValue === "entrance_door") return "База: входная дверь";
    if (rawValue === "interior_door") return "База: межкомнатная дверь";
  }

  if (prefix === "material") return `Материал: ${rawValue.toUpperCase()}`;
  if (prefix === "profile_model") return `Модель профиля: ${PROFILE_MODEL_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "profile_series") return `Серия профиля: ${PROFILE_SERIES_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "profile_depth") return `Глубина профиля: ${rawValue} мм`;
  if (prefix === "glazing") return `Стеклопакет: ${GLAZING_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "glass_option") return GLASS_OPTION_LABELS[rawValue] ?? rawValue;
  if (prefix === "lamination") return `Ламинация: ${LAMINATION_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "lamination_group") return `Группа ламинации: ${LAMINATION_GROUP_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "lamination_side") return `Сторона ламинации: ${rawValue === "inside" ? "Внутренняя" : "Наружная"}`;
  if (prefix === "lamination_color") return `Цвет ламинации: ${LAMINATION_COLOR_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "door_fill_top") return `Верх двери: ${ENTRANCE_FILL_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "door_fill_bottom") return `Низ двери: ${ENTRANCE_FILL_LABELS[rawValue] ?? rawValue}`;
  if (prefix === "opening_sashes") return `Открывание: ${OPENING_TYPE_LABELS[normalizeCode(rawValue)] ?? rawValue}`;
  if (prefix === "hardware") return item.title?.trim() ? `Фурнитура: ${item.title.trim()}` : "Фурнитура";
  if (prefix === "option") return optionLabel(rawValue);

  if (item.key === "meeting_pair_kit") return "Встречная пара без импоста";
  if (item.key === "mullion") return "Импост";
  if (item.key === "install_area") return "Монтаж по площади";
  if (item.key === "install_sashes") return "Монтаж створок";
  if (item.key === "delivery_base") return "Базовая доставка";
  if (item.key === "delivery_distance") return "Доставка за километраж";
  if (item.key === "rounding") return "Округление";
  if (item.key === "promo_discount") return "Скидка по промокоду";

  return item.title?.trim() || item.key;
}

function breakdownGroupLabel(key: string): string {
  return BREAKDOWN_GROUP_LABELS[key] ?? key;
}

function labelOrFallback(map: Record<string, string>, value: unknown): string {
  const key = normalizeCode(value);
  if (!key) return "-";
  return map[key] ?? String(value);
}

export default function QuoteDetailsPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QuoteDetailsInner />
    </Suspense>
  );
}

function QuoteDetailsInner(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const quoteId = useMemo(() => {
    const raw = searchParams.get("quoteId");
    return raw ? raw.trim() : "";
  }, [searchParams]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const markViewedRequestSentRef = useRef(false);

  const load = useCallback(async () => {
    if (!db) return;
    if (!quoteId) {
      setQuote(null);
      setUserProfile(null);
      setLoadError("Не указан quoteId. Откройте заявку из списка и нажмите «Подробнее».");
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const quoteSnap = await getDoc(doc(db, "quotes", quoteId));
      if (!quoteSnap.exists()) {
        setQuote(null);
        setUserProfile(null);
        setLoadError("Заявка не найдена.");
        return;
      }

      const data = (quoteSnap.data() as QuoteDoc) ?? {};
      setQuote(data);

      const uid = data.uid;
      if (uid) {
        try {
          const userSnap = await getDoc(doc(db, "users", uid));
          const userData = (userSnap.data() as UserProfile) ?? null;
          setUserProfile(userData);
        } catch (error) {
          console.warn("Failed to load user profile:", error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      console.error("Quote load failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
      setQuote(null);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    if (session.status !== "ready") return;
    void load();
  }, [load, session.status]);

  useEffect(() => {
    markViewedRequestSentRef.current = false;
  }, [quoteId]);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (!db || !quoteId || !quote) return;
    if (!session.user?.uid) return;
    if (!isQuoteUnseenByAdmin(quote)) return;
    if (markViewedRequestSentRef.current) return;
    const viewerUid = session.user.uid;

    markViewedRequestSentRef.current = true;
    void (async () => {
      try {
        await updateDoc(doc(db, "quotes", quoteId), {
          adminViewedAt: serverTimestamp(),
          adminViewedBy: viewerUid,
        });
        setQuote((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            adminViewedAt: new Date(),
            adminViewedBy: viewerUid,
          };
        });
      } catch (error) {
        markViewedRequestSentRef.current = false;
        console.error("Quote markAsViewed failed:", error);
      }
    })();
  }, [quote, quoteId, session.status, session.user?.uid]);

  const onStatusChange = async (nextStatus: string) => {
    if (!db || !quoteId) return;
    setSavingStatus(true);
    try {
      await updateDoc(doc(db, "quotes", quoteId), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (error) {
      console.error("Quote status update failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingStatus(false);
    }
  };

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Заявка" subtitle="Войдите, чтобы открыть детали" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const calcInput: CalcInput | null = isRecord(quote?.calcInput) ? (quote?.calcInput as CalcInput) : null;
  const options = Array.isArray(calcInput?.options) ? calcInput?.options.filter((item) => typeof item === "string") : [];
  const currency = (quote?.currency || quote?.calcResult?.currency || "RUB").trim().toUpperCase() || "RUB";

  const widthCm = typeof calcInput?.width === "number" && Number.isFinite(calcInput.width) ? calcInput.width * 100 : null;
  const heightCm = typeof calcInput?.height === "number" && Number.isFinite(calcInput.height) ? calcInput.height * 100 : null;

  const sashesFromDto =
    calcInput?.productType === "window" && quote?.calcResult?.calcDto
      ? quote.calcResult.calcDto.sections
          .map((sec) => {
            const secW = typeof sec?.secW_mm === "number" && Number.isFinite(sec.secW_mm) ? sec.secW_mm : null;
            if (!secW || secW <= 0) return null;

            const widthCmValue = Math.max(1, Math.round(secW / 10));
            const openKey = normalizeCode(sec.kind === "sash" ? sec.openType : "fixed");
            const opening: "fixed" | "turn" | "tiltturn" = sec.kind === "sash" ? (openKey === "turn" ? "turn" : "tiltturn") : "fixed";

            const handleSideKey = normalizeCode(sec.handleSide);
            const handleSide = handleSideKey === "left" || handleSideKey === "right" ? handleSideKey : null;

            return {
              widthCm: widthCmValue,
              opening,
              ...(opening !== "fixed" && handleSide ? { handleSide } : {}),
            };
          })
          .filter(
            (v): v is { widthCm: number; opening: "fixed" | "turn" | "tiltturn"; handleSide?: "left" | "right" } => Boolean(v)
          )
      : null;

  const sashesFromInput = Array.isArray(calcInput?.sashes)
    ? calcInput.sashes
        .map((item) => {
          if (!isRecord(item)) return null;
          const widthCmValue = typeof item.widthCm === "number" && Number.isFinite(item.widthCm) ? Math.round(item.widthCm) : null;
          const openingKey = normalizeCode(item.opening);
          const opening = openingKey === "turn" || openingKey === "tiltturn" ? openingKey : "fixed";
          const handleSideKey = normalizeCode(item.handleSide);
          const handleSide = handleSideKey === "left" || handleSideKey === "right" ? handleSideKey : null;
          if (!widthCmValue || widthCmValue <= 0) return null;
          return {
            widthCm: widthCmValue,
            opening,
            ...(opening !== "fixed" && handleSide ? { handleSide } : {}),
          };
        })
        .filter(
          (v): v is { widthCm: number; opening: "fixed" | "turn" | "tiltturn"; handleSide?: "left" | "right" } => Boolean(v)
        )
    : null;

  const sashes = sashesFromDto?.length ? sashesFromDto : sashesFromInput;

  const derivedSashCount =
    sashes?.length ?? (typeof calcInput?.sashCount === "number" ? Math.round(calcInput.sashCount) : null);

  const derivedOpeningSashes =
    sashes
      ? sashes.reduce((acc, s) => acc + (s.opening === "fixed" ? 0 : 1), 0)
      : typeof calcInput?.openingSashes === "number"
        ? Math.round(calcInput.openingSashes)
        : null;

  const doorHandleSideKey = normalizeCode(calcInput?.doorHandleSide);
  const doorHandleSide = doorHandleSideKey === "left" || doorHandleSideKey === "right" ? doorHandleSideKey : null;

  const derivedOpeningTypeLabel = (() => {
    if (!derivedOpeningSashes || derivedOpeningSashes <= 0) return "-";
    if (!sashes) return labelOrFallback(OPENING_TYPE_LABELS, calcInput?.openingType);
    const set = new Set(sashes.map((s) => s.opening).filter((o) => o !== "fixed"));
    if (set.size === 1) return labelOrFallback(OPENING_TYPE_LABELS, Array.from(set)[0]);
    return "Смешанное";
  })();

  const meetingPairKitCount =
    calcInput?.productType === "window" && quote?.calcResult?.calcDto
      ? quote.calcResult.calcDto.derived.meetingPairKitCount
      : null;

  const hardwareKeyRaw = typeof calcInput?.hardwareKey === "string" ? calcInput.hardwareKey.trim() : "";
  const hardwareKey = normalizeCode(hardwareKeyRaw);
  const hardwareLabel = typeof calcInput?.hardwareLabel === "string" ? calcInput.hardwareLabel.trim() : "";
  const hardwareValue = hardwareLabel || hardwareKeyRaw || "-";

  const optionsFiltered = hardwareKey ? options.filter((opt) => normalizeCode(opt) !== hardwareKey) : options;

  const contactName = quote?.contact?.name?.trim() || "-";
  const contactPhone = quote?.contact?.phone?.trim() || "-";
  const contactEmail = quote?.contact?.email?.trim() || "";

  return (
    <AdminShell
      title="Заявка"
      subtitle={quoteId || "-"}
      rightActions={
        <>
          <Button variant="outline" onClick={() => router.push("/quotes")}>
            Назад
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {loadError ? <PageAlert title="Ошибка" description={loadError} /> : null}

        {quote ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                eyebrow="Контакт клиента"
                title="Контакты"
                description="Первичные поля, которые оператор использует для связи и выезда на замер."
                icon={User}
                tone="sky"
              >
                <DetailRows
                  items={[
                    { label: "Имя", value: contactName },
                    {
                      label: "Телефон",
                      value:
                        contactPhone !== "-" ? (
                          <a href={`tel:${contactPhone}`} className="text-inherit no-underline">
                            {contactPhone}
                          </a>
                        ) : (
                          contactPhone
                        ),
                    },
                    ...(contactEmail ? [{ label: "Email", value: contactEmail }] : []),
                    ...(typeof quote.address === "string"
                      ? [{ label: "Адрес", value: quote.address.trim() ? quote.address.trim() : "-" }]
                      : []),
                    { label: "Дата замера", value: formatIsoDate(quote.preferredMeasurementDate) },
                    { label: "Промокод", value: quote.promoCode?.trim() ? quote.promoCode.trim() : "-" },
                  ]}
                />
              </SectionCard>

              <SectionCard
                eyebrow="Продажа"
                title="Статус и сумма"
                description="Статус заявки можно обновлять прямо на карточке."
                icon={TrendingUp}
                tone="sky"
              >
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="text-sm font-medium text-foreground">Статус</div>
                    <NativeSelect value={quote.status || "NEW"} onChange={(e) => void onStatusChange(e.target.value)} disabled={savingStatus}>
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status] ?? status}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <DetailRows
                    items={[
                      { label: "Сумма", value: formatCurrency(quote.totalPrice ?? quote.calcResult?.total ?? 0, currency) },
                      ...(typeof quote.calcResult?.subtotal === "number"
                        ? [{ label: "Подитог", value: formatCurrency(quote.calcResult.subtotal, currency) }]
                        : []),
                      ...(typeof quote.calcResult?.discount === "number"
                        ? [{ label: "Скидка", value: formatCurrency(quote.calcResult.discount, currency) }]
                        : []),
                      ...(typeof quote.calcResult?.total === "number"
                        ? [{ label: "Итого", value: formatCurrency(quote.calcResult.total, currency) }]
                        : []),
                    ]}
                  />
                </div>
              </SectionCard>

              {quote?.calcResult?.breakdown?.groups?.length ? (
                <SectionCard
                  eyebrow="Продажа"
                  title="Состав сметы"
                  description="Структура цены по этапам расчёта."
                  icon={ClipboardList}
                  tone="sky"
                >
                  <div className="grid gap-3">
                    {quote.calcResult.breakdown.groups.map((group) => (
                      <div key={group.key} className="grid gap-2 rounded-2xl border border-border/70 bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">{breakdownGroupLabel(group.key)}</div>
                          <div className="text-sm font-semibold text-foreground">{formatCurrency(group.total, currency)}</div>
                        </div>
                        <div className="grid gap-2">
                          {group.items.map((item) => (
                            <div key={`${group.key}:${item.key}:${item.title ?? ""}`} className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
                              <span>{breakdownItemLabel(item)}</span>
                              <span>{formatCurrency(item.total, currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
            </div>

            {calcInput ? (
              <SectionCard
                eyebrow="Данные калькулятора"
                title="Параметры изделия"
                description="Расчётные поля и derived-значения, которые пришли из калькулятора."
                icon={Settings2}
                tone="sky"
              >
                <div className="grid gap-4">
                  <DetailRows
                    columns={2}
                    items={[
                      { label: "Тип", value: labelOrFallback(PRODUCT_TYPE_LABELS, calcInput.productType) },
                      ...(normalizeCode(calcInput.productType) === "door"
                        ? [{ label: "Подтип двери", value: labelOrFallback(DOOR_SUBTYPE_LABELS, calcInput.doorSubtype) }]
                        : []),
                      ...(normalizeCode(calcInput.productType) === "door" && doorHandleSide && derivedOpeningSashes && derivedOpeningSashes > 0
                        ? [{ label: "Сторона ручки", value: HANDLE_SIDE_LABELS[doorHandleSide] ?? doorHandleSide }]
                        : []),
                      { label: "Размер", value: widthCm && heightCm ? `${Math.round(widthCm)}×${Math.round(heightCm)} см` : "-" },
                      { label: "Количество", value: typeof calcInput.quantity === "number" ? String(calcInput.quantity) : "-" },
                      { label: "Створок", value: derivedSashCount !== null ? String(derivedSashCount) : "-" },
                      { label: "Откр. створок", value: derivedOpeningSashes !== null ? String(derivedOpeningSashes) : "-" },
                      { label: "Тип открывания", value: derivedOpeningTypeLabel },
                      ...(typeof meetingPairKitCount === "number" && meetingPairKitCount > 0 ? [{ label: "Встречная пара", value: "Да" }] : []),
                      ...(hardwareKeyRaw || hardwareLabel ? [{ label: "Фурнитура", value: hardwareValue }] : []),
                      {
                        label: "Профиль",
                        value:
                          calcInput.profileModel || calcInput.profileSeries || calcInput.profileDepthMm ? (
                            <>
                              {calcInput.profileModel
                                ? labelOrFallback(PROFILE_MODEL_LABELS, calcInput.profileModel)
                                : labelOrFallback(PROFILE_SERIES_LABELS, calcInput.profileSeries)}{" "}
                              {!calcInput.profileModel && typeof calcInput.profileDepthMm === "number"
                                ? `${calcInput.profileDepthMm === 82 ? 85 : calcInput.profileDepthMm} мм`
                                : ""}
                            </>
                          ) : (
                            "-"
                          ),
                      },
                      { label: "Стеклопакет", value: labelOrFallback(GLAZING_LABELS, calcInput.glazing) },
                      { label: "Энергосбер.", value: boolLabel(calcInput.glassOptions?.energySaving) },
                      { label: "Мультиф.", value: boolLabel(calcInput.glassOptions?.multiFunctional) },
                      {
                        label: "Дизайн",
                        value: (() => {
                          const lamination = normalizeCode(calcInput.lamination);
                          if (!lamination || lamination === "none") return DESIGN_OPTION_LABELS.none;
                          if (lamination === "oneside") {
                            const side = normalizeCode(calcInput.laminationSide);
                            if (side === "inside") return DESIGN_OPTION_LABELS.inside;
                            return DESIGN_OPTION_LABELS.outside;
                          }
                          if (lamination === "twoside") {
                            const group = normalizeCode(calcInput.laminationGroup);
                            if (group === "color") return DESIGN_OPTION_LABELS.twoSideColor;
                            if (group === "wood") return DESIGN_OPTION_LABELS.twoSideWood;
                            return DESIGN_OPTION_LABELS.twoSideWhite;
                          }
                          return "-";
                        })(),
                      },
                      ...(calcInput.laminationColor
                        ? [
                            {
                              label: "Цвет",
                              value: LAMINATION_COLOR_LABELS[normalizeCode(calcInput.laminationColor)] ?? calcInput.laminationColor,
                            },
                          ]
                        : []),
                      ...(calcInput.entranceOptions
                        ? [
                            {
                              label: "Наполнение (верх)",
                              value: labelOrFallback(
                                ENTRANCE_FILL_LABELS,
                                calcInput.entranceOptions.fillTop ?? calcInput.entranceOptions.fillType
                              ),
                            },
                            {
                              label: "Наполнение (низ)",
                              value: labelOrFallback(
                                ENTRANCE_FILL_LABELS,
                                calcInput.entranceOptions.fillBottom ?? calcInput.entranceOptions.fillType
                              ),
                            },
                          ]
                        : []),
                      { label: "Монтаж", value: boolLabel(calcInput.services?.installEnabled) },
                      { label: "Доставка", value: boolLabel(calcInput.services?.deliveryEnabled) },
                      ...(calcInput.services?.deliveryEnabled
                        ? [
                            {
                              label: "Доставка, км",
                              value: typeof calcInput.services?.deliveryKm === "number" ? String(calcInput.services.deliveryKm) : "-",
                            },
                          ]
                        : []),
                    ]}
                  />

                  {sashes?.length ? (
                    <div className="grid gap-2">
                      <div className="text-sm font-medium text-foreground">Створки</div>
                      <div className="flex flex-wrap gap-2">
                        {sashes.map((sash, idx) => (
                          <Badge key={`sash-${idx}`} variant="outline">
                            {idx + 1}: {sash.widthCm} см · {SASH_OPENING_LABELS[sash.opening] ?? sash.opening}
                            {sash.opening !== "fixed" && sash.handleSide
                              ? ` · ${HANDLE_SIDE_LABELS[sash.handleSide] ?? sash.handleSide}`
                              : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <div className="text-sm font-medium text-foreground">Комплектующие</div>
                    {optionsFiltered.length ? (
                      <div className="flex flex-wrap gap-2">
                        {optionsFiltered.map((opt) => (
                          <Badge key={opt} variant="secondary">
                            {optionLabel(opt, calcInput)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">-</div>
                    )}
                  </div>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              eyebrow="Системные данные"
              title="Служебная информация"
              description="Технические поля профиля и метки времени для внутренней работы."
              icon={ShieldCheck}
              tone="sky"
            >
              <DetailRows
                columns={2}
                items={[
                  { label: "UID", value: quote.uid || "-" },
                  ...(userProfile?.displayName ? [{ label: "Профиль", value: userProfile.displayName }] : []),
                  ...(userProfile?.email ? [{ label: "Email", value: userProfile.email }] : []),
                  ...(userProfile?.phone ? [{ label: "Телефон", value: userProfile.phone }] : []),
                  ...(userProfile?.locale ? [{ label: "Locale", value: userProfile.locale }] : []),
                  { label: "Создано", value: formatDateTime(quote.createdAt) },
                  { label: "Обновлено", value: formatDateTime(quote.updatedAt) },
                ]}
              />
            </SectionCard>
          </>
        ) : (
          <EmptyState title="Заявка не найдена" description="Лид мог быть удалён, либо в адресной строке отсутствует корректный идентификатор." />
        )}
      </div>
    </AdminShell>
  );
}
