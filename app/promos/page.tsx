"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { PromosTabs } from "../../components/PromosTabs";
import { MediaUploadButton } from "../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../components/forms/ImageThumbPreview";

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
    const ok = confirm(`Удалить баннер "${item.title}"? Это действие необратимо.`);
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
    <div className="editPanel">
      <div className="editGrid">
        <div className="grid" style={{ gap: 10 }}>
          <input
            placeholder="Заголовок"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            placeholder="Подзаголовок (необязательно)"
            value={draft.subtitle}
            onChange={(e) => setDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
          />

          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <div className="fieldLabel">Тип</div>
              <select value={draft.kind} onChange={(e) => setDraft((prev) => ({ ...prev, kind: e.target.value as PromoBannerKind }))}>
                <option value="regular">Обычное</option>
                <option value="promo">Акция</option>
                <option value="winter">Зимняя акция</option>
              </select>
            </label>
            <label className="field">
              <div className="fieldLabel">Статус</div>
              <select
                value={statusFromActive(draft.active)}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    active: (e.target.value as PromoBannerStatus) === "active"
                  }))
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <div className="fieldLabel">Приоритет</div>
            <select
              value={draft.priority}
              onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value as PromoPriority }))}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            <div className="rowActions" style={{ alignItems: "stretch" }}>
              <input
                placeholder="Картинка (URL, необязательно)"
                value={draft.imageUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, imageUrl: e.target.value }))}
                autoCapitalize="none"
                style={{ flex: 1, minWidth: 0 }}
              />
              <MediaUploadButton
                folder="promos"
                label="Загрузить"
                disabled={saving}
                onUploaded={(urls) => setDraft((prev) => ({ ...prev, imageUrl: urls[0] ?? "" }))}
              />
            </div>
            <ImageThumbPreview url={draft.imageUrl} />
            <small>Можно загрузить баннер в «Медиа» и вставить URL сюда.</small>
          </div>

          <div className="grid cols-2" style={{ gap: 10 }}>
            <div className="field">
              <div className="fieldLabel">Начало</div>
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft((prev) => ({ ...prev, startsAt: e.target.value }))}
              />
            </div>
            <div className="field">
              <div className="fieldLabel">Окончание</div>
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft((prev) => ({ ...prev, endsAt: e.target.value }))}
              />
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Показывать на</div>
            <label className="row" style={{ gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.placements.home}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, home: e.target.checked } }))
                }
              />
              <span>Главная</span>
            </label>
            <label className="row" style={{ gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.placements.catalog}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, catalog: e.target.checked } }))
                }
              />
              <span>Каталог</span>
            </label>
            <label className="row" style={{ gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.placements.gallery}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, placements: { ...prev.placements, gallery: e.target.checked } }))
                }
              />
              <span>Портфолио</span>
            </label>
          </div>

        </div>

        <div className="grid" style={{ gap: 10 }}>
          <h3 style={{ marginBottom: 0 }}>Превью</h3>
          <div
            className="card"
            style={{
              padding: 14,
              border: previewTone.border,
              background: previewTone.background,
              display: "grid",
              gap: 8
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              {draft.kind !== "regular" ? (
                <span className={kindBadgeClass(draft.kind)}>{kindLabel(draft.kind)}</span>
              ) : null}
              <small style={{ marginLeft: "auto" }}>
                {statusLabel(statusFromActive(draft.active))} · Приоритет: {priorityLabel(priorityScore(draft.priority))}
              </small>
            </div>
            <b>{draft.title.trim() ? draft.title.trim() : "Заголовок баннера"}</b>
            {draft.subtitle.trim() ? <small>{draft.subtitle.trim()}</small> : <small>Подзаголовок (необязательно)</small>}
            <small>Показывать: {placementsLabel((["home", "catalog", "gallery"] as const).filter((p) => draft.placements[p]))}</small>
            <small>Расписание: {draft.startsAt || draft.endsAt ? `${draft.startsAt || "-"} → ${draft.endsAt || "-"}` : "-"}</small>
            <small className="breakLong">imageUrl: {draft.imageUrl.trim() ? draft.imageUrl.trim() : "-"}</small>
          </div>
        </div>
      </div>

      {draftError ? <div className="errorBox">{draftError}</div> : null}

      <div className="rowActions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="secondary" onClick={cancelEdit} disabled={saving}>
          Отмена
        </button>
        <button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Акции" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Акции"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <button className="secondary" onClick={startCreate}>
            Добавить
          </button>
          <button className="secondary" onClick={() => void loadPromos()} disabled={loadingData}>
            Обновить
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >
      <PromosTabs />

      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка загрузки данных</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Баннеры</h2>
            <small>{sorted.length} шт.</small>
          </div>
          <small>Данные: Firestore → app_settings/promos</small>
        </div>

        {isCreating ? <div style={{ marginTop: 12 }}>{editor}</div> : null}

        <div className="mobileOnly" style={{ marginTop: 12 }}>
          {sorted.length ? (
            <div className="cardList">
              {sorted.map((item) => {
                const visible = isVisible(item.active);
                const isEditing = editingId === item.id;
                const status = statusFromActive(item.active);

                return (
                  <div key={item.id} className="itemCard">
                    <div className="itemHeader">
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b>{item.title}</b>
                        <small className="breakLong">{item.id}</small>
                      </div>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        {item.kind !== "regular" ? (
                          <span className={kindBadgeClass(item.kind)}>{kindLabel(item.kind)}</span>
                        ) : null}
                        <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>
                      </div>
                    </div>

                    <div className="kv">
                      <div className="kvRow">
                        <div className="kvLabel">Где</div>
                        <div className="kvValue">{placementsLabel(item.placements)}</div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Приоритет</div>
                        <div className="kvValue">{priorityLabel(Number.isFinite(item.priority) ? (item.priority as number) : 0)}</div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Расписание</div>
                        <div className="kvValue">{formatSchedule(item.startsAt, item.endsAt)}</div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Картинка</div>
                        <div className="kvValue">{item.imageUrl ? "Есть" : "-"}</div>
                      </div>
                    </div>

                    <div className="rowActions" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label="Изменить"
                        title="Изменить"
                        onClick={() => startEdit(item)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label={visible ? "Скрыть" : "Показать"}
                        title={visible ? "Скрыть" : "Показать"}
                        onClick={() => void onToggleVisibility(item)}
                      >
                        {visible ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-danger"
                        aria-label="Удалить"
                        title="Удалить"
                        onClick={() => void onDelete(item)}
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {isEditing ? editor : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <small>Пока нет баннеров. Нажми “Добавить”.</small>
          )}
        </div>

        <div className="desktopOnly" style={{ marginTop: 12 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Заголовок</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Где</th>
                  <th>Приоритет</th>
                  <th>Расписание</th>
                  <th className="actionsCol">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingId === item.id;
                  const status = statusFromActive(item.active);

                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <div style={{ display: "grid", gap: 4 }}>
                            <b>{item.title}</b>
                            <small className="breakLong">{item.id}</small>
                            {item.subtitle ? <small className="breakLong">{item.subtitle}</small> : null}
                          </div>
                        </td>
                        <td>
                          {item.kind !== "regular" ? (
                            <span className={kindBadgeClass(item.kind)}>{kindLabel(item.kind)}</span>
                          ) : null}
                        </td>
                        <td>
                          <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>
                        </td>
                        <td>{placementsLabel(item.placements)}</td>
                        <td>{priorityLabel(Number.isFinite(item.priority) ? (item.priority as number) : 0)}</td>
                        <td>{formatSchedule(item.startsAt, item.endsAt)}</td>
                        <td>
                          <div className="rowActions">
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label="Изменить"
                              title="Изменить"
                              onClick={() => startEdit(item)}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label={visible ? "Скрыть" : "Показать"}
                              title={visible ? "Скрыть" : "Показать"}
                              onClick={() => void onToggleVisibility(item)}
                            >
                              {visible ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-danger"
                              aria-label="Удалить"
                              title="Удалить"
                              onClick={() => void onDelete(item)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing ? (
                        <tr>
                          <td colSpan={7}>{editor}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
