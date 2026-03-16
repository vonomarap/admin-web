export const STATUSES = ["NEW", "IN_REVIEW", "OFFER_SENT", "CONFIRMED", "CANCELLED"] as const;

export type QuoteStatus = (typeof STATUSES)[number];
export type QuoteStatusBucket = QuoteStatus | "OTHER";

export const STATUS_LABELS: Record<QuoteStatusBucket, string> = {
  NEW: "Новая",
  IN_REVIEW: "В работе",
  OFFER_SENT: "КП отправлено",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
  OTHER: "Другое",
};

export function normalizeStatus(value: unknown): QuoteStatusBucket {
  if (typeof value !== "string") return "OTHER";
  const normalized = value.trim().toUpperCase();
  return (STATUSES as readonly string[]).includes(normalized) ? (normalized as QuoteStatus) : "OTHER";
}

