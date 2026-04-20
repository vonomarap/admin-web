"use client";

import { type KeyboardEvent, Suspense, useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageSquareMore, Search, SendHorizontal, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { realtimeDb } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { EmptyState, FieldBlock, PageAlert, SectionCard, ToneBadge } from "../../components/admin-kit";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";

type SupportThreadStatus = "OPEN" | "CLOSED";

type SupportThread = {
  id: string;
  customerUid?: string;
  customerMode?: "authenticated" | "guest";
  guestProfile?: {
    name?: string;
    phone?: string;
    email?: string;
  } | null;
  customerName?: string | null;
  customerEmail?: string | null;
  status?: SupportThreadStatus;
  lastMessageText?: string | null;
  lastMessageAt?: unknown;
  lastMessageAuthorRole?: "customer" | "admin" | "system" | null;
  lastCustomerMessageAt?: unknown;
  lastAdminMessageAt?: unknown;
  customerSeenAt?: unknown;
  adminSeenAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SupportMessage = {
  id: string;
  authorUid?: string;
  authorRole?: "customer" | "admin" | "system";
  text?: string;
  createdAt?: unknown;
};

type ThreadStatusFilter = "ALL" | SupportThreadStatus;
type ThreadUnreadFilter = "ALL" | "UNREAD";

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
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === "function") {
      try {
        const ms = maybe.toMillis();
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

function formatDateTime(value: unknown): string {
  const ms = toMillis(value);
  if (ms === null) return "-";
  return new Date(ms).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUnreadByAdmin(thread: SupportThread): boolean {
  const lastCustomerMessageAt = toMillis(thread.lastCustomerMessageAt);
  if (lastCustomerMessageAt === null) return false;
  const adminSeenAt = toMillis(thread.adminSeenAt);
  return adminSeenAt === null || lastCustomerMessageAt > adminSeenAt;
}

function customerLabel(thread: SupportThread): string {
  if (thread.customerMode === "guest") {
    const name = thread.guestProfile?.name?.trim();
    const phone = thread.guestProfile?.phone?.trim();
    const email = thread.guestProfile?.email?.trim();
    return [name, phone, email].filter(Boolean).join(" · ") || "Гость";
  }

  return thread.customerName?.trim() || thread.customerEmail?.trim() || thread.customerUid?.trim() || "Клиент";
}

function customerMeta(thread: SupportThread): string {
  if (thread.customerMode === "guest") {
    return "Гостевой диалог";
  }
  return thread.customerEmail?.trim() || thread.customerUid?.trim() || "Авторизованный клиент";
}

function customerInitial(thread: SupportThread): string {
  const source = customerLabel(thread).replace(/\s+/g, " ").trim();
  return source ? source.slice(0, 1).toUpperCase() : "К";
}

function channelLabel(thread: SupportThread): string {
  return thread.customerMode === "guest" ? "Гость" : "Аккаунт";
}

function statusLabel(status: SupportThreadStatus | undefined): string {
  return status === "CLOSED" ? "Закрыт" : "Открыт";
}

function lastAuthorLabel(thread: SupportThread): string {
  switch (thread.lastMessageAuthorRole) {
    case "admin":
      return "Последний ответ: админ";
    case "system":
      return "Последнее: система";
    case "customer":
      return "Последнее: клиент";
    default:
      return "Новый диалог";
  }
}

function messageAuthorLabel(message: SupportMessage, thread: SupportThread): string {
  if (message.authorRole === "system") return "Система";
  if (message.authorRole === "admin") return "Оператор";
  return customerLabel(thread);
}

function normalizeComposerMessage(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .trim()
    .slice(0, 4000);
}

function clipPreview(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Без сообщений";
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 119)}…`;
}

function threadSortValue(thread: SupportThread): number {
  return toMillis(thread.updatedAt) ?? toMillis(thread.lastMessageAt) ?? toMillis(thread.createdAt) ?? 0;
}

export default function SupportPage(): JSX.Element {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SupportInner />
    </Suspense>
  );
}

function SupportInner(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsReady, setThreadsReady] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>("ALL");
  const [unreadFilter, setUnreadFilter] = useState<ThreadUnreadFilter>("ALL");
  const [isSplitView, setIsSplitView] = useState(false);

  const selectedThreadId = useMemo(() => {
    const raw = searchParams.get("threadId");
    return typeof raw === "string" ? raw.trim() : "";
  }, [searchParams]);
  const detailViewRequested = useMemo(() => searchParams.get("view") === "thread", [searchParams]);
  const showThreadDetailOnly = detailViewRequested && !isSplitView;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const syncSplitView = () => setIsSplitView(media.matches);

    syncSplitView();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncSplitView);
      return () => media.removeEventListener("change", syncSplitView);
    }

    media.addListener(syncSplitView);
    return () => media.removeListener(syncSplitView);
  }, []);

  useEffect(() => {
    if (session.status !== "ready" || !realtimeDb) {
      setThreadsReady(false);
      return;
    }

    setThreadsLoading(true);
    setThreadsReady(false);
    setLoadError(null);
    const unsubscribe = onSnapshot(
      query(collection(realtimeDb, "support_threads"), orderBy("updatedAt", "desc"), limit(200)),
      (snapshot) => {
        const nextThreads = snapshot.docs
          .map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<SupportThread, "id">) }))
          .sort((left, right) => threadSortValue(right) - threadSortValue(left));
        setThreads(nextThreads);
        setThreadsLoading(false);
        setThreadsReady(true);
      },
      (error) => {
        console.error("Support thread subscription failed:", error);
        setLoadError(error instanceof Error ? error.message : String(error));
        setThreadsLoading(false);
        setThreadsReady(true);
      },
    );

    return unsubscribe;
  }, [session.status]);

  const filteredThreads = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return threads.filter((thread) => {
      if (statusFilter !== "ALL" && thread.status !== statusFilter) return false;
      if (unreadFilter === "UNREAD" && !isUnreadByAdmin(thread)) return false;
      if (!q) return true;

      const haystack = [
        thread.id,
        thread.customerUid,
        thread.customerName,
        thread.customerEmail,
        thread.guestProfile?.name,
        thread.guestProfile?.phone,
        thread.guestProfile?.email,
        thread.lastMessageText,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [queryText, statusFilter, threads, unreadFilter]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return filteredThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  }, [filteredThreads, selectedThreadId]);

  useEffect(() => {
    if (session.status !== "ready" || !realtimeDb || !selectedThread?.id) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(realtimeDb, "support_threads", selectedThread.id, "messages"), orderBy("createdAt", "asc"), limit(500)),
      (snapshot) => {
        setMessages(snapshot.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<SupportMessage, "id">) })));
        setMessagesLoading(false);
      },
      (error) => {
        console.error("Support messages subscription failed:", error);
        setLoadError(error instanceof Error ? error.message : String(error));
        setMessagesLoading(false);
      },
    );

    return unsubscribe;
  }, [selectedThread?.id, session.status]);

  useEffect(() => {
    if (!selectedThread?.id || !realtimeDb) return;
    if (!isUnreadByAdmin(selectedThread)) return;

    void updateDoc(doc(realtimeDb, "support_threads", selectedThread.id), {
      adminSeenAt: serverTimestamp(),
    }).catch((error) => {
      console.error("Support mark seen failed:", error);
    });
  }, [selectedThread?.adminSeenAt, selectedThread?.id, selectedThread?.lastCustomerMessageAt]);

  useEffect(() => {
    if (!threadsReady) return;
    if (!selectedThread && selectedThreadId) {
      router.replace("/support");
    }
  }, [router, selectedThread, selectedThreadId, threadsReady]);

  const unreadCount = useMemo(() => threads.reduce((count, thread) => count + (isUnreadByAdmin(thread) ? 1 : 0), 0), [threads]);
  const openCount = useMemo(() => threads.reduce((count, thread) => count + (thread.status === "OPEN" ? 1 : 0), 0), [threads]);
  const composerDisabled = sending || selectedThread?.status === "CLOSED";
  const canSend = Boolean(selectedThread?.id) && !composerDisabled && messageDraft.trim().length > 0;
  const composerPlaceholder = selectedThread?.status === "CLOSED" ? "Сначала переоткройте диалог" : "Напишите ответ…";
  const hasFilters = queryText.trim().length > 0 || statusFilter !== "ALL" || unreadFilter !== "ALL";
  const selectedThreadUnread = selectedThread ? isUnreadByAdmin(selectedThread) : false;
  const supportInboxHref = "/support";

  const buildThreadHref = (threadId: string, detailOnly: boolean): string => {
    const params = new URLSearchParams({ threadId });
    if (detailOnly) {
      params.set("view", "thread");
    }
    return `/support?${params.toString()}`;
  };

  const selectThread = (threadId: string) => {
    const href = buildThreadHref(threadId, !isSplitView);
    if (isSplitView) {
      router.replace(href);
      return;
    }
    router.push(href);
  };

  const closeThreadDetail = () => {
    router.push(supportInboxHref);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!canSend) return;
    void onSend();
  };

  const onToggleThreadStatus = async () => {
    if (!selectedThread?.id || !realtimeDb) return;
    const nextStatus: SupportThreadStatus = selectedThread.status === "CLOSED" ? "OPEN" : "CLOSED";
    await updateDoc(doc(realtimeDb, "support_threads", selectedThread.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  };

  const onSend = async () => {
    if (!selectedThread?.id || !realtimeDb || !session.user?.uid) return;
    const text = normalizeComposerMessage(messageDraft);
    if (!text) return;

    setSending(true);
    try {
      await addDoc(collection(realtimeDb, "support_threads", selectedThread.id, "messages"), {
        authorUid: session.user.uid,
        authorRole: "admin",
        text,
        createdAt: serverTimestamp(),
      });
      setMessageDraft("");
    } finally {
      setSending(false);
    }
  };

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Поддержка" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Поддержка"
      subtitle="Общий inbox клиентских диалогов"
      rightActions={
        <>
          <ToneBadge tone="outline">Открытых: {openCount}</ToneBadge>
          <ToneBadge tone={unreadCount ? "success" : "muted"}>Непрочитанных: {unreadCount}</ToneBadge>
        </>
      }
    >
      {loadError ? <PageAlert title="Ошибка realtime-подписки" description={loadError} /> : null}

      {!showThreadDetailOnly ? (
        <SectionCard
          eyebrow="Фильтры"
          title="Очередь поддержки"
          description="Поиск по клиенту, контактам, тексту и состоянию диалога."
          icon={Search}
          tone="amber"
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQueryText("");
                setStatusFilter("ALL");
                setUnreadFilter("ALL");
              }}
            >
              Сбросить
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <FieldBlock label="Поиск">
              <Input
                placeholder="ID, имя, телефон, email, текст..."
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
              />
            </FieldBlock>
            <FieldBlock label="Статус">
              <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ThreadStatusFilter)}>
                <option value="ALL">Все</option>
                <option value="OPEN">Открытые</option>
                <option value="CLOSED">Закрытые</option>
              </NativeSelect>
            </FieldBlock>
            <FieldBlock label="Непрочитанные">
              <NativeSelect value={unreadFilter} onChange={(event) => setUnreadFilter(event.target.value as ThreadUnreadFilter)}>
                <option value="ALL">Все</option>
                <option value="UNREAD">Только новые</option>
              </NativeSelect>
            </FieldBlock>
          </div>
        </SectionCard>
      ) : null}

      <div className={cn("grid min-w-0 gap-6", showThreadDetailOnly ? "" : "xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]")}>
        {!showThreadDetailOnly ? (
          <SectionCard
            className="min-w-0"
            contentClassName="min-w-0"
            eyebrow="Inbox"
            title="Диалоги"
            description={threadsLoading ? "Подключаем realtime..." : `${filteredThreads.length} диалог(ов) в рабочей очереди`}
            icon={MessageSquareMore}
            tone="amber"
            actions={<ToneBadge tone={hasFilters ? "secondary" : "muted"}>{hasFilters ? "Фильтр активен" : "Все диалоги"}</ToneBadge>}
          >
            {filteredThreads.length === 0 ? (
              <EmptyState title="Пока нет диалогов" description="Новые клиентские чаты появятся здесь автоматически." />
            ) : (
              <ScrollArea className="h-[min(70vh,42rem)] pr-1">
                <div className="grid gap-3 pr-3">
                  {filteredThreads.map((thread) => {
                    const active = thread.id === selectedThread?.id;
                    const unread = isUnreadByAdmin(thread);
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => selectThread(thread.id)}
                        className={cn(
                          "grid min-w-0 gap-3 rounded-2xl border px-4 py-4 text-left transition-colors",
                          active
                            ? "border-primary/60 bg-primary/5 shadow-sm"
                            : "border-border/70 bg-background/70 hover:bg-muted/35",
                          unread ? "ring-1 ring-emerald-500/45 dark:ring-emerald-400/25" : ""
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar className="size-11 rounded-2xl">
                            <AvatarFallback className="rounded-2xl bg-muted text-sm font-semibold text-foreground">
                              {customerInitial(thread)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid min-w-0 flex-1 gap-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="grid min-w-0 gap-1">
                                <div className="break-words font-medium">{customerLabel(thread)}</div>
                                <div className="break-words text-xs text-muted-foreground">{customerMeta(thread)}</div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <ToneBadge tone="outline">{channelLabel(thread)}</ToneBadge>
                                <ToneBadge tone={thread.status === "CLOSED" ? "muted" : "success"}>
                                  {statusLabel(thread.status)}
                                </ToneBadge>
                              </div>
                            </div>
                            <div className="break-words text-sm text-muted-foreground">{clipPreview(thread.lastMessageText)}</div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap gap-2">
                                <ToneBadge tone="muted">{lastAuthorLabel(thread)}</ToneBadge>
                                {unread ? <ToneBadge tone="success">Ждёт ответа</ToneBadge> : null}
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground">
                                {formatDateTime(thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </SectionCard>
        ) : null}

        <SectionCard
          className={cn("min-w-0", showThreadDetailOnly ? "" : "hidden xl:block")}
          contentClassName="min-w-0"
          eyebrow={showThreadDetailOnly ? "Диалог" : "Рабочая зона"}
          title={selectedThread ? customerLabel(selectedThread) : showThreadDetailOnly ? "Диалог не найден" : "Диалог не выбран"}
          icon={User}
          tone="amber"
          description={
            selectedThread
              ? customerMeta(selectedThread)
              : showThreadDetailOnly
                ? "Вернитесь к списку и откройте чат заново."
                : "Выберите чат слева, чтобы открыть рабочую зону."
          }
          actions={
            showThreadDetailOnly || selectedThread ? (
              <>
                {showThreadDetailOnly ? (
                  <Button type="button" variant="outline" onClick={closeThreadDetail}>
                    Назад
                  </Button>
                ) : null}
                {selectedThread ? (
                  <>
                    <ToneBadge tone={selectedThread.status === "CLOSED" ? "muted" : "success"}>
                      {statusLabel(selectedThread.status)}
                    </ToneBadge>
                    <ToneBadge tone={selectedThreadUnread ? "success" : "muted"}>
                      {selectedThreadUnread ? "Ждёт ответа" : "Просмотрен"}
                    </ToneBadge>
                    <Button type="button" variant="outline" onClick={() => void onToggleThreadStatus()}>
                      {selectedThread.status === "CLOSED" ? "Переоткрыть" : "Закрыть"}
                    </Button>
                  </>
                ) : null}
              </>
            ) : null
          }
        >
          {selectedThread ? (
            <div className="grid min-w-0 gap-5 rounded-[1.75rem] border border-border/70 bg-muted/30 p-4 sm:p-5">
              <div className="grid gap-4 rounded-[1.5rem] border border-border/70 bg-background/85 p-4 shadow-xs">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar className="size-12 rounded-2xl">
                    <AvatarFallback className="rounded-2xl bg-muted text-sm font-semibold text-foreground">
                      {customerInitial(selectedThread)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-base font-semibold text-foreground">{customerLabel(selectedThread)}</span>
                      <ToneBadge tone="outline">{channelLabel(selectedThread)}</ToneBadge>
                      <ToneBadge tone={selectedThreadUnread ? "success" : "muted"}>
                        {selectedThreadUnread ? "Ждёт ответа" : "Диалог просмотрен"}
                      </ToneBadge>
                    </div>
                    <div className="break-words text-sm text-muted-foreground">{customerMeta(selectedThread)}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">ID диалога</div>
                    <div className="mt-1 break-words text-sm font-medium text-foreground">{selectedThread.id}</div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Последняя активность</div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {formatDateTime(selectedThread.updatedAt ?? selectedThread.lastMessageAt ?? selectedThread.createdAt)}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Канал</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{channelLabel(selectedThread)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-background/78 p-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="grid gap-1">
                    <div className="text-sm font-semibold text-foreground">Переписка с клиентом</div>
                    <div className="text-xs text-muted-foreground">Более новые сообщения ниже. Ответы оператора выделены отдельно.</div>
                  </div>
                  <ToneBadge tone={messages.length ? "outline" : "muted"}>
                    {messages.length ? `${messages.length} сообщ.` : "Сообщений нет"}
                  </ToneBadge>
                </div>

                <ScrollArea className="h-[min(58vh,40rem)] rounded-[1.35rem] border border-border/70 bg-muted/35">
                  <div className="grid gap-3 p-4">
                    {messagesLoading ? (
                      <EmptyState title="Загружаем сообщения..." />
                    ) : messages.length === 0 ? (
                      <EmptyState title="Сообщений пока нет" description="Первое сообщение клиента появится здесь автоматически." />
                    ) : (
                      messages.map((message) => {
                        const isAdmin = message.authorRole === "admin";
                        const isSystem = message.authorRole === "system";

                        return (
                          <div
                            key={message.id}
                            className={cn("flex min-w-0", isAdmin ? "justify-end" : "justify-start", isSystem ? "justify-center" : "")}
                          >
                            <div
                              className={cn(
                                "grid min-w-0 max-w-[92%] gap-2 rounded-[1.35rem] border px-4 py-3 shadow-sm md:max-w-[82%]",
                                isSystem
                                  ? "border-border/80 bg-muted/80 text-center"
                                  : isAdmin
                                    ? "border-primary/25 bg-primary/[0.11]"
                                    : "border-border/80 bg-background"
                              )}
                            >
                              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11px] leading-4 text-muted-foreground">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={cn(
                                      "inline-flex shrink-0 rounded-full px-2 py-0.5 font-medium",
                                      isSystem
                                        ? "bg-background/60 text-muted-foreground"
                                        : isAdmin
                                          ? "bg-primary/10 text-primary"
                                          : "bg-muted text-foreground/80"
                                    )}
                                  >
                                    {messageAuthorLabel(message, selectedThread)}
                                  </span>
                                </div>
                                <span className="shrink-0">{formatDateTime(message.createdAt)}</span>
                              </div>
                              <p className="break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                {message.text || "—"}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="grid gap-4 rounded-[1.5rem] border border-border/70 bg-background/82 p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="text-sm font-semibold text-foreground">Ответ клиенту</div>
                    <div className="text-xs text-muted-foreground">Сообщение уйдёт в чат клиента сразу после отправки.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ToneBadge tone={composerDisabled ? "muted" : "success"}>
                      {composerDisabled ? "Диалог закрыт" : "Можно отвечать"}
                    </ToneBadge>
                    <ToneBadge tone="outline">Enter отправляет • Shift+Enter переносит строку</ToneBadge>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-[1.45rem] border p-3 shadow-xs transition-colors",
                    composerDisabled
                      ? "border-border/70 bg-muted/35"
                      : "border-border/80 bg-muted/45 focus-within:border-primary/45 focus-within:bg-background"
                  )}
                >
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Сообщение оператора
                      </div>
                      <textarea
                        rows={4}
                        placeholder={composerPlaceholder}
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        onKeyDown={onComposerKeyDown}
                        disabled={composerDisabled}
                        className={cn(
                          "min-h-[112px] max-h-[220px] w-full resize-y bg-transparent px-1 py-1 text-left text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground",
                          "disabled:cursor-not-allowed"
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      className={cn(
                        "size-14 shrink-0 self-end rounded-full border shadow-sm disabled:opacity-100",
                        canSend
                          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/92"
                          : "border-border bg-background text-muted-foreground"
                      )}
                      onClick={() => void onSend()}
                      disabled={!canSend}
                      aria-label={sending ? "Отправляем..." : "Отправить сообщение"}
                      title={sending ? "Отправляем..." : "Отправить сообщение"}
                    >
                      {sending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title={showThreadDetailOnly ? "Диалог не найден" : "Выберите диалог"}
              description={
                showThreadDetailOnly
                  ? "Вернитесь к очереди поддержки и откройте нужный чат заново."
                  : "Откройте чат слева, чтобы начать работу с перепиской."
              }
            />
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}
