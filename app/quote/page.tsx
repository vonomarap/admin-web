"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import type { CalcResultDTO } from "window-door-store-calc-engine";

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
};

const GLAZING_LABELS: Record<string, string> = {
  single: "Однокамерный",
  double: "Двухкамерный",
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
          <button className="secondary" onClick={() => router.push("/quotes")}>
            Назад
          </button>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Загрузка..." : "Обновить"}
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >

      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      {quote ? (
        <section className="grid cols-2">
          <section className="card">
            <h2>Контакты</h2>
            <div className="kv" style={{ marginTop: 10 }}>
              <div className="kvRow">
                <div className="kvLabel">Имя</div>
                <div className="kvValue breakLong">{contactName}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">Телефон</div>
                <div className="kvValue breakLong">
                  {contactPhone !== "-" ? (
                    <a href={`tel:${contactPhone}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {contactPhone}
                    </a>
                  ) : (
                    contactPhone
                  )}
                </div>
              </div>
              {contactEmail ? (
                <div className="kvRow">
                  <div className="kvLabel">Email</div>
                  <div className="kvValue breakLong">{contactEmail}</div>
                </div>
              ) : null}
              {typeof quote.address === "string" ? (
                <div className="kvRow">
                  <div className="kvLabel">Адрес</div>
                  <div className="kvValue breakLong">{quote.address.trim() ? quote.address.trim() : "-"}</div>
                </div>
              ) : null}
              <div className="kvRow">
                <div className="kvLabel">Дата замера</div>
                <div className="kvValue">{formatIsoDate(quote.preferredMeasurementDate)}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">Промокод</div>
                <div className="kvValue">{quote.promoCode?.trim() ? quote.promoCode.trim() : "-"}</div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Статус и сумма</h2>
            <div className="kv" style={{ marginTop: 10 }}>
              <div className="kvRow">
                <div className="kvLabel">Статус</div>
                <div style={{ minWidth: 0 }}>
                  <select
                    value={quote.status || "NEW"}
                    onChange={(e) => void onStatusChange(e.target.value)}
                    disabled={savingStatus}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status] ?? status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">Сумма</div>
                <div className="kvValue">{formatCurrency(quote.totalPrice ?? quote.calcResult?.total ?? 0, currency)}</div>
              </div>
              {typeof quote.calcResult?.subtotal === "number" ? (
                <div className="kvRow">
                  <div className="kvLabel">Подитог</div>
                  <div className="kvValue">{formatCurrency(quote.calcResult.subtotal, currency)}</div>
                </div>
              ) : null}
              {typeof quote.calcResult?.discount === "number" ? (
                <div className="kvRow">
                  <div className="kvLabel">Скидка</div>
                  <div className="kvValue">{formatCurrency(quote.calcResult.discount, currency)}</div>
                </div>
              ) : null}
              {typeof quote.calcResult?.total === "number" ? (
                <div className="kvRow">
                  <div className="kvLabel">Итого</div>
                  <div className="kvValue">{formatCurrency(quote.calcResult.total, currency)}</div>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}

      {quote && calcInput ? (
        <section className="card">
          <h2>Параметры изделия (из калькулятора)</h2>
          <div className="kv" style={{ marginTop: 10 }}>
            <div className="kvRow">
              <div className="kvLabel">Тип</div>
              <div className="kvValue">{labelOrFallback(PRODUCT_TYPE_LABELS, calcInput.productType)}</div>
            </div>

            {normalizeCode(calcInput.productType) === "door" ? (
              <div className="kvRow">
                <div className="kvLabel">Подтип двери</div>
                <div className="kvValue">{labelOrFallback(DOOR_SUBTYPE_LABELS, calcInput.doorSubtype)}</div>
              </div>
            ) : null}

            {normalizeCode(calcInput.productType) === "door" && doorHandleSide && derivedOpeningSashes && derivedOpeningSashes > 0 ? (
              <div className="kvRow">
                <div className="kvLabel">Сторона ручки</div>
                <div className="kvValue">{HANDLE_SIDE_LABELS[doorHandleSide] ?? doorHandleSide}</div>
              </div>
            ) : null}

            <div className="kvRow">
              <div className="kvLabel">Размер</div>
              <div className="kvValue">{widthCm && heightCm ? `${Math.round(widthCm)}×${Math.round(heightCm)} см` : "-"}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Кол-во</div>
              <div className="kvValue">{typeof calcInput.quantity === "number" ? String(calcInput.quantity) : "-"}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Створок</div>
              <div className="kvValue">{derivedSashCount !== null ? String(derivedSashCount) : "-"}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Откр. створок</div>
              <div className="kvValue">{derivedOpeningSashes !== null ? String(derivedOpeningSashes) : "-"}</div>
            </div>

	            <div className="kvRow">
	              <div className="kvLabel">Тип открывания</div>
	              <div className="kvValue">{derivedOpeningTypeLabel}</div>
	            </div>

	            {typeof meetingPairKitCount === "number" && meetingPairKitCount > 0 ? (
	              <div className="kvRow">
	                <div className="kvLabel">Встречная пара</div>
	                <div className="kvValue">Да</div>
	              </div>
	            ) : null}

	            {hardwareKeyRaw || hardwareLabel ? (
	              <div className="kvRow">
	                <div className="kvLabel">Фурнитура</div>
	                <div className="kvValue">{hardwareValue}</div>
              </div>
            ) : null}

            {sashes?.length ? (
              <div className="kvRow">
                <div className="kvLabel">Створки</div>
                <div className="kvValue">
                  <div className="pillList">
                    {sashes.map((sash, idx) => (
                      <span key={`sash-${idx}`} className="pill">
                        {idx + 1}: {sash.widthCm} см · {SASH_OPENING_LABELS[sash.opening] ?? sash.opening}
                        {sash.opening !== "fixed" && sash.handleSide
                          ? ` · ${HANDLE_SIDE_LABELS[sash.handleSide] ?? sash.handleSide}`
                          : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="kvRow">
              <div className="kvLabel">Профиль</div>
              <div className="kvValue">
                {calcInput.profileSeries || calcInput.profileDepthMm ? (
                  <>
                    {labelOrFallback(PROFILE_SERIES_LABELS, calcInput.profileSeries)}{" "}
                    {typeof calcInput.profileDepthMm === "number"
                      ? `${calcInput.profileDepthMm === 82 ? 85 : calcInput.profileDepthMm} мм`
                      : ""}
                  </>
                ) : (
                  "-"
                )}
              </div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Стеклопакет</div>
              <div className="kvValue">{labelOrFallback(GLAZING_LABELS, calcInput.glazing)}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Энергосбер.</div>
              <div className="kvValue">{boolLabel(calcInput.glassOptions?.energySaving)}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Мультиф.</div>
              <div className="kvValue">{boolLabel(calcInput.glassOptions?.multiFunctional)}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Дизайн</div>
              <div className="kvValue">
                {(() => {
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
                })()}
              </div>
            </div>

            {calcInput.laminationColor ? (
              <div className="kvRow">
                <div className="kvLabel">Цвет</div>
                <div className="kvValue">
                  {LAMINATION_COLOR_LABELS[normalizeCode(calcInput.laminationColor)] ?? calcInput.laminationColor}
                </div>
              </div>
            ) : null}

            {calcInput.entranceOptions ? (
              <>
                <div className="kvRow">
                  <div className="kvLabel">Наполнение (верх)</div>
                  <div className="kvValue">
                    {labelOrFallback(ENTRANCE_FILL_LABELS, calcInput.entranceOptions.fillTop ?? calcInput.entranceOptions.fillType)}
                  </div>
                </div>
                <div className="kvRow">
                  <div className="kvLabel">Наполнение (низ)</div>
                  <div className="kvValue">
                    {labelOrFallback(ENTRANCE_FILL_LABELS, calcInput.entranceOptions.fillBottom ?? calcInput.entranceOptions.fillType)}
                  </div>
                </div>
              </>
            ) : null}

            <div className="kvRow">
              <div className="kvLabel">Монтаж</div>
              <div className="kvValue">{boolLabel(calcInput.services?.installEnabled)}</div>
            </div>

            <div className="kvRow">
              <div className="kvLabel">Доставка</div>
              <div className="kvValue">{boolLabel(calcInput.services?.deliveryEnabled)}</div>
            </div>

            {calcInput.services?.deliveryEnabled ? (
              <div className="kvRow">
                <div className="kvLabel">Доставка, км</div>
                <div className="kvValue">
                  {typeof calcInput.services?.deliveryKm === "number" ? String(calcInput.services.deliveryKm) : "-"}
                </div>
              </div>
            ) : null}

            <div className="kvRow">
              <div className="kvLabel">Комплектующие</div>
              <div className="kvValue">
                {optionsFiltered.length ? (
                  <div className="pillList">
                    {optionsFiltered.map((opt) => (
                      <span key={opt} className="pill">
                        {optionLabel(opt, calcInput)}
                      </span>
                    ))}
                  </div>
                ) : (
                  "-"
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {quote ? (
        <section className="card">
          <h2>Служебная информация</h2>
          <div className="kv" style={{ marginTop: 10 }}>
            <div className="kvRow">
              <div className="kvLabel">UID</div>
              <div className="kvValue breakLong">{quote.uid || "-"}</div>
            </div>
            {userProfile ? (
              <>
                {userProfile.displayName ? (
                  <div className="kvRow">
                    <div className="kvLabel">Профиль</div>
                    <div className="kvValue breakLong">{userProfile.displayName}</div>
                  </div>
                ) : null}
                {userProfile.email ? (
                  <div className="kvRow">
                    <div className="kvLabel">Email</div>
                    <div className="kvValue breakLong">{userProfile.email}</div>
                  </div>
                ) : null}
                {userProfile.phone ? (
                  <div className="kvRow">
                    <div className="kvLabel">Телефон</div>
                    <div className="kvValue breakLong">{userProfile.phone}</div>
                  </div>
                ) : null}
                {userProfile.locale ? (
                  <div className="kvRow">
                    <div className="kvLabel">Locale</div>
                    <div className="kvValue breakLong">{userProfile.locale}</div>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="kvRow">
              <div className="kvLabel">Создано</div>
              <div className="kvValue">{formatDateTime(quote.createdAt)}</div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Обновлено</div>
              <div className="kvValue">{formatDateTime(quote.updatedAt)}</div>
            </div>
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
