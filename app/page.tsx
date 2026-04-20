"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getCountFromServer, getDocs, orderBy, query } from "firebase/firestore";
import {
  ArrowUpRight,
  Clock3,
  MapPinned,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { db } from "../lib/firebase";
import { DAY_MS, dateKeyRange, presetRangeKeys, rangeKeysToUtcMs, toDateKeyUTC, toMillis } from "../lib/analytics";
import { matchKanevskyPlaceFromAddress } from "../lib/geo/addressToKanevskyPlace";
import { kanevskyDistrictBbox, kanevskyDistrictRing } from "../lib/geo/kanevskyDistrict";
import { kanevskyPlaces } from "../lib/geo/kanevskyPlaces";
import { normalizeStatus } from "../lib/quoteStatus";
import { useAdminSession } from "../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../components/AdminScreens";
import { AdminShell } from "../components/AdminShell";
import { TimeSeriesChart, type DailySeriesPoint } from "../components/charts/TimeSeriesChart";
import { DotDensityMap, type DotDensityPoint, type PlaceDot } from "../components/geo/DotDensityMap";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

type Quote = {
  id: string;
  status?: unknown;
  totalPrice?: unknown;
  address?: unknown;
  createdAt?: unknown;
};

type PublicAnalyticsSummary = {
  siteVisitsTotal: number;
  productViewsTotal: number;
  topProducts: Array<{
    productId: string;
    views: number;
    title?: string;
    image?: string;
  }>;
};

function coerceNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatInt(value: number): string {
  return value.toLocaleString("ru-RU");
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function KpiTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/80 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

export default function Home(): JSX.Element {
  const session = useAdminSession();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [publicAnalytics, setPublicAnalytics] = useState<PublicAnalyticsSummary>({
    siteVisitsTotal: 0,
    productViewsTotal: 0,
    topProducts: [],
  });

  const loadOverviewData = useCallback(async () => {
    if (!db) return;

    setLoadError(null);
    setLoadingData(true);
    try {
      const [quotesSnap, siteVisitsSnap, productViewsSnap] = await Promise.all([
        getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc"))),
        getCountFromServer(collection(db, "site_visit_sessions")),
        getDocs(query(collection(db, "product_view_totals"), orderBy("viewsTotal", "desc"))),
      ]);
      const rankedProducts = productViewsSnap.docs
        .map((docRef) => {
          const record = docRef.data() as Record<string, unknown>;
          const views = typeof record.viewsTotal === "number" && Number.isFinite(record.viewsTotal)
            ? Math.max(0, Math.round(record.viewsTotal))
            : 0;
          if (!views) return null;
          const title = typeof record.title === "string" ? record.title.trim() : "";
          const image = typeof record.image === "string" ? record.image.trim() : "";
          return {
            productId: docRef.id,
            views,
            ...(title ? { title } : {}),
            ...(image ? { image } : {}),
          };
        })
        .filter((item): item is PublicAnalyticsSummary["topProducts"][number] => Boolean(item));

      setPublicAnalytics({
        siteVisitsTotal: siteVisitsSnap.data().count,
        productViewsTotal: rankedProducts.reduce((sum, item) => sum + item.views, 0),
        topProducts: rankedProducts.slice(0, 3),
      });

      setQuotes(quotesSnap.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<Quote, "id">) })));
    } catch (error) {
      console.error("Admin loadOverviewData failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadOverviewData();
  }, [loadOverviewData, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadOverviewData();
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
  }, [loadOverviewData, loadingData, session.status]);

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

    for (const quote of quotes) {
      const createdMs = toMillis(quote.createdAt);
      if (createdMs === null || rangeMs === null) continue;
      if (createdMs < rangeMs.startMs || createdMs >= rangeMs.endMsExclusive) continue;

      const dateKey = toDateKeyUTC(createdMs);
      const point = seriesMap.get(dateKey);
      if (!point) continue;

      point.leads += 1;

      if (normalizeStatus(quote.status) === "CONFIRMED") {
        point.confirmed += 1;
        point.revenue += coerceNumber(quote.totalPrice);
      }
    }

    return {
      series: keys.map((key) => seriesMap.get(key) ?? { dateKey: key, leads: 0, confirmed: 0, revenue: 0 }),
    };
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

  const overview = useMemo(() => {
    const leads30d = charts30d.series.reduce((acc, item) => acc + item.leads, 0);
    const revenue30d = charts30d.series.reduce((acc, item) => acc + item.revenue, 0);
    const confirmationRate = totals.count ? (totals.confirmed / totals.count) * 100 : 0;
    const averageCheck = totals.confirmed ? totals.revenue / totals.confirmed : 0;
    const geoCoverage = geo365.totalQuotes ? (geo365.matchedQuotes / geo365.totalQuotes) * 100 : 0;
    const topPlaces = [...geo365.places].filter((place) => place.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      leads30d,
      revenue30d,
      confirmationRate,
      averageCheck,
      geoCoverage,
      topPlaces,
    };
  }, [charts30d.series, geo365.matchedQuotes, geo365.places, geo365.totalQuotes, totals.confirmed, totals.count, totals.revenue]);

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Обзор"
      subtitle={session.user?.email ?? "Администратор"}
    >
      <div className="flex flex-col gap-6">
        {loadError ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Ошибка загрузки данных</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-card via-card to-accent/5">
          <CardHeader className="gap-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex max-w-3xl flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={loadError ? "destructive" : loadingData ? "secondary" : "success"}>
                    {loadError ? "Есть ошибка синхронизации" : loadingData ? "Обновляем данные" : "Система в норме"}
                  </Badge>
                  <Badge variant="outline">30 / 365 дней, UTC</Badge>
                  <Badge variant="muted" className="max-w-full truncate sm:max-w-[340px]">
                    {session.user?.email ?? "Администратор"}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2">
                  <CardTitle className="text-3xl sm:text-4xl">Операционный центр</CardTitle>
                  <CardDescription className="max-w-2xl text-base leading-relaxed">
                    Единый срез по потоку заявок, подтверждениям, выручке и географии. Страница собрана как шорт-лист для
                    ежедневных решений, без переходов между разделами.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/quotes">
                      Открыть заявки
                      <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/analytics">
                      Открыть аналитику
                      <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid min-w-[min(100%,320px)] gap-3 rounded-xl border border-border/70 bg-background/80 p-4 xl:max-w-sm">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <ShieldCheck className="size-4 text-icon-accent" />
                  Срез панели
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Заявок за 30 дней</span>
                  <span className="font-semibold text-foreground">{formatInt(overview.leads30d)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Выручка за 30 дней</span>
                  <span className="font-semibold text-foreground">{formatInt(overview.revenue30d)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Доминирующий статус</span>
                  <span className="font-semibold text-foreground">См. аналитику заявок</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 md:grid-cols-3">
            <KpiTile
              label="Конверсия"
              value={formatPercent(overview.confirmationRate)}
              note="Доля подтвержденных заявок среди всего накопленного потока."
            />
            <KpiTile
              label="Средний чек"
              value={formatInt(overview.averageCheck)}
              note="Средняя выручка по подтвержденным заявкам за все время."
            />
            <KpiTile
              label="Покрытие адресов"
              value={formatPercent(overview.geoCoverage)}
              note="Часть заявок за 365 дней, для которых удалось распознать населенный пункт."
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <Card className="border-border/80">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardDescription>Главные показатели</CardDescription>
                  <CardTitle>Поток и деньги</CardTitle>
                </div>
                <Badge variant="outline">Lifetime</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Все заявки</p>
                <p className="text-4xl font-semibold tracking-tight">{formatInt(totals.count)}</p>
                <p className="text-sm text-muted-foreground">Накопленный объем входящего потока.</p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Подтверждено</p>
                <p className="text-4xl font-semibold tracking-tight">{formatInt(totals.confirmed)}</p>
                <p className="text-sm text-muted-foreground">Заявки со статусом CONFIRMED.</p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Выручка</p>
                <p className="text-4xl font-semibold tracking-tight">{formatInt(totals.revenue)}</p>
                <p className="text-sm text-muted-foreground">Сумма `totalPrice` по подтвержденным лидам.</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>Основной накопительный итог без фильтров.</span>
              <Button asChild variant="outline" size="sm">
                <Link href="/quotes">
                  Смотреть заявки
                  <ArrowUpRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border/80">
            <CardHeader className="gap-1">
              <CardDescription>Последние 24 часа</CardDescription>
              <CardTitle>Свежий вход</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Clock3 className="size-5" />
                </div>
                <Badge variant={totals.last24h > 0 ? "success" : "muted"}>
                  {totals.last24h > 0 ? "Есть новые лиды" : "Пауза в потоке"}
                </Badge>
              </div>
              <div className="flex items-end gap-3">
                <p className="text-5xl font-semibold tracking-tight">{formatInt(totals.last24h)}</p>
                <p className="pb-1 text-sm text-muted-foreground">заявок за сутки</p>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Быстрый индикатор нагрузки для команды и скорости первичного отклика.
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">Всего в системе: {formatInt(totals.count)}</Badge>
              <Button asChild variant="outline" size="sm">
                <Link href="/quotes">
                  В очередь заявок
                  <ArrowUpRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="border-border/80">
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <CardDescription>Публичная витрина</CardDescription>
                <CardTitle>Заходы на сайт и интерес к товарам</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Заходы: {formatInt(publicAnalytics.siteVisitsTotal)}</Badge>
                <Badge variant="outline">Просмотры: {formatInt(publicAnalytics.productViewsTotal)}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Заходов на сайт за все время</p>
              <p className="text-4xl font-semibold tracking-tight">{formatInt(publicAnalytics.siteVisitsTotal)}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Метрика считает уникальные сессии по 30-минутному окну и совпадает с тем, что показывается на главной.
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="!text-sm !tracking-normal">Топ товаров по просмотрам</h3>
                <Badge variant="outline">{publicAnalytics.topProducts.length}</Badge>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {publicAnalytics.topProducts.length ? (
                  publicAnalytics.topProducts.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{item.title || item.productId}</span>
                      <span className="font-semibold text-foreground">{formatInt(item.views)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Пока нет просмотров товаров для ранжирования.</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Эти данные обновляются вместе с публичным summary-документом для главной страницы.</span>
            <Button asChild variant="outline" size="sm">
              <Link href="/analytics">
                Открыть детализацию
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/80">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle>Динамика лидов, подтверждений и выручки</CardTitle>
                  <CardDescription>
                    Последние 30 дней. Одна панель показывает как объем входящего потока, так и деньги.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/analytics">
                    В аналитику
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TimeSeriesChart data={charts30d.series} />
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {range30d.startKey} - {range30d.endKey} (UTC)
              </span>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Лидов: {formatInt(overview.leads30d)}</Badge>
                <Badge variant="outline">Выручка: {formatInt(overview.revenue30d)}</Badge>
              </div>
            </CardFooter>
          </Card>
        </div>

        <Card className="border-border/80">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle>Карта заявок по Каневскому району</CardTitle>
                <CardDescription>
                  Окно 365 дней. Локация определяется по совпадению населенного пункта в `quotes.address`, без внешних геосервисов.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={overview.geoCoverage >= 60 ? "success" : overview.geoCoverage > 0 ? "secondary" : "muted"}>
                  Покрытие: {formatPercent(overview.geoCoverage)}
                </Badge>
                {geo365.truncated ? <Badge variant="destructive">Ограничено: 10 000</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_320px]">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-background/70 p-3">
              <DotDensityMap
                bbox={kanevskyDistrictBbox}
                ring={kanevskyDistrictRing}
                points={geo365.points}
                places={geo365.places}
                showTooltip
                minHeight={360}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPinned className="size-4" />
                    Распознано
                  </div>
                  <p className="text-3xl font-semibold tracking-tight">{formatInt(geo365.matchedQuotes)}</p>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="size-4" />
                    Всего в окне
                  </div>
                  <p className="text-3xl font-semibold tracking-tight">{formatInt(geo365.totalQuotes)}</p>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TriangleAlert className="size-4" />
                    Не распознано
                  </div>
                  <p className="text-3xl font-semibold tracking-tight">{formatInt(geo365.unknownQuotes)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="!text-sm !tracking-normal">Топ населенных пунктов</h3>
                  <Badge variant="outline">{overview.topPlaces.length}</Badge>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  {overview.topPlaces.length ? (
                    overview.topPlaces.map((place) => (
                      <div key={place.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-muted-foreground">{place.name}</span>
                        <span className="font-semibold text-foreground">{formatInt(place.count)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Пока нет распознанных точек для ранжирования.</p>
                  )}
                </div>
              </div>

              {geo365.truncated ? (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>Сработал лимит окна</AlertTitle>
                  <AlertDescription>
                    В карту попали только первые 10 000 заявок из годового диапазона. Для полного анализа откройте раздел статистики.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {range365d.startKey} - {range365d.endKey} (UTC)
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/analytics">
                Полная геоаналитика
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AdminShell>
  );
}
