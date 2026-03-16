"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { STATUSES, STATUS_LABELS, type QuoteStatus } from "../../lib/quoteStatus";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";

type Quote = {
  id: string;
  uid: string;
  status: string;
  totalPrice?: number;
  currency?: string;
  preferredMeasurementDate?: string | null;
  createdAt?: unknown;
  adminViewedAt?: unknown;
  adminViewedBy?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
};

type QuoteFilterStatus = "ALL" | QuoteStatus;
type QuoteFilterViewed = "ALL" | "UNSEEN";

type QuoteFilters = {
  q: string;
  status: QuoteFilterStatus;
  viewed: QuoteFilterViewed;
  createdFrom: string;
  createdTo: string;
};

const QUOTE_FILTERS_STORAGE_KEY = "admin:quotes:filters:v1";
const DEFAULT_QUOTE_FILTERS: QuoteFilters = { q: "", status: "ALL", viewed: "ALL", createdFrom: "", createdTo: "" };
const QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS = Date.parse("2026-02-27T00:00:00Z");

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function parseYyyyMmDd(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

function startOfLocalDayMs(value: string): number | null {
  const parsed = parseYyyyMmDd(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day).getTime();
}

function endExclusiveLocalDayMs(value: string): number | null {
  const parsed = parseYyyyMmDd(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day + 1).getTime();
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object") {
    const maybe = value as { toMillis?: unknown; seconds?: unknown };
    if (typeof maybe.toMillis === "function") {
      try {
        const ms = (maybe.toMillis as () => unknown)();
        return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }
    if (typeof maybe.seconds === "number" && Number.isFinite(maybe.seconds)) {
      return maybe.seconds * 1000;
    }
  }
  return null;
}

function formatDateOnly(value: unknown): string {
  const ms = toMillis(value);
  if (ms === null) return "-";
  return new Date(ms).toLocaleDateString("ru-RU");
}

function normalizePhoneDigits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

function coerceQuoteFilters(raw: unknown): QuoteFilters {
  if (!isPlainObject(raw)) return DEFAULT_QUOTE_FILTERS;
  const q = typeof raw.q === "string" ? raw.q : "";

  let status: QuoteFilterStatus = "ALL";
  if (raw.status === "ALL") status = "ALL";
  else if (isQuoteStatus(raw.status)) status = raw.status;
  const viewed: QuoteFilterViewed = raw.viewed === "UNSEEN" ? "UNSEEN" : "ALL";

  const createdFrom = typeof raw.createdFrom === "string" && parseYyyyMmDd(raw.createdFrom) ? raw.createdFrom : "";
  const createdTo = typeof raw.createdTo === "string" && parseYyyyMmDd(raw.createdTo) ? raw.createdTo : "";

  return { q, status, viewed, createdFrom, createdTo };
}

function formatCurrency(amount: number, currency?: string): string {
  const code = (currency || "").trim().toUpperCase() || "RUB";
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString(code === "RUB" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });
  if (code === "RUB") return `${formatted} ₽`;
  if (code === "USD") return `$${formatted}`;
  return `${formatted} ${code}`;
}

function isQuoteUnseen(quote: Pick<Quote, "createdAt" | "adminViewedAt">): boolean {
  if (toMillis(quote.adminViewedAt) !== null) return false;
  const createdMs = toMillis(quote.createdAt);
  if (createdMs === null) return false;
  return createdMs >= QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS;
}

export default function QuotesPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QuotesInner />
    </Suspense>
  );
}

function QuotesInner(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const [quoteFilters, setQuoteFilters] = useState<QuoteFilters>(DEFAULT_QUOTE_FILTERS);
  const [quoteFiltersHydrated, setQuoteFiltersHydrated] = useState(false);

  const urlQ = useMemo(() => {
    const raw = searchParams.get("q");
    return typeof raw === "string" ? raw.trim() : "";
  }, [searchParams]);

  const urlStatus = useMemo<QuoteStatus | null>(() => {
    const raw = searchParams.get("status");
    const normalized = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    return normalized && isQuoteStatus(normalized) ? (normalized as QuoteStatus) : null;
  }, [searchParams]);

  const loadQuotes = useCallback(async () => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const snap = await getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc")));
      setQuotes(snap.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<Quote, "id">) })));
    } catch (error) {
      console.error("Admin loadQuotes failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (urlQ || urlStatus) {
      setQuoteFilters({
        ...DEFAULT_QUOTE_FILTERS,
        q: urlQ,
        status: urlStatus ?? "ALL",
      });
      setQuoteFiltersHydrated(true);
      return;
    }

    if (quoteFiltersHydrated) return;

    try {
      const raw = localStorage.getItem(QUOTE_FILTERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      setQuoteFilters(coerceQuoteFilters(parsed));
    } catch {
      // Ignore.
    } finally {
      setQuoteFiltersHydrated(true);
    }
  }, [quoteFiltersHydrated, urlQ, urlStatus]);

  useEffect(() => {
    if (!quoteFiltersHydrated) return;
    try {
      localStorage.setItem(QUOTE_FILTERS_STORAGE_KEY, JSON.stringify(quoteFilters));
    } catch {
      // Ignore.
    }
  }, [quoteFilters, quoteFiltersHydrated]);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadQuotes();
  }, [loadQuotes, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadQuotes();
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
  }, [loadQuotes, loadingData, session.status]);

  const filteredQuotes = useMemo(() => {
    const q = quoteFilters.q.trim().toLowerCase();
    const qDigits = q ? normalizePhoneDigits(q) : "";
    const status = quoteFilters.status;
    const viewed = quoteFilters.viewed;
    const fromMs = quoteFilters.createdFrom ? startOfLocalDayMs(quoteFilters.createdFrom) : null;
    const toExclusiveMs = quoteFilters.createdTo ? endExclusiveLocalDayMs(quoteFilters.createdTo) : null;

    return quotes.filter((quote) => {
      if (status !== "ALL" && quote.status !== status) return false;
      if (viewed === "UNSEEN" && !isQuoteUnseen(quote)) return false;

      if (q) {
        const haystack = [
          quote.id,
          quote.uid,
          quote.contact?.name,
          quote.contact?.phone,
          quote.contact?.email,
        ]
          .filter((value) => typeof value === "string" && value.trim())
          .join(" ")
          .toLowerCase();

        const matchesText = haystack.includes(q);
        const matchesPhone = qDigits ? normalizePhoneDigits(quote.contact?.phone || "").includes(qDigits) : false;
        if (!matchesText && !matchesPhone) return false;
      }

      if (fromMs !== null || toExclusiveMs !== null) {
        const ms = toMillis(quote.createdAt);
        if (ms === null) return false;
        if (fromMs !== null && ms < fromMs) return false;
        if (toExclusiveMs !== null && ms >= toExclusiveMs) return false;
      }

      return true;
    });
  }, [quoteFilters, quotes]);

  const unseenCount = useMemo(() => {
    return quotes.reduce((acc, quote) => acc + (isQuoteUnseen(quote) ? 1 : 0), 0);
  }, [quotes]);

  const hasQuoteFilters = useMemo(() => {
    if (quoteFilters.status !== "ALL") return true;
    if (quoteFilters.viewed !== "ALL") return true;
    if (quoteFilters.createdFrom) return true;
    if (quoteFilters.createdTo) return true;
    return Boolean(quoteFilters.q.trim());
  }, [quoteFilters]);

  const resetQuoteFilters = () => {
    setQuoteFilters(DEFAULT_QUOTE_FILTERS);
  };

  const openQuoteDetails = (quoteId: string) => {
    router.push(`/quote?quoteId=${encodeURIComponent(quoteId)}`);
  };

  const onStatusChange = async (quoteId: string, status: string) => {
    if (!db) return;
    await updateDoc(doc(db, "quotes", quoteId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await loadQuotes();
  };

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Заявки" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Заявки"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <button className="secondary" onClick={() => void loadQuotes()} disabled={loadingData}>
            Обновить
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >

      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка загрузки данных</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Список</h2>
            <small>
              {filteredQuotes.length} из {quotes.length} • Непросмотренных: {unseenCount}
            </small>
          </div>
        </div>

        <div className="filtersPanel" style={{ marginTop: 12 }}>
          <div className="filtersGrid">
            <label className="field">
              <span className="fieldLabel">Поиск</span>
              <input
                value={quoteFilters.q}
                onChange={(e) => setQuoteFilters((prev) => ({ ...prev, q: e.target.value }))}
                placeholder="ID, UID, телефон, email"
              />
            </label>

            <label className="field">
              <span className="fieldLabel">Статус</span>
              <select
                value={quoteFilters.status}
                onChange={(e) => {
                  const next = e.target.value;
                  const nextStatus: QuoteFilterStatus = next === "ALL" ? "ALL" : isQuoteStatus(next) ? next : "ALL";
                  setQuoteFilters((prev) => ({ ...prev, status: nextStatus }));
                }}
              >
                <option value="ALL">Все</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="fieldLabel">Просмотр</span>
              <select
                value={quoteFilters.viewed}
                onChange={(e) => {
                  const nextViewed: QuoteFilterViewed = e.target.value === "UNSEEN" ? "UNSEEN" : "ALL";
                  setQuoteFilters((prev) => ({ ...prev, viewed: nextViewed }));
                }}
              >
                <option value="ALL">Все</option>
                <option value="UNSEEN">Только непросмотренные</option>
              </select>
            </label>

            <label className="field">
              <span className="fieldLabel">Создано (с)</span>
              <input
                type="date"
                value={quoteFilters.createdFrom}
                onChange={(e) => setQuoteFilters((prev) => ({ ...prev, createdFrom: e.target.value }))}
              />
            </label>

            <label className="field">
              <span className="fieldLabel">Создано (по)</span>
              <input
                type="date"
                value={quoteFilters.createdTo}
                onChange={(e) => setQuoteFilters((prev) => ({ ...prev, createdTo: e.target.value }))}
              />
            </label>
          </div>

          <div className="filtersFooter">
            <small>
              Показано {filteredQuotes.length} из {quotes.length} • Непросмотренных: {unseenCount}
            </small>
            <div className="rowActions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="secondary small" onClick={resetQuoteFilters} disabled={!hasQuoteFilters}>
                Сбросить
              </button>
            </div>
          </div>
        </div>

        <div className="mobileOnly" style={{ marginTop: 12 }}>
          {!quotes.length ? (
            <small>Пока нет заявок.</small>
          ) : !filteredQuotes.length ? (
            <small>Нет заявок по фильтрам.</small>
          ) : (
            <div className="cardList">
              {filteredQuotes.map((quote) => {
                const created = formatDateOnly(quote.createdAt);
                const unseen = isQuoteUnseen(quote);

                return (
                  <div key={quote.id} className={`itemCard${unseen ? " itemCard-unseen" : ""}`}>
                    <div className="itemHeader">
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b>Заявка</b>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <small className="breakLong">{quote.id}</small>
                          {unseen ? <span className="badge badge-new">Новая</span> : null}
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 2, justifyItems: "end" }}>
                        <div style={{ fontWeight: 800 }}>{formatCurrency(quote.totalPrice ?? 0, quote.currency)}</div>
                        <small>{created}</small>
                      </div>
                    </div>

                    <div className="kv">
                      <div className="kvRow">
                        <div className="kvLabel">Пользователь</div>
                        <div className="kvValue breakLong">{quote.uid}</div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Статус</div>
                        <div style={{ minWidth: 0 }}>
                          <select value={quote.status} onChange={(e) => void onStatusChange(quote.id, e.target.value)}>
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status] ?? status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Дата замера</div>
                        <div className="kvValue">{quote.preferredMeasurementDate ?? "-"}</div>
                      </div>
                    </div>

                    <div className="rowActions" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="secondary small" onClick={() => openQuoteDetails(quote.id)}>
                        Подробнее
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="desktopOnly" style={{ marginTop: 12 }}>
          {!quotes.length ? (
            <small>Пока нет заявок.</small>
          ) : !filteredQuotes.length ? (
            <small>Нет заявок по фильтрам.</small>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Пользователь</th>
                    <th className="quoteStatusCol">Статус</th>
                    <th>Сумма</th>
                    <th>Дата замера</th>
                    <th>Создано</th>
                    <th className="actionsCol">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => {
                    const unseen = isQuoteUnseen(quote);

                    return (
                      <tr key={quote.id} className={unseen ? "quoteRowUnseen" : undefined}>
                        <td>
                          <div style={{ display: "grid", gap: 6 }}>
                            <div className="breakLong">{quote.id}</div>
                            {unseen ? <span className="badge badge-new">Новая</span> : null}
                          </div>
                        </td>
                        <td className="breakLong">{quote.uid}</td>
                        <td className="quoteStatusCol">
                          <select
                            className="quoteStatusSelect"
                            value={quote.status}
                            onChange={(e) => void onStatusChange(quote.id, e.target.value)}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status] ?? status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{formatCurrency(quote.totalPrice ?? 0, quote.currency)}</td>
                        <td>{quote.preferredMeasurementDate ?? "-"}</td>
                        <td>{formatDateOnly(quote.createdAt)}</td>
                        <td>
                          <button type="button" className="secondary small" onClick={() => openQuoteDetails(quote.id)}>
                            Подробнее
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
