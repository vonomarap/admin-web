"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db, realtimeDb } from "../lib/firebase";

export type AdminNotificationType = "quote_created" | "support_message";

export type AdminNotificationItem = {
  id: string;
  entityId: string;
  type: AdminNotificationType;
  href: string;
  title: string;
  description: string;
  occurredAt: number;
  isUnread: true;
};

type QuoteNotificationDoc = {
  id: string;
  createdAt?: unknown;
  adminViewedAt?: unknown;
  adminViewedBy?: string;
  totalPrice?: number;
  currency?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
};

type SupportThreadNotificationDoc = {
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
  lastMessageText?: string | null;
  lastCustomerMessageAt?: unknown;
  adminSeenAt?: unknown;
};

type UseAdminNotificationsArgs = {
  enabled: boolean;
  viewerUid?: string | null;
};

type UseAdminNotificationsResult = {
  items: AdminNotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (item: AdminNotificationItem) => Promise<void>;
};

const QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS = Date.parse("2026-02-27T00:00:00Z");
const NOTIFICATION_QUERY_LIMIT = 200;

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

function formatCurrency(amount: number, currency?: string): string {
  const code = (currency || "").trim().toUpperCase() || "RUB";
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString(code === "RUB" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });
  if (code === "RUB") return `${formatted} ₽`;
  if (code === "USD") return `$${formatted}`;
  return `${formatted} ${code}`;
}

function clipPreview(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Без текста";
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 119)}...`;
}

function isQuoteUnseen(quote: Pick<QuoteNotificationDoc, "createdAt" | "adminViewedAt">): boolean {
  if (toMillis(quote.adminViewedAt) !== null) return false;
  const createdMs = toMillis(quote.createdAt);
  if (createdMs === null) return false;
  return createdMs >= QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS;
}

function isThreadUnread(thread: Pick<SupportThreadNotificationDoc, "lastCustomerMessageAt" | "adminSeenAt">): boolean {
  const lastCustomerMessageAt = toMillis(thread.lastCustomerMessageAt);
  if (lastCustomerMessageAt === null) return false;
  const adminSeenAt = toMillis(thread.adminSeenAt);
  return adminSeenAt === null || lastCustomerMessageAt > adminSeenAt;
}

function customerLabel(thread: SupportThreadNotificationDoc): string {
  if (thread.customerMode === "guest") {
    const name = thread.guestProfile?.name?.trim();
    const phone = thread.guestProfile?.phone?.trim();
    const email = thread.guestProfile?.email?.trim();
    return [name, phone, email].filter(Boolean).join(" · ") || "Гость";
  }
  return thread.customerName?.trim() || thread.customerEmail?.trim() || thread.customerUid?.trim() || "Клиент";
}

export function useAdminNotifications({ enabled, viewerUid }: UseAdminNotificationsArgs): UseAdminNotificationsResult {
  const [quotes, setQuotes] = useState<QuoteNotificationDoc[]>([]);
  const [threads, setThreads] = useState<SupportThreadNotificationDoc[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  useEffect(() => {
    const safeDb = db;
    if (!enabled || !safeDb) {
      setQuotes([]);
      setQuotesLoading(false);
      setQuotesError(null);
      return;
    }

    setQuotesLoading(true);
    setQuotesError(null);
    const unsubscribe = onSnapshot(
      query(
        collection(safeDb, "quotes"),
        where("createdAt", ">=", Timestamp.fromMillis(QUOTE_UNSEEN_FEATURE_RELEASE_AT_MS)),
        orderBy("createdAt", "desc"),
        limit(NOTIFICATION_QUERY_LIMIT),
      ),
      (snapshot) => {
        setQuotes(snapshot.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<QuoteNotificationDoc, "id">) })));
        setQuotesLoading(false);
      },
      (error) => {
        console.error("Notification quotes subscription failed:", error);
        setQuotesError(error instanceof Error ? error.message : String(error));
        setQuotesLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled]);

  useEffect(() => {
    const safeDb = realtimeDb;
    if (!enabled || !safeDb) {
      setThreads([]);
      setThreadsLoading(false);
      setThreadsError(null);
      return;
    }

    setThreadsLoading(true);
    setThreadsError(null);
    const unsubscribe = onSnapshot(
      query(
        collection(safeDb, "support_threads"),
        orderBy("lastCustomerMessageAt", "desc"),
        limit(NOTIFICATION_QUERY_LIMIT),
      ),
      (snapshot) => {
        setThreads(snapshot.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<SupportThreadNotificationDoc, "id">) })));
        setThreadsLoading(false);
      },
      (error) => {
        console.error("Notification support subscription failed:", error);
        setThreadsError(error instanceof Error ? error.message : String(error));
        setThreadsLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled]);

  const items = useMemo<AdminNotificationItem[]>(() => {
    const quoteItems = quotes
      .filter(isQuoteUnseen)
      .map((quote) => {
        const contact = [quote.contact?.name?.trim(), quote.contact?.phone?.trim(), quote.contact?.email?.trim()].filter(Boolean).join(" · ");
        const totalLabel =
          typeof quote.totalPrice === "number" && Number.isFinite(quote.totalPrice) ? formatCurrency(quote.totalPrice, quote.currency) : "";
        const descriptionParts = [contact || `Заявка ${quote.id}`, totalLabel].filter(Boolean);
        return {
          id: `quote:${quote.id}`,
          entityId: quote.id,
          type: "quote_created" as const,
          href: `/quote?quoteId=${encodeURIComponent(quote.id)}`,
          title: "Новая заявка",
          description: descriptionParts.join(" · "),
          occurredAt: toMillis(quote.createdAt) ?? 0,
          isUnread: true as const,
        };
      });

    const threadItems = threads
      .filter(isThreadUnread)
      .map((thread) => ({
        id: `support:${thread.id}`,
        entityId: thread.id,
        type: "support_message" as const,
        href: `/support?threadId=${encodeURIComponent(thread.id)}`,
        title: "Новое сообщение",
        description: `${customerLabel(thread)} · ${clipPreview(thread.lastMessageText)}`,
        occurredAt: toMillis(thread.lastCustomerMessageAt) ?? 0,
        isUnread: true as const,
      }));

    return [...quoteItems, ...threadItems].sort((left, right) => right.occurredAt - left.occurredAt);
  }, [quotes, threads]);

  const markAsRead = async (item: AdminNotificationItem): Promise<void> => {
    if (item.type === "quote_created") {
      const safeDb = db;
      if (!safeDb || !viewerUid) return;
      await updateDoc(doc(safeDb, "quotes", item.entityId), {
        adminViewedAt: serverTimestamp(),
        adminViewedBy: viewerUid,
      });
      setQuotes((prev) => prev.map((quote) => (
        quote.id === item.entityId
          ? {
              ...quote,
              adminViewedAt: new Date(),
              adminViewedBy: viewerUid,
            }
          : quote
      )));
      return;
    }

    const safeDb = realtimeDb;
    if (!safeDb) return;
    await updateDoc(doc(safeDb, "support_threads", item.entityId), {
      adminSeenAt: serverTimestamp(),
    });
    setThreads((prev) => prev.map((thread) => (
      thread.id === item.entityId
        ? {
            ...thread,
            adminSeenAt: new Date(),
          }
        : thread
    )));
  };

  return {
    items,
    unreadCount: items.length,
    loading: quotesLoading || threadsLoading,
    error: quotesError || threadsError,
    markAsRead,
  };
}
