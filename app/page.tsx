"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { DAY_MS, dateKeyRange, presetRangeKeys, rangeKeysToUtcMs, toDateKeyUTC, toMillis } from "../lib/analytics";
import { matchKanevskyPlaceFromAddress } from "../lib/geo/addressToKanevskyPlace";
import { kanevskyDistrictBbox, kanevskyDistrictRing } from "../lib/geo/kanevskyDistrict";
import { kanevskyPlaces } from "../lib/geo/kanevskyPlaces";
import { STATUSES, STATUS_LABELS, normalizeStatus } from "../lib/quoteStatus";
import { useAdminSession } from "../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../components/AdminScreens";
import { AdminShell } from "../components/AdminShell";
import { TimeSeriesChart, type DailySeriesPoint } from "../components/charts/TimeSeriesChart";
import { PieBreakdownChart, type PieDatum } from "../components/charts/PieBreakdownChart";
import { DotDensityMap, type DotDensityPoint, type PlaceDot } from "../components/geo/DotDensityMap";

type Quote = {
  id: string;
  status?: unknown;
  totalPrice?: unknown;
  address?: unknown;
  createdAt?: unknown;
};

function coerceNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export default function Home(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);

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

  const totals = useMemo(() => {
    const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    return quotes.reduce(
      (acc, quote) => {
        acc.count += 1;

        const createdMs = toMillis(quote.createdAt);
        if (createdMs !== null && createdMs >= sinceMs) {
          acc.last24h += 1;
        }

        if (normalizeStatus(quote.status) === "CONFIRMED") {
          acc.confirmed += 1;
          acc.revenue += coerceNumber(quote.totalPrice);
        }
        return acc;
      },
      { count: 0, last24h: 0, confirmed: 0, revenue: 0 }
    );
  }, [quotes]);

  const range30d = useMemo(() => presetRangeKeys(30, Date.now()), []);
  const range365d = useMemo(() => {
    const nowMs = Date.now();
    const endKey = toDateKeyUTC(nowMs);
    const startKey = toDateKeyUTC(nowMs - (365 - 1) * DAY_MS);
    return { startKey, endKey };
  }, []);

  const charts30d = useMemo(() => {
    const keys = dateKeyRange(range30d.startKey, range30d.endKey);
    const rangeMs = rangeKeysToUtcMs(range30d.startKey, range30d.endKey);

    const seriesMap = new Map<string, DailySeriesPoint>();
    for (const key of keys) {
      seriesMap.set(key, { dateKey: key, leads: 0, confirmed: 0, revenue: 0 });
    }

    const counts: Record<string, number> = {};
    const bump = (key: string) => {
      counts[key] = (counts[key] ?? 0) + 1;
    };

    for (const quote of quotes) {
      const createdMs = toMillis(quote.createdAt);
      if (createdMs === null || rangeMs === null) continue;
      if (createdMs < rangeMs.startMs || createdMs >= rangeMs.endMsExclusive) continue;

      const dateKey = toDateKeyUTC(createdMs);
      const point = seriesMap.get(dateKey);
      if (!point) continue;

      point.leads += 1;

      const status = normalizeStatus(quote.status);
      bump(status);

      if (status === "CONFIRMED") {
        point.confirmed += 1;
        point.revenue += coerceNumber(quote.totalPrice);
      }
    }

    const series = keys.map((key) => seriesMap.get(key) ?? { dateKey: key, leads: 0, confirmed: 0, revenue: 0 });

    const pie: PieDatum[] = [];
    for (const status of STATUSES) {
      const value = counts[status] ?? 0;
      if (!value) continue;
      pie.push({ key: status, name: STATUS_LABELS[status] ?? status, value });
    }
    if (counts.OTHER) {
      pie.push({ key: "OTHER", name: STATUS_LABELS.OTHER, value: counts.OTHER });
    }

    return { series, pie, keys };
  }, [quotes, range30d.endKey, range30d.startKey]);

  const geo365 = useMemo(() => {
    const rangeMs = rangeKeysToUtcMs(range365d.startKey, range365d.endKey);
    if (!rangeMs) {
      return {
        points: [] as DotDensityPoint[],
        places: [] as PlaceDot[],
        totalQuotes: 0,
        matchedQuotes: 0,
        unknownQuotes: 0,
        truncated: false,
      };
    }

    const MAX_QUOTES = 10_000;
    type KanevskyPlaceId = (typeof kanevskyPlaces)[number]["id"];
    const placeById = new Map<KanevskyPlaceId, (typeof kanevskyPlaces)[number]>(
      kanevskyPlaces.map((place) => [place.id, place] as const)
    );

    const countsByPlace = new Map<KanevskyPlaceId, number>();
    let totalQuotes = 0;
    let matchedQuotes = 0;
    let unknownQuotes = 0;
    let truncated = false;

    for (const quote of quotes) {
      const createdMs = toMillis(quote.createdAt);
      if (createdMs === null) continue;
      if (createdMs < rangeMs.startMs) break;
      if (createdMs >= rangeMs.endMsExclusive) continue;

      if (totalQuotes >= MAX_QUOTES) {
        truncated = true;
        break;
      }

      totalQuotes += 1;

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

    const points: DotDensityPoint[] = Array.from(countsByPlace.entries())
      .map(([id, weight]) => {
        const place = placeById.get(id);
        if (!place || !weight) return null;
        return { lon: place.lon, lat: place.lat, weight };
      })
      .filter((item): item is DotDensityPoint => Boolean(item));

    const places: PlaceDot[] = kanevskyPlaces.map((place) => ({
      id: place.id,
      name: place.name,
      lon: place.lon,
      lat: place.lat,
      count: countsByPlace.get(place.id) ?? 0,
    }));

    return { points, places, totalQuotes, matchedQuotes, unknownQuotes, truncated };
  }, [quotes, range365d.endKey, range365d.startKey]);

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Панель администратора"
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
      <div className="dashboardGrid">
        {loadError ? (
          <section className="card noticeCard noticeCard-error dashboardCol-12">
            <h3 style={{ marginBottom: 6 }}>Ошибка загрузки данных</h3>
            <small className="noticeText-danger">{loadError}</small>
          </section>
        ) : null}

        <section className="card dashboardHero dashboardCol-5">
          <div className="dashboardHeroHeader">
            <div>
              <div className="dashboardHello">Привет!</div>
              <small className="breakLong">{session.user?.email ?? "Администратор"}</small>
            </div>
            <div className="dashboardHeroMeta">
              <small>Общая информация</small>
            </div>
          </div>

          <div className="dashboardHeroNumbers">
            <div className="dashboardHeroNumber">
              <div className="dashboardHeroValue">{totals.count}</div>
              <div className="dashboardHeroLabel">заявок всего</div>
            </div>
            <div className="dashboardHeroNumber">
              <div className="dashboardHeroValue">{totals.confirmed}</div>
              <div className="dashboardHeroLabel">подтверждено</div>
            </div>
          </div>

          <div className="dashboardHeroFooter">
            <button type="button" className="secondary small" onClick={() => router.push("/quotes")}>
              Открыть заявки
            </button>
            <button type="button" className="secondary small" onClick={() => router.push("/analytics")}>
              Статистика
            </button>
          </div>
        </section>

        <section className="card dashboardStat dashboardStatGlow dashboardCol-4">
          <h3>Заявки за 24 часа</h3>
          <p className="statValue">
            <span className="statValueAccent statValueWithDot">
              {totals.last24h}
              {totals.last24h > 0 ? <span className="pulseDot pulseDot-success" aria-hidden="true" /> : null}
            </span>
          </p>
	          <div className="dashboardFooterRow">
	            <small>Всего: {totals.count}</small>
	            <button type="button" className="secondary small" onClick={() => router.push("/quotes")}>
	              Заявки
	            </button>
	          </div>
	        </section>

        <section className="card dashboardStat dashboardCol-3">
          <h3>Подтверждено / Выручка</h3>
          <p className="statValue">
            <span className="statValueAccent">{totals.confirmed}</span> /{" "}
            <span className="statValueAccent">{totals.revenue.toLocaleString("ru-RU")}</span>
          </p>
          <div className="dashboardFooterRow">
            <small>За всё время</small>
            <button type="button" className="secondary small" onClick={() => router.push("/analytics")}>
              Статистика
            </button>
          </div>
        </section>

        <section className="card dashboardCol-7">
          <h3>Динамика заявок (30 дней)</h3>
          <TimeSeriesChart data={charts30d.series} />
          <div className="dashboardFooterRow">
            <small>
              {range30d.startKey} — {range30d.endKey} (UTC)
            </small>
            <button type="button" className="secondary small" onClick={() => router.push("/analytics")}>
              Статистика
            </button>
          </div>
        </section>

        <section className="card dashboardCol-5">
          <h3>Статусы заявок (30 дней)</h3>
          <PieBreakdownChart data={charts30d.pie} />
          <div className="dashboardFooterRow">
            <small>По дате создания</small>
            <button type="button" className="secondary small" onClick={() => router.push("/quotes")}>
              Заявки
            </button>
          </div>
        </section>

        <section className="card dashboardCol-12">
          <h3>Карта заявок (365 дней)</h3>
          <DotDensityMap
            bbox={kanevskyDistrictBbox}
            ring={kanevskyDistrictRing}
            points={geo365.points}
            places={geo365.places}
            showTooltip
            minHeight={320}
          />
          <div className="dashboardFooterRow">
            <small>
              {range365d.startKey} — {range365d.endKey} (UTC) · Всего: {geo365.totalQuotes} · Распознано:{" "}
              {geo365.matchedQuotes} · Не распознано: {geo365.unknownQuotes}
              {geo365.truncated ? " · Ограничено: 10 000" : null}
            </small>
            <button type="button" className="secondary small" onClick={() => router.push("/analytics")}>
              Статистика
            </button>
          </div>
        </section>

        <section className="dashboardTiles dashboardCol-12">
          <Link href="/products" className="card tileCard">
            <div className="tileTitle">Товары</div>
            <small className="tileSubtitle">Каталог, цены, видимость</small>
          </Link>
          <Link href="/gallery" className="card tileCard">
            <div className="tileTitle">Портфолио</div>
            <small className="tileSubtitle">Работы, фото, публикация</small>
          </Link>
          <Link href="/quotes" className="card tileCard">
            <div className="tileTitle">Заявки</div>
            <small className="tileSubtitle">Фильтры, статусы, детали</small>
          </Link>
          <Link href="/settings/site" className="card tileCard">
            <div className="tileTitle">Сайт</div>
            <small className="tileSubtitle">Футер, контакты, ссылки</small>
          </Link>
          <Link href="/settings/calc" className="card tileCard">
            <div className="tileTitle">Калькулятор</div>
            <small className="tileSubtitle">Настройки расчёта</small>
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}
