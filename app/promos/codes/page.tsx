"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Timestamp, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminShell } from "../../../components/AdminShell";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../../components/Icons";
import { PromosTabs } from "../../../components/PromosTabs";

type PromoCodeType = "percent" | "fixed";

type PromoCodeDocRaw = {
  active?: unknown;
  type?: unknown;
  amount?: unknown;
  expiresAt?: unknown;
  usageLimit?: unknown;
  usedCount?: unknown;
};

type PromoCode = {
  code: string;
  active: boolean;
  type: PromoCodeType;
  amount: number;
  expiresAt: Timestamp | null;
  usageLimit?: number;
  usedCount?: number;
};

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;

function isActive(active?: boolean): boolean {
  return active === true;
}

function asLocalDateTime(value?: Timestamp | null): string {
  if (!value) return "";
  const date = value.toDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toMillis(input: unknown): number | null {
  if (!input) return null;

  if (input instanceof Timestamp) {
    return input.toMillis();
  }

  if (typeof input === "string") {
    const parsed = Date.parse(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (typeof input === "object") {
    const value = input as { toMillis?: () => number; seconds?: number };
    if (typeof value.toMillis === "function") {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value.seconds === "number") {
      return value.seconds * 1000;
    }
  }

  return null;
}

function toTimestampOrNull(input: unknown): Timestamp | null {
  const ms = toMillis(input);
  if (ms === null) return null;
  return Timestamp.fromDate(new Date(ms));
}

function parseLocalDateTime(value: string): Timestamp | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return Timestamp.fromDate(date);
}

function normalizePromoCode(value: string): string {
  return (value || "").trim().toUpperCase();
}

function formatPromoAmount(item: Pick<PromoCode, "type" | "amount">): string {
  const amount = Number(item.amount) || 0;
  if (item.type === "fixed") return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
  return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function expiryLabel(expiresAt?: Timestamp | null): string {
  if (!expiresAt) return "-";
  return expiresAt.toDate().toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function sanitizeCodeForFirestore(input: {
  active: boolean;
  type: PromoCodeType;
  amount: number;
  expiresAt: Timestamp | null;
  isNew: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    active: input.active,
    type: input.type,
    amount: input.amount,
    expiresAt: input.expiresAt,
    updatedAt: serverTimestamp(),
  };

  if (input.isNew) out.createdAt = serverTimestamp();
  return out;
}

export default function PromoCodesPage(): JSX.Element {
  const session = useAdminSession();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [codes, setCodes] = useState<PromoCode[]>([]);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    code: "",
    active: true,
    type: "percent" as PromoCodeType,
    amount: "10",
    expiresAt: "",
  });

  const sorted = useMemo(() => {
    return [...codes].sort((a, b) => a.code.localeCompare(b.code, "en", { sensitivity: "base" }));
  }, [codes]);

  const isCreating = editingCode === "__new__";

  const loadPromoCodes = useCallback(async () => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const snap = await getDocs(collection(db, "promocodes"));
      const next: PromoCode[] = snap.docs.map((docRef) => {
        const raw = (docRef.data() as PromoCodeDocRaw) ?? {};
        return {
          code: docRef.id,
          active: raw.active === true,
          type: raw.type === "fixed" ? "fixed" : "percent",
          amount: Number.isFinite(Number(raw.amount)) ? Number(raw.amount) : 0,
          expiresAt: toTimestampOrNull(raw.expiresAt),
          usageLimit: typeof raw.usageLimit === "number" ? raw.usageLimit : undefined,
          usedCount: typeof raw.usedCount === "number" ? raw.usedCount : undefined,
        };
      });
      setCodes(next);
    } catch (error) {
      console.error("Admin loadPromoCodes failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadPromoCodes();
  }, [loadPromoCodes, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadPromoCodes();
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
  }, [loadPromoCodes, loadingData, session.status]);

  const startCreate = () => {
    setDraftError(null);
    setEditingCode("__new__");
    setDraft({
      code: "",
      active: true,
      type: "percent",
      amount: "10",
      expiresAt: "",
    });
  };

  const startEdit = (item: PromoCode) => {
    setDraftError(null);
    setEditingCode(item.code);
    setDraft({
      code: item.code,
      active: isActive(item.active),
      type: item.type === "fixed" ? "fixed" : "percent",
      amount: String(Number(item.amount) || 0),
      expiresAt: asLocalDateTime(item.expiresAt ?? null),
    });
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setDraftError(null);
  };

  const onSave = async () => {
    if (!db || !editingCode) return;

    const code = isCreating ? normalizePromoCode(draft.code) : editingCode;
    if (!code || !CODE_RE.test(code)) {
      setDraftError("Код обязателен. Разрешено: A–Z, 0–9, _ и -. Длина: 2–32.");
      return;
    }

    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDraftError("Сумма/процент должны быть больше нуля.");
      return;
    }

    if (draft.type === "percent" && (amount < 1 || amount > 100)) {
      setDraftError("Процент должен быть от 1 до 100.");
      return;
    }

    const expiresAt = parseLocalDateTime(draft.expiresAt);

    setSaving(true);
    setDraftError(null);
    try {
      const isNew = !codes.some((c) => c.code === code);
      await setDoc(
        doc(db, "promocodes", code),
        sanitizeCodeForFirestore({ active: draft.active, type: draft.type, amount, expiresAt, isNew }),
        {
          merge: true,
        }
      );
      setEditingCode(null);
      await loadPromoCodes();
    } catch (error) {
      console.error("Promo code save failed:", error);
      setDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (item: PromoCode) => {
    if (!db) return;
    await setDoc(
      doc(db, "promocodes", item.code),
      {
        active: !isActive(item.active),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await loadPromoCodes();
  };

  const onDelete = async (item: PromoCode) => {
    if (!db) return;
    const ok = confirm(`Удалить промокод "${item.code}"? Это действие необратимо.`);
    if (!ok) return;
    await deleteDoc(doc(db, "promocodes", item.code));
    if (editingCode === item.code) cancelEdit();
    await loadPromoCodes();
  };

  const editor = (
    <div className="editPanel">
      <div className="editGrid">
        <div className="grid" style={{ gap: 10 }}>
          <label className="field">
            <div className="fieldLabel">Код</div>
            <input
              value={draft.code}
              onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="WELCOME"
              autoCapitalize="characters"
              disabled={!isCreating}
            />
            <small>Код будет доступен публично (только get по ID). Не храните здесь секреты.</small>
          </label>

          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <div className="fieldLabel">Статус</div>
              <select
                value={draft.active ? "active" : "inactive"}
                onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.value === "active" }))}
              >
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
              </select>
            </label>
            <label className="field">
              <div className="fieldLabel">Тип</div>
              <select
                value={draft.type}
                onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as PromoCodeType }))}
              >
                <option value="percent">Процент</option>
                <option value="fixed">Фикс</option>
              </select>
            </label>
          </div>

          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <div className="fieldLabel">{draft.type === "percent" ? "Процент скидки" : "Скидка (₽)"}</div>
              <input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
                min={0}
                step={draft.type === "percent" ? 1 : 1}
              />
            </label>
            <label className="field">
              <div className="fieldLabel">Истекает (необязательно)</div>
              <input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(e) => setDraft((prev) => ({ ...prev, expiresAt: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="grid" style={{ gap: 10 }}>
          <h3 style={{ marginBottom: 0 }}>Превью</h3>
          <div className="card" style={{ padding: 14, display: "grid", gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span className={draft.active ? "badge badge-status-active" : "badge badge-status-hidden"}>
                {draft.active ? "Активен" : "Неактивен"}
              </span>
              <span className="badge badge-muted">{draft.type === "fixed" ? "Фикс" : "%"}</span>
            </div>
            <b className="breakLong">{normalizePromoCode(draft.code) || "КОД"}</b>
            <small>Скидка: {draft.amount ? formatPromoAmount({ type: draft.type, amount: Number(draft.amount) }) : "-"}</small>
            <small>Истекает: {draft.expiresAt ? draft.expiresAt : "-"}</small>
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
  if (session.status === "signed_out")
    return <AdminLoginScreen title="Промокоды" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Акции"
      subtitle={session.user?.email ?? ""}
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
            <h2>Промокоды</h2>
            <small>{sorted.length} шт.</small>
          </div>
          <div className="rowActions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={startCreate} disabled={saving}>
              Добавить
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void loadPromoCodes()}
              disabled={loadingData || saving}
            >
              {loadingData ? "Обновление..." : "Обновить"}
            </button>
          </div>
        </div>
        <small>Данные: Firestore → promocodes</small>

        {isCreating ? <div style={{ marginTop: 12 }}>{editor}</div> : null}

        <div className="mobileOnly" style={{ marginTop: 12 }}>
          {sorted.length ? (
            <div className="cardList">
              {sorted.map((item) => {
                const active = isActive(item.active);
                const isEditing = editingCode === item.code;
                const expiry = expiryLabel(item.expiresAt ?? null);

                return (
                  <div key={item.code} className="itemCard">
                    <div className="itemHeader">
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b className="breakLong">{item.code}</b>
                        <small>
                          {formatPromoAmount(item)}
                          {expiry !== "-" ? ` · до ${expiry}` : ""}
                        </small>
                      </div>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span className={active ? "badge badge-status-active" : "badge badge-status-hidden"}>
                          {active ? "Активен" : "Неактивен"}
                        </span>
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
                        aria-label={active ? "Отключить" : "Включить"}
                        title={active ? "Отключить" : "Включить"}
                        onClick={() => void onToggleActive(item)}
                      >
                        {active ? <EyeOffIcon /> : <EyeIcon />}
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
            <small>Пока нет промокодов. Нажми “Добавить”.</small>
          )}
        </div>

        <div className="desktopOnly" style={{ marginTop: 12 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Скидка</th>
                  <th>Статус</th>
                  <th>Истекает</th>
                  <th className="actionsCol">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const active = isActive(item.active);
                  const isEditing = editingCode === item.code;

                  return (
                    <Fragment key={item.code}>
                      <tr>
                        <td className="breakLong">
                          <b>{item.code}</b>
                        </td>
                        <td>{formatPromoAmount(item)}</td>
                        <td>
                          <span className={active ? "badge badge-status-active" : "badge badge-status-hidden"}>
                            {active ? "Активен" : "Неактивен"}
                          </span>
                        </td>
                        <td>{expiryLabel(item.expiresAt ?? null)}</td>
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
                              aria-label={active ? "Отключить" : "Включить"}
                              title={active ? "Отключить" : "Включить"}
                              onClick={() => void onToggleActive(item)}
                            >
                              {active ? <EyeOffIcon /> : <EyeIcon />}
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
                          <td colSpan={5}>{editor}</td>
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
