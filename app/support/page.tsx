"use client";

import { type KeyboardEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { realtimeDb } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { SendIcon } from "../../components/Icons";

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
  if (message.authorRole === "admin") return "Админ";
  return customerLabel(thread);
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
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>("ALL");
  const [unreadFilter, setUnreadFilter] = useState<ThreadUnreadFilter>("ALL");

  const selectedThreadId = useMemo(() => {
    const raw = searchParams.get("threadId");
    return typeof raw === "string" ? raw.trim() : "";
  }, [searchParams]);

  useEffect(() => {
    if (session.status !== "ready" || !realtimeDb) return;

    setThreadsLoading(true);
    setLoadError(null);
    const unsubscribe = onSnapshot(
      query(collection(realtimeDb, "support_threads"), orderBy("updatedAt", "desc"), limit(200)),
      (snapshot) => {
        const nextThreads = snapshot.docs
          .map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<SupportThread, "id">) }))
          .sort((left, right) => threadSortValue(right) - threadSortValue(left));
        setThreads(nextThreads);
        setThreadsLoading(false);
      },
      (error) => {
        console.error("Support thread subscription failed:", error);
        setLoadError(error instanceof Error ? error.message : String(error));
        setThreadsLoading(false);
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
    if (!filteredThreads.length) return null;
    if (selectedThreadId) {
      return filteredThreads.find((thread) => thread.id === selectedThreadId) ?? null;
    }
    return filteredThreads[0] ?? null;
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
    if (!selectedThread && selectedThreadId) {
      router.replace("/support");
    }
  }, [router, selectedThread, selectedThreadId]);

  const unreadCount = useMemo(() => threads.reduce((count, thread) => count + (isUnreadByAdmin(thread) ? 1 : 0), 0), [threads]);
  const openCount = useMemo(() => threads.reduce((count, thread) => count + (thread.status === "OPEN" ? 1 : 0), 0), [threads]);
  const composerDisabled = sending || selectedThread?.status === "CLOSED";
  const canSend = !composerDisabled && messageDraft.trim().length > 0;
  const composerPlaceholder = selectedThread?.status === "CLOSED" ? "Сначала переоткройте диалог" : "Напишите ответ…";
  const hasFilters = queryText.trim().length > 0 || statusFilter !== "ALL" || unreadFilter !== "ALL";
  const selectedThreadUnread = selectedThread ? isUnreadByAdmin(selectedThread) : false;

  const selectThread = (threadId: string) => {
    router.replace(`/support?threadId=${encodeURIComponent(threadId)}`);
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
    const text = messageDraft.replace(/\s+/g, " ").trim().slice(0, 4000);
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
          <span className="badge">Открытых: {openCount}</span>
          <span className="badge badge-new">Непрочитанных: {unreadCount}</span>
        </>
      }
    >
      {loadError ? <div className="errorBox">{loadError}</div> : null}

      <div className="supportOpsStrip">
        <div className="card supportOpsCard">
          <span className="supportOpsLabel">Режим</span>
          <strong>{threadsLoading ? "Подключаем realtime…" : "Realtime inbox"}</strong>
          <small>Операторская очередь собирает диалоги с сайта и приложения в одном рабочем окне.</small>
        </div>
        <div className="card supportOpsCard supportOpsCard-accent">
          <span className="supportOpsLabel">В выборке</span>
          <strong>{filteredThreads.length}</strong>
          <small>{hasFilters ? "С учетом поиска и фильтров." : "Без активных ограничений по очереди."}</small>
        </div>
        <div className="card supportOpsCard">
          <span className="supportOpsLabel">Фокус</span>
          <strong className="breakLong">{selectedThread ? customerLabel(selectedThread) : "Диалог не выбран"}</strong>
          <small>{selectedThread ? `${statusLabel(selectedThread.status)} · ${channelLabel(selectedThread)}` : "Выберите чат слева, чтобы открыть рабочую зону."}</small>
        </div>
      </div>

      <div className="card supportInboxFilters">
        <label className="field">
          <span className="fieldLabel">Поиск</span>
          <input
            placeholder="ID, имя, телефон, email, текст…"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="fieldLabel">Статус</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ThreadStatusFilter)}>
            <option value="ALL">Все</option>
            <option value="OPEN">Открытые</option>
            <option value="CLOSED">Закрытые</option>
          </select>
        </label>
        <label className="field">
          <span className="fieldLabel">Непрочитанные</span>
          <select value={unreadFilter} onChange={(event) => setUnreadFilter(event.target.value as ThreadUnreadFilter)}>
            <option value="ALL">Все</option>
            <option value="UNREAD">Только новые</option>
          </select>
        </label>
        <div className="supportFiltersFooter">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setQueryText("");
              setStatusFilter("ALL");
              setUnreadFilter("ALL");
            }}
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="supportInboxLayout">
        <section className="card supportThreadsPanel">
          <div className="supportPanelHeader">
            <div>
              <span className="supportPanelEyebrow">Inbox</span>
              <h2>Диалоги</h2>
              <small>{threadsLoading ? "Подключаем realtime…" : `${filteredThreads.length} диалог(ов) в рабочей очереди`}</small>
            </div>
            <div className="supportPanelHeaderMeta">
              <span className="supportPill supportPill-neutral">{hasFilters ? "Фильтр активен" : "Все диалоги"}</span>
            </div>
          </div>

          <div className="supportThreadList">
            {filteredThreads.length === 0 ? (
              <div className="supportEmptyState">
                <strong>Пока нет диалогов</strong>
                <small>Новые клиентские чаты появятся здесь автоматически.</small>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const active = thread.id === selectedThread?.id;
                const unread = isUnreadByAdmin(thread);
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`supportThreadItem ${active ? "supportThreadItem-active" : ""} ${unread ? "supportThreadItem-unread" : ""}`}
                    onClick={() => selectThread(thread.id)}
                  >
                    <div className="supportThreadAvatar" aria-hidden="true">
                      {customerInitial(thread)}
                    </div>
                    <div className="supportThreadBody">
                      <div className="supportThreadTop">
                        <div className="supportThreadHeadline">
                          <strong className="breakLong">{customerLabel(thread)}</strong>
                          <small className="breakLong">{customerMeta(thread)}</small>
                        </div>
                        <div className="supportThreadFlags">
                          <span className="supportPill supportPill-ghost">{channelLabel(thread)}</span>
                          <span className={`supportPill ${thread.status === "CLOSED" ? "supportPill-muted" : "supportPill-open"}`}>
                            {statusLabel(thread.status)}
                          </span>
                        </div>
                      </div>

                      <div className="supportThreadPreview breakLong">{clipPreview(thread.lastMessageText)}</div>

                      <div className="supportThreadBottom">
                        <div className="supportThreadSignals">
                          <span className="supportPill supportPill-neutral">{lastAuthorLabel(thread)}</span>
                          {unread ? <span className="supportPill supportPill-unread">Ждёт ответа</span> : null}
                        </div>
                        <small>{formatDateTime(thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt)}</small>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="card supportConversationPanel">
          {selectedThread ? (
            <>
              <div className="supportConversationHero">
                <div className="supportConversationIdentity">
                  <div className="supportConversationAvatar" aria-hidden="true">
                    {customerInitial(selectedThread)}
                  </div>
                  <div className="supportConversationIdentityText">
                    <span className="supportPanelEyebrow">Рабочая зона</span>
                    <h2 className="breakLong">{customerLabel(selectedThread)}</h2>
                    <small className="breakLong">{customerMeta(selectedThread)}</small>
                  </div>
                </div>

                <div className="supportConversationActions">
                  <span className={`supportPill ${selectedThread.status === "CLOSED" ? "supportPill-muted" : "supportPill-open"}`}>
                    {statusLabel(selectedThread.status)}
                  </span>
                  <span className={`supportPill ${selectedThreadUnread ? "supportPill-unread" : "supportPill-neutral"}`}>
                    {selectedThreadUnread ? "Ждёт ответа" : "Просмотрен"}
                  </span>
                  <button type="button" className="secondary" onClick={() => void onToggleThreadStatus()}>
                    {selectedThread.status === "CLOSED" ? "Переоткрыть" : "Закрыть"}
                  </button>
                </div>
              </div>

              <div className="supportConversationMetaGrid">
                <div className="supportMetaTile">
                  <span>ID диалога</span>
                  <strong className="breakLong">{selectedThread.id}</strong>
                </div>
                <div className="supportMetaTile">
                  <span>Последняя активность</span>
                  <strong>{formatDateTime(selectedThread.updatedAt ?? selectedThread.lastMessageAt ?? selectedThread.createdAt)}</strong>
                </div>
                <div className="supportMetaTile">
                  <span>Канал</span>
                  <strong>{channelLabel(selectedThread)}</strong>
                </div>
              </div>

              <div className="supportMessagesPanel">
                {messagesLoading ? (
                  <div className="supportEmptyState">
                    <strong>Загружаем сообщения…</strong>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="supportEmptyState">
                    <strong>Сообщений пока нет</strong>
                    <small>Первое сообщение клиента появится здесь автоматически.</small>
                  </div>
                ) : (
                  <div className="supportMessagesList">
                    {messages.map((message) => {
                      const isAdmin = message.authorRole === "admin";
                      const isSystem = message.authorRole === "system";
                      return (
                        <div
                          key={message.id}
                          className={`supportMessageRow ${isAdmin ? "supportMessageRow-admin" : ""} ${isSystem ? "supportMessageRow-system" : ""}`}
                        >
                          <div
                            className={`supportMessageBubble ${isAdmin ? "supportMessageBubble-admin" : ""} ${isSystem ? "supportMessageBubble-system" : ""}`}
                          >
                            <div className="supportMessageMeta">
                              <strong>{messageAuthorLabel(message, selectedThread)}</strong>
                              <span>{formatDateTime(message.createdAt)}</span>
                            </div>
                            <p className="breakLong">{message.text || "—"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="supportComposer">
                <div className="supportComposerTop">
                  <div className="supportComposerStatus">
                    <span className={`supportPill ${composerDisabled ? "supportPill-muted" : "supportPill-open"}`}>
                      {composerDisabled ? "Диалог закрыт" : "Ответ оператора"}
                    </span>
                    <span className="supportComposerRule">Enter отправляет, Shift+Enter переносит строку</span>
                  </div>
                </div>

                <div className={`supportComposerBar ${composerDisabled ? "supportComposerBar-disabled" : ""}`}>
                  <div className="supportComposerInputWrap">
                    <textarea
                      className="supportComposerInput"
                      rows={2}
                      placeholder={composerPlaceholder}
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      disabled={composerDisabled}
                    />
                  </div>
                  <button
                    type="button"
                    className="iconBtn iconBtn-circle supportComposerSend"
                    onClick={() => void onSend()}
                    disabled={!canSend}
                    aria-label={sending ? "Отправляем…" : "Отправить сообщение"}
                    title={sending ? "Отправляем…" : "Отправить сообщение"}
                  >
                    {sending ? <span className="supportComposerSpinner" aria-hidden="true" /> : <SendIcon />}
                  </button>
                </div>

                <small className="supportComposerHint">
                  Сообщение увидит клиент на сайте и в приложении сразу после отправки.
                </small>
              </div>
            </>
          ) : (
            <div className="supportEmptyState supportEmptyState-large">
              <strong>Выберите диалог</strong>
              <small>Слева появятся новые чаты клиентов. Откройте один из них, чтобы ответить.</small>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
