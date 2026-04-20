"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Timestamp, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { Calendar as CalendarIcon, Clock3, Tags, X } from "lucide-react";
import { db } from "../../../lib/firebase";
import { combineLocalDateTime, dateKeyToLocalDate, isTimeKey, localDateToDateKey, splitLocalDateTime } from "../../../lib/date-pickers";
import { useConfirmDialog } from "../../../components/ConfirmDialogProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminShell } from "../../../components/AdminShell";
import { ActionIconButton, EmptyState, FieldBlock, PageAlert, SectionCard, ToneBadge } from "../../../components/admin-kit";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../../components/Icons";
import { PromosTabs } from "../../../components/PromosTabs";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Calendar } from "../../../components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";

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
  const confirm = useConfirmDialog();

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
  const expiresAtParts = useMemo(() => splitLocalDateTime(draft.expiresAt), [draft.expiresAt]);
  const expiresAtDate = useMemo(() => dateKeyToLocalDate(expiresAtParts.dateKey), [expiresAtParts.dateKey]);

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
    const ok = await confirm({
      title: `Удалить промокод "${item.code}"?`,
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteDoc(doc(db, "promocodes", item.code));
    if (editingCode === item.code) cancelEdit();
    await loadPromoCodes();
  };

  const editor = (
    <Card className="border-border/80 bg-background/60">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">{isCreating ? "Новый промокод" : "Редактирование промокода"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 pt-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <div className="grid gap-4">
          <FieldBlock
            label="Код"
            description="Код виден публично и используется как ID документа. Не храните секретные значения."
          >
            <Input
              value={draft.code}
              onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="WELCOME"
              autoCapitalize="characters"
              disabled={!isCreating}
            />
          </FieldBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Статус">
              <NativeSelect
                value={draft.active ? "active" : "inactive"}
                onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.value === "active" }))}
              >
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
              </NativeSelect>
            </FieldBlock>
            <FieldBlock label="Тип">
              <NativeSelect
                value={draft.type}
                onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as PromoCodeType }))}
              >
                <option value="percent">Процент</option>
                <option value="fixed">Фикс</option>
              </NativeSelect>
            </FieldBlock>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label={draft.type === "percent" ? "Процент скидки" : "Скидка (₽)"}>
              <Input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
                min={0}
                step={1}
              />
            </FieldBlock>
            <FieldBlock label="Истекает" description="Оставьте пустым, если код бессрочный.">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      data-empty={!expiresAtDate || undefined}
                      className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                    >
                      <CalendarIcon data-icon="inline-start" />
                      {expiresAtDate ? <span>{format(expiresAtDate, "PPP", { locale: ru })}</span> : <span>Выберите дату</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto overflow-hidden p-0">
                    <Calendar
                      mode="single"
                      selected={expiresAtDate}
                      onSelect={(date) => {
                        if (!date) return;
                        const dateKey = localDateToDateKey(date);
                        const timeKey = expiresAtParts.timeKey || "00:00";
                        setDraft((prev) => ({ ...prev, expiresAt: combineLocalDateTime(dateKey, timeKey) }));
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
                    value={expiresAtParts.dateKey ? expiresAtParts.timeKey || "00:00" : ""}
                    disabled={!expiresAtParts.dateKey}
                    className="pl-9"
                    onChange={(event) => {
                      const nextTime = event.target.value;
                      if (!expiresAtParts.dateKey || !isTimeKey(nextTime)) return;
                      setDraft((prev) => ({ ...prev, expiresAt: combineLocalDateTime(expiresAtParts.dateKey, nextTime) }));
                    }}
                  />
                </div>
                {draft.expiresAt ? (
                  <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, expiresAt: "" }))}>
                    <X data-icon="inline-start" />
                    Очистить
                  </Button>
                ) : null}
              </div>
            </FieldBlock>
          </div>
        </div>

        <div className="grid gap-4">
          <SectionCard
            title="Превью"
            description="Короткая проверка публичного кода и скидки перед сохранением."
            className="h-fit border-none shadow-none"
            contentClassName="pt-0"
          >
            <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={draft.active ? "success" : "muted"}>{draft.active ? "Активен" : "Неактивен"}</ToneBadge>
                <Badge variant="outline">{draft.type === "fixed" ? "Фикс" : "%"}</Badge>
              </div>
              <div className="break-all text-lg font-semibold">{normalizePromoCode(draft.code) || "КОД"}</div>
              <div className="text-sm text-muted-foreground">
                Скидка: {draft.amount ? formatPromoAmount({ type: draft.type, amount: Number(draft.amount) }) : "-"}
              </div>
              <div className="text-sm text-muted-foreground">Истекает: {draft.expiresAt || "-"}</div>
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
  if (session.status === "signed_out")
    return <AdminLoginScreen title="Промокоды" subtitle="Войдите под админским аккаунтом" />;
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
        title="Промокоды"
        description="Управление кодами скидок из коллекции `promocodes`: статус, тип, сумма и срок действия."
        icon={Tags}
        tone="rose"
        actions={
          <>
            <Badge variant="outline">{sorted.length} шт.</Badge>
            <Badge variant="outline">promocodes</Badge>
            <Button type="button" variant="outline" onClick={startCreate} disabled={saving}>
              Добавить
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadPromoCodes()} disabled={loadingData || saving}>
              {loadingData ? "Обновление..." : "Обновить"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {isCreating ? editor : null}

          {sorted.length ? (
            <>
              <div className="grid gap-4 lg:hidden">
                {sorted.map((item) => {
                  const active = isActive(item.active);
                  const isEditing = editingCode === item.code;
                  const expiry = expiryLabel(item.expiresAt ?? null);

                  return (
                    <Card key={item.code} className="border-border/70 bg-background/70">
                      <CardHeader className="gap-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="grid gap-1">
                            <CardTitle className="break-all text-base">{item.code}</CardTitle>
                            <div className="text-sm text-muted-foreground">
                              {formatPromoAmount(item)}
                              {expiry !== "-" ? ` · до ${expiry}` : ""}
                            </div>
                          </div>
                          <ToneBadge tone={active ? "success" : "muted"}>{active ? "Активен" : "Неактивен"}</ToneBadge>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <FieldBlock label="Тип">
                            <div className="text-sm text-muted-foreground">{item.type === "fixed" ? "Фикс" : "Процент"}</div>
                          </FieldBlock>
                          <FieldBlock label="Истекает">
                            <div className="text-sm text-muted-foreground">{expiry}</div>
                          </FieldBlock>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <ActionIconButton type="button" aria-label="Изменить" title="Изменить" onClick={() => startEdit(item)}>
                            <PencilIcon />
                          </ActionIconButton>
                          <ActionIconButton
                            type="button"
                            aria-label={active ? "Отключить" : "Включить"}
                            title={active ? "Отключить" : "Включить"}
                            onClick={() => void onToggleActive(item)}
                          >
                            {active ? <EyeOffIcon /> : <EyeIcon />}
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
                      <TableHead>Код</TableHead>
                      <TableHead>Скидка</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Истекает</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((item) => {
                      const active = isActive(item.active);
                      const isEditing = editingCode === item.code;

                      return (
                        <Fragment key={item.code}>
                          <TableRow>
                            <TableCell className="break-all font-medium">{item.code}</TableCell>
                            <TableCell>{formatPromoAmount(item)}</TableCell>
                            <TableCell>
                              <ToneBadge tone={active ? "success" : "muted"}>{active ? "Активен" : "Неактивен"}</ToneBadge>
                            </TableCell>
                            <TableCell>{expiryLabel(item.expiresAt ?? null)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <ActionIconButton type="button" aria-label="Изменить" title="Изменить" onClick={() => startEdit(item)}>
                                  <PencilIcon />
                                </ActionIconButton>
                                <ActionIconButton
                                  type="button"
                                  aria-label={active ? "Отключить" : "Включить"}
                                  title={active ? "Отключить" : "Включить"}
                                  onClick={() => void onToggleActive(item)}
                                >
                                  {active ? <EyeOffIcon /> : <EyeIcon />}
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
                              <TableCell colSpan={5}>{editor}</TableCell>
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
              title="Пока нет промокодов"
              description="Создайте первый код скидки для сайта или рекламных кампаний."
              action={
                <Button type="button" onClick={startCreate}>
                  Добавить промокод
                </Button>
              }
            />
          )}
        </div>
      </SectionCard>
    </AdminShell>
  );
}
