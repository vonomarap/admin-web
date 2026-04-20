"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Calendar as CalendarIcon, Clock3, Tags, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { combineLocalDateTime, dateKeyToLocalDate, isTimeKey, localDateToDateKey, splitLocalDateTime } from "../../lib/date-pickers";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import {
  ActionIconButton,
  EmptyState,
  FieldBlock,
  PageAlert,
  SectionCard,
  SwitchField,
  ToneBadge,
} from "../../components/admin-kit";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { PromosTabs } from "../../components/PromosTabs";
import { MediaUploadButton } from "../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../components/forms/ImageThumbPreview";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

type PromoBannerPlacement = "home" | "catalog" | "gallery";
type PromoBannerKind = "regular" | "promo" | "winter";
type PromoBannerStatus = "active" | "hidden";

type PromoBanner = {
  id: string;
  title: string;
  subtitle?: string;
  kind: PromoBannerKind;
  active?: boolean;
  priority?: number;
  placements?: PromoBannerPlacement[];
  imageUrl?: string;
  startsAt?: Timestamp;
  endsAt?: Timestamp;
};

type PromoPriority = "low" | "medium" | "high";

const PRIORITY_OPTIONS: Array<{ value: PromoPriority; label: string; score: number }> = [
  { value: "low", label: "Низкий", score: 0 },
  { value: "medium", label: "Средний", score: 10 },
  { value: "high", label: "Высокий", score: 20 }
];

const STATUS_OPTIONS: Array<{ value: PromoBannerStatus; label: string }> = [
  { value: "active", label: "Показано" },
  { value: "hidden", label: "Скрыто" }
];

function priorityFromScore(score: number): PromoPriority {
  const safe = Number.isFinite(score) ? score : 0;
  if (safe >= 15) return "high";
  if (safe >= 5) return "medium";
  return "low";
}

function priorityLabel(score: number | undefined): string {
  const option = PRIORITY_OPTIONS.find((opt) => opt.value === priorityFromScore(score ?? 0));
  return option?.label ?? "Средний";
}

function priorityScore(priority: PromoPriority): number {
  return PRIORITY_OPTIONS.find((opt) => opt.value === priority)?.score ?? 10;
}

function isVisible(active?: boolean): boolean {
  return active !== false;
}

function asLocalDateTime(value?: Timestamp): string {
  if (!value) return "";
  const date = value.toDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(value: string): Timestamp | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return undefined;
  return Timestamp.fromDate(date);
}

function formatSchedule(startsAt?: Timestamp, endsAt?: Timestamp): string {
  if (!startsAt && !endsAt) return "-";
  const fmt = (t: Timestamp) => t.toDate().toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (startsAt && endsAt) return `${fmt(startsAt)} → ${fmt(endsAt)}`;
  if (startsAt) return `с ${fmt(startsAt)}`;
  return `до ${fmt(endsAt!)}`;
}

function placementsLabel(placements?: PromoBannerPlacement[]): string {
  const list = Array.isArray(placements) ? placements : [];
  if (list.length === 0) return "Везде";
  const map: Record<PromoBannerPlacement, string> = {
    home: "Главная",
    catalog: "Каталог",
    gallery: "Портфолио"
  };
  return list.map((p) => map[p] ?? p).join(", ");
}

function kindLabel(kind: PromoBannerKind): string {
  if (kind === "winter") return "Зимняя акция";
  if (kind === "promo") return "Акция";
  return "Обычное";
}

function kindBadgeClass(kind: PromoBannerKind): string {
  if (kind === "winter") return "badge badge-kind-winter";
  if (kind === "promo") return "badge badge-kind-promo";
  return "badge badge-kind-promo";
}

function statusFromActive(active?: boolean): PromoBannerStatus {
  return active === false ? "hidden" : "active";
}

function statusLabel(status: PromoBannerStatus): string {
  return status === "active" ? "Показано" : "Скрыто";
}

function statusBadgeClass(status: PromoBannerStatus): string {
  return status === "active" ? "badge badge-status-active" : "badge badge-status-hidden";
}

function kindTone(kind: PromoBannerKind): "secondary" | "outline" | "success" {
  if (kind === "winter") return "success";
  if (kind === "promo") return "secondary";
  return "outline";
}

function statusTone(status: PromoBannerStatus): "success" | "muted" {
  return status === "active" ? "success" : "muted";
}

function createId(): string {
  const cryptoAny = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
  if (cryptoAny?.randomUUID) return cryptoAny.randomUUID();
  return `promo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sanitizeBannerForFirestore(item: PromoBanner): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: item.id,
    title: item.title,
    kind: item.kind === "winter" ? "winter" : item.kind === "promo" ? "promo" : "regular",
    active: item.active !== false,
    priority: Number.isFinite(item.priority) ? item.priority : 0
  };

  if (item.subtitle && item.subtitle.trim()) out.subtitle = item.subtitle.trim();
  if (Array.isArray(item.placements) && item.placements.length) out.placements = item.placements;
  if (item.imageUrl && item.imageUrl.trim()) out.imageUrl = item.imageUrl.trim();
  if (item.startsAt) out.startsAt = item.startsAt;
  if (item.endsAt) out.endsAt = item.endsAt;

  return out;
}

export default function PromosPage(): JSX.Element {
  const session = useAdminSession();
  const confirm = useConfirmDialog();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [banners, setBanners] = useState<PromoBanner[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    id: "",
    title: "",
    subtitle: "",
    kind: "regular" as PromoBannerKind,
    active: true,
    priority: "medium" as PromoPriority,
    placements: {
      home: true,
      catalog: true,
      gallery: true
    } as Record<PromoBannerPlacement, boolean>,
    imageUrl: "",
    startsAt: "",
    endsAt: ""
  });
  const startsAtParts = useMemo(() => splitLocalDateTime(draft.startsAt), [draft.startsAt]);
  const endsAtParts = useMemo(() => splitLocalDateTime(draft.endsAt), [draft.endsAt]);
  const startsAtDate = useMemo(() => dateKeyToLocalDate(startsAtParts.dateKey), [startsAtParts.dateKey]);
  const endsAtDate = useMemo(() => dateKeyToLocalDate(endsAtParts.dateKey), [endsAtParts.dateKey]);

  const sorted = useMemo(() => {
    return [...banners].sort((a, b) => {
      const ap = Number.isFinite(a.priority) ? (a.priority as number) : 0;
      const bp = Number.isFinite(b.priority) ? (b.priority as number) : 0;
      if (ap !== bp) return bp - ap;
      return String(a.title || "").localeCompare(String(b.title || ""), "ru", { sensitivity: "base" });
    });
  }, [banners]);

  const isCreating = Boolean(editingId && !banners.some((item) => item.id === editingId));

  const loadPromos = useCallback(async () => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const ref = doc(db, "app_settings", "promos");
      const snap = await getDoc(ref);
      const data = snap.exists() ? (snap.data() as unknown as { banners?: unknown; bannersKindSchema?: unknown }) : null;
      const raw = Array.isArray(data?.banners) ? data?.banners : [];

      const schemaVersion = (() => {
        const v = Number(data?.bannersKindSchema);
        return Number.isFinite(v) ? v : 0;
      })();

      const normalizeKind = (kind: unknown): PromoBannerKind => {
        const k = String(kind ?? "").trim().toLowerCase();
        if (k === "winter") return "winter";

        if (schemaVersion >= 2) {
          if (k === "promo") return "promo";
          if (k === "regular") return "regular";
          if (k === "hot") return "promo";
          return "regular";
        }

        // Legacy schema: "promo"/"hot"/missing were treated as ordinary.
        return "regular";
      };

      setBanners(
        raw
          .map((item) => item as Partial<PromoBanner> | null)
          .filter((item): item is Partial<PromoBanner> => Boolean(item && typeof item === "object"))
          .map((item) => {
            const kind = normalizeKind(item.kind);
            return {
              id: String(item.id ?? ""),
              title: String(item.title ?? ""),
              subtitle: item.subtitle ? String(item.subtitle) : undefined,
              kind,
              active: item.active === undefined ? undefined : Boolean(item.active),
              priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
              placements: Array.isArray(item.placements)
                ? (item.placements
                    .map((p) => String(p).trim().toLowerCase())
                    .filter((p): p is PromoBannerPlacement => p === "home" || p === "catalog" || p === "gallery"))
                : undefined,
              imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
              startsAt: item.startsAt as Timestamp | undefined,
              endsAt: item.endsAt as Timestamp | undefined
            };
          })
          .filter((item) => item.id && item.title)
      );
    } catch (error) {
      console.error("Admin loadPromos failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadPromos();
  }, [loadPromos, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadPromos();
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
  }, [loadPromos, loadingData, session.status]);

  const startCreate = () => {
    const id = createId();
    setDraftError(null);
    setEditingId(id);
    setDraft({
      id,
      title: "",
      subtitle: "",
      kind: "regular",
      active: true,
      priority: "medium",
      placements: { home: true, catalog: true, gallery: true },
      imageUrl: "",
      startsAt: "",
      endsAt: ""
    });
  };

  const startEdit = (item: PromoBanner) => {
    setDraftError(null);
    setEditingId(item.id);
    const placements = item.placements && item.placements.length ? item.placements : (["home", "catalog", "gallery"] as const);
    setDraft({
      id: item.id,
      title: item.title ?? "",
      subtitle: item.subtitle ?? "",
      kind: item.kind ?? "regular",
      active: isVisible(item.active),
      priority: priorityFromScore(Number.isFinite(item.priority) ? (item.priority as number) : 0),
      placements: {
        home: placements.includes("home"),
        catalog: placements.includes("catalog"),
        gallery: placements.includes("gallery")
      },
      imageUrl: item.imageUrl ?? "",
      startsAt: asLocalDateTime(item.startsAt),
      endsAt: asLocalDateTime(item.endsAt)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftError(null);
  };

  const persistBanners = async (next: PromoBanner[]) => {
    if (!db) return;
    const ref = doc(db, "app_settings", "promos");
    const cleaned = next.map(sanitizeBannerForFirestore);
    await setDoc(
      ref,
      {
        banners: cleaned,
        bannersKindSchema: 2,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const onSave = async () => {
    if (!db || !editingId) return;

    const title = draft.title.trim();
    if (!title) {
      setDraftError("Заголовок обязателен.");
      return;
    }

    const priority = priorityScore(draft.priority);

    const placements = (["home", "catalog", "gallery"] as const).filter((p) => draft.placements[p]);
    if (!placements.length) {
      setDraftError("Выберите хотя бы одну страницу для показа.");
      return;
    }

    const startsAt = parseLocalDateTime(draft.startsAt);
    const endsAt = parseLocalDateTime(draft.endsAt);
    if (startsAt && endsAt && endsAt.toMillis() < startsAt.toMillis()) {
      setDraftError("Окончание не может быть раньше начала.");
      return;
    }

    const nextItem: PromoBanner = {
      id: editingId,
      title,
      subtitle: draft.subtitle.trim() || undefined,
      kind: draft.kind,
      active: Boolean(draft.active),
      priority,
      placements,
      imageUrl: draft.imageUrl.trim() || undefined,
      startsAt,
      endsAt
    };

    setSaving(true);
    setDraftError(null);
    try {
      const exists = banners.some((b) => b.id === editingId);
      const next = exists ? banners.map((b) => (b.id === editingId ? nextItem : b)) : [...banners, nextItem];
      await persistBanners(next);
      setEditingId(null);
      await loadPromos();
    } catch (error) {
      console.error("Promo save failed:", error);
      setDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const onToggleVisibility = async (item: PromoBanner) => {
    if (!db) return;
    const nextActive = item.active === false ? true : false;
    const next = banners.map((b) => (b.id === item.id ? { ...b, active: nextActive } : b));
    await persistBanners(next);
    await loadPromos();
  };

  const onDelete = async (item: PromoBanner) => {
    if (!db) return;
    const ok = await confirm({
      title: `Удалить баннер "${item.title}"?`,
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      variant: "destructive",
    });
    if (!ok) return;
    const next = banners.filter((b) => b.id !== item.id);
    await persistBanners(next);
    if (editingId === item.id) cancelEdit();
    await loadPromos();
  };

  const previewTone =
    draft.kind === "winter"
      ? {
          border: "1px solid rgba(2,132,199,0.26)",
          background: "linear-gradient(135deg, rgba(2,132,199,0.16), rgba(224,242,254,0.55))"
        }
      : draft.kind === "promo"
      ? {
          border: "1px solid rgba(234,88,12,0.24)",
          background: "linear-gradient(135deg, rgba(234,88,12,0.18), rgba(255,237,213,0.45))"
        }
      : {
          border: "1px solid rgba(148,163,184,0.28)",
          background: "linear-gradient(135deg, rgba(148,163,184,0.14), rgba(241,245,249,0.62))"
        };

  const editor = (
    <Card className="border-border/80 bg-background/60">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">{isCreating ? "Новый баннер" : "Редактирование баннера"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 pt-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
        <div className="grid gap-4">
          <FieldBlock label="Заголовок">
            <Input
              placeholder="Заголовок"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
          </FieldBlock>

          <FieldBlock label="Подзаголовок" description="Короткая поясняющая строка. Можно оставить пустой.">
            <Input
              placeholder="Подзаголовок (необязательно)"
              value={draft.subtitle}
              onChange={(e) => setDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
            />
          </FieldBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Тип">
              <NativeSelect
                value={draft.kind}
                onChange={(e) => setDraft((prev) => ({ ...prev, kind: e.target.value as PromoBannerKind }))}
              >
                <option value="regular">Обычное</option>
                <option value="promo">Акция</option>
                <option value="winter">Зимняя акция</option>
              </NativeSelect>
            </FieldBlock>
            <FieldBlock label="Статус">
              <NativeSelect
                value={statusFromActive(draft.active)}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    active: (e.target.value as PromoBannerStatus) === "active",
                  }))
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
          </div>

          <FieldBlock label="Приоритет">
            <NativeSelect
              value={draft.priority}
              onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value as PromoPriority }))}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>
          </FieldBlock>

          <FieldBlock label="Изображение" description="Можно вставить URL вручную или загрузить файл в GitHub-медиа.">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  placeholder="Картинка (URL, необязательно)"
                  value={draft.imageUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  autoCapitalize="none"
                />
                <MediaUploadButton
                  folder="promos"
                  label="Загрузить"
                  disabled={saving}
                  onUploaded={(urls) => setDraft((prev) => ({ ...prev, imageUrl: urls[0] ?? "" }))}
                />
              </div>
              <ImageThumbPreview url={draft.imageUrl} />
            </div>
          </FieldBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Начало">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      data-empty={!startsAtDate || undefined}
                      className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                    >
                      <CalendarIcon data-icon="inline-start" />
                      {startsAtDate ? <span>{format(startsAtDate, "PPP", { locale: ru })}</span> : <span>Выберите дату</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto overflow-hidden p-0">
                    <Calendar
                      mode="single"
                      selected={startsAtDate}
                      onSelect={(date) => {
                        if (!date) return;
                        const dateKey = localDateToDateKey(date);
                        const timeKey = startsAtParts.timeKey || "00:00";
                        setDraft((prev) => ({ ...prev, startsAt: combineLocalDateTime(dateKey, timeKey) }));
                      }}
                      className="rounded-lg"
                    />
                  </PopoverContent>
                </Popover>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="time"
                    step={60}
                    value={startsAtParts.dateKey ? startsAtParts.timeKey || "00:00" : ""}
                    disabled={!startsAtParts.dateKey}
                    className="pl-9"
                    onChange={(event) => {
                      const nextTime = event.target.value;
                      if (!startsAtParts.dateKey || !isTimeKey(nextTime)) return;
                      setDraft((prev) => ({ ...prev, startsAt: combineLocalDateTime(startsAtParts.dateKey, nextTime) }));
                    }}
                  />
                </div>
                {draft.startsAt ? (
                  <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, startsAt: "" }))}>
                    <X data-icon="inline-start" />
                    Очистить
                  </Button>
                ) : null}
              </div>
            </FieldBlock>
            <FieldBlock label="Окончание">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      data-empty={!endsAtDate || undefined}
                      className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                    >
                      <CalendarIcon data-icon="inline-start" />
                      {endsAtDate ? <span>{format(endsAtDate, "PPP", { locale: ru })}</span> : <span>Выберите дату</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto overflow-hidden p-0">
                    <Calendar
                      mode="single"
                      selected={endsAtDate}
                      onSelect={(date) => {
                        if (!date) return;
                        const dateKey = localDateToDateKey(date);
                        const timeKey = endsAtParts.timeKey || "00:00";
                        setDraft((prev) => ({ ...prev, endsAt: combineLocalDateTime(dateKey, timeKey) }));
                      }}
                      className="rounded-lg"
                    />
                  </PopoverContent>
                </Popover>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="time"
                    step={60}
                    value={endsAtParts.dateKey ? endsAtParts.timeKey || "00:00" : ""}
                    disabled={!endsAtParts.dateKey}
                    className="pl-9"
                    onChange={(event) => {
                      const nextTime = event.target.value;
                      if (!endsAtParts.dateKey || !isTimeKey(nextTime)) return;
                      setDraft((prev) => ({ ...prev, endsAt: combineLocalDateTime(endsAtParts.dateKey, nextTime) }));
                    }}
                  />
                </div>
                {draft.endsAt ? (
                  <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, endsAt: "" }))}>
                    <X data-icon="inline-start" />
                    Очистить
                  </Button>
                ) : null}
              </div>
            </FieldBlock>
          </div>

          <FieldBlock label="Показывать на" description="Хотя бы одна площадка должна быть включена.">
            <div className="grid gap-3 md:grid-cols-3">
              <SwitchField
                title="Главная"
                checked={draft.placements.home}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, home: checked } }))
                }
              />
              <SwitchField
                title="Каталог"
                checked={draft.placements.catalog}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, catalog: checked } }))
                }
              />
              <SwitchField
                title="Портфолио"
                checked={draft.placements.gallery}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, gallery: checked } }))
                }
              />
            </div>
          </FieldBlock>
        </div>

        <div className="grid gap-4">
          <SectionCard
            title="Превью"
            description="Проверка текста, статуса и расписания перед сохранением."
            className="h-fit border-none shadow-none"
            contentClassName="pt-0"
          >
            <div
              className="grid gap-3 rounded-2xl p-4"
              style={{
                border: previewTone.border,
                background: previewTone.background,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={kindTone(draft.kind)}>{kindLabel(draft.kind)}</ToneBadge>
                <ToneBadge tone={statusTone(statusFromActive(draft.active))}>
                  {statusLabel(statusFromActive(draft.active))}
                </ToneBadge>
                <Badge variant="outline">Приоритет: {priorityLabel(priorityScore(draft.priority))}</Badge>
              </div>
              <div className="text-lg font-semibold">{draft.title.trim() || "Заголовок баннера"}</div>
              <div className="text-sm text-muted-foreground">
                {draft.subtitle.trim() || "Подзаголовок (необязательно)"}
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div>Площадки: {placementsLabel((["home", "catalog", "gallery"] as const).filter((p) => draft.placements[p]))}</div>
                <div>Расписание: {draft.startsAt || draft.endsAt ? `${draft.startsAt || "-"} → ${draft.endsAt || "-"}` : "-"}</div>
                <div className="break-all">imageUrl: {draft.imageUrl.trim() || "-"}</div>
              </div>
            </div>
          </SectionCard>
        </div>

        {draftError ? <PageAlert title="Ошибка сохранения" description={draftError} className="lg:col-span-2" /> : null}

        <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
          <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Акции" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Акции"
      subtitle={session.user?.email ?? ""}
    >
      <PromosTabs />

      {loadError ? <PageAlert title="Ошибка загрузки данных" description={loadError} /> : null}

      <SectionCard
        eyebrow="Firestore"
        title="Баннеры"
        description="Управление баннерами из `app_settings/promos`: статус, приоритет, площадки и расписание."
        icon={Tags}
        tone="rose"
        actions={
          <>
            <Badge variant="outline">{sorted.length} шт.</Badge>
            <Badge variant="outline">app_settings/promos</Badge>
          </>
        }
      >
        <div className="grid gap-4">
          {isCreating ? editor : null}

          {sorted.length ? (
            <>
              <div className="grid gap-4 lg:hidden">
                {sorted.map((item) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingId === item.id;
                  const status = statusFromActive(item.active);

                  return (
                    <Card key={item.id} className="border-border/70 bg-background/70">
                      <CardHeader className="gap-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="grid gap-1">
                            <CardTitle className="text-base">{item.title}</CardTitle>
                            <div className="break-all text-xs text-muted-foreground">{item.id}</div>
                            {item.subtitle ? <div className="text-sm text-muted-foreground">{item.subtitle}</div> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <ToneBadge tone={kindTone(item.kind)}>{kindLabel(item.kind)}</ToneBadge>
                            <ToneBadge tone={statusTone(status)}>{statusLabel(status)}</ToneBadge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <FieldBlock label="Площадки">
                            <div className="text-sm text-muted-foreground">{placementsLabel(item.placements)}</div>
                          </FieldBlock>
                          <FieldBlock label="Приоритет">
                            <div className="text-sm text-muted-foreground">
                              {priorityLabel(Number.isFinite(item.priority) ? (item.priority as number) : 0)}
                            </div>
                          </FieldBlock>
                          <FieldBlock label="Расписание">
                            <div className="text-sm text-muted-foreground">{formatSchedule(item.startsAt, item.endsAt)}</div>
                          </FieldBlock>
                          <FieldBlock label="Картинка">
                            <div className="text-sm text-muted-foreground">{item.imageUrl ? "Есть" : "-"}</div>
                          </FieldBlock>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <ActionIconButton
                            type="button"
                            aria-label="Изменить"
                            title="Изменить"
                            onClick={() => startEdit(item)}
                          >
                            <PencilIcon />
                          </ActionIconButton>
                          <ActionIconButton
                            type="button"
                            aria-label={visible ? "Скрыть" : "Показать"}
                            title={visible ? "Скрыть" : "Показать"}
                            onClick={() => void onToggleVisibility(item)}
                          >
                            {visible ? <EyeOffIcon /> : <EyeIcon />}
                          </ActionIconButton>
                          <ActionIconButton
                            type="button"
                            variant="destructive"
                            aria-label="Удалить"
                            title="Удалить"
                            onClick={() => void onDelete(item)}
                          >
                            <TrashIcon />
                          </ActionIconButton>
                        </div>

                        {isEditing ? editor : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Заголовок</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Площадки</TableHead>
                      <TableHead>Приоритет</TableHead>
                      <TableHead>Расписание</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((item) => {
                      const visible = isVisible(item.active);
                      const isEditing = editingId === item.id;
                      const status = statusFromActive(item.active);

                      return (
                        <Fragment key={item.id}>
                          <TableRow>
                            <TableCell>
                              <div className="grid gap-1">
                                <div className="font-medium">{item.title}</div>
                                <div className="break-all text-xs text-muted-foreground">{item.id}</div>
                                {item.subtitle ? <div className="text-sm text-muted-foreground">{item.subtitle}</div> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <ToneBadge tone={kindTone(item.kind)}>{kindLabel(item.kind)}</ToneBadge>
                            </TableCell>
                            <TableCell>
                              <ToneBadge tone={statusTone(status)}>{statusLabel(status)}</ToneBadge>
                            </TableCell>
                            <TableCell>{placementsLabel(item.placements)}</TableCell>
                            <TableCell>
                              {priorityLabel(Number.isFinite(item.priority) ? (item.priority as number) : 0)}
                            </TableCell>
                            <TableCell>{formatSchedule(item.startsAt, item.endsAt)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <ActionIconButton
                                  type="button"
                                  aria-label="Изменить"
                                  title="Изменить"
                                  onClick={() => startEdit(item)}
                                >
                                  <PencilIcon />
                                </ActionIconButton>
                                <ActionIconButton
                                  type="button"
                                  aria-label={visible ? "Скрыть" : "Показать"}
                                  title={visible ? "Скрыть" : "Показать"}
                                  onClick={() => void onToggleVisibility(item)}
                                >
                                  {visible ? <EyeOffIcon /> : <EyeIcon />}
                                </ActionIconButton>
                                <ActionIconButton
                                  type="button"
                                  variant="destructive"
                                  aria-label="Удалить"
                                  title="Удалить"
                                  onClick={() => void onDelete(item)}
                                >
                                  <TrashIcon />
                                </ActionIconButton>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isEditing ? (
                            <TableRow>
                              <TableCell colSpan={7}>{editor}</TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              title="Пока нет баннеров"
              description="Создайте первый баннер для главной, каталога или портфолио."
              action={
                <Button type="button" onClick={startCreate}>
                  Добавить баннер
                </Button>
              }
            />
          )}
        </div>
      </SectionCard>
    </AdminShell>
  );
}
