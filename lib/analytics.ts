export const DAY_MS = 24 * 60 * 60 * 1000;

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateKeyToUtcStartMs(key: string): number | null {
  if (!isDateKey(key)) return null;
  const [yearRaw, monthRaw, dayRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return Date.UTC(year, month - 1, day);
}

export function toDateKeyUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dateKeyRange(startKey: string, endKey: string): string[] {
  const startMs = dateKeyToUtcStartMs(startKey);
  const endMs = dateKeyToUtcStartMs(endKey);
  if (startMs === null || endMs === null) return [];
  if (startMs > endMs) return [];
  const keys: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    keys.push(toDateKeyUTC(ms));
  }
  return keys;
}

export function presetRangeKeys(days: 7 | 30 | 90, nowMs = Date.now()): { startKey: string; endKey: string } {
  const endKey = toDateKeyUTC(nowMs);
  const startKey = toDateKeyUTC(nowMs - (days - 1) * DAY_MS);
  return { startKey, endKey };
}

export type CalendarPreset = "today" | "yesterday" | "week" | "month" | "quarter" | "year";

export function calendarPresetRangeKeys(preset: CalendarPreset, nowMs = Date.now()): { startKey: string; endKey: string } {
  const endKey = toDateKeyUTC(nowMs);
  const endStartMs = dateKeyToUtcStartMs(endKey);
  if (endStartMs === null) return { startKey: endKey, endKey };

  if (preset === "today") return { startKey: endKey, endKey };

  if (preset === "yesterday") {
    const key = toDateKeyUTC(endStartMs - DAY_MS);
    return { startKey: key, endKey: key };
  }

  if (preset === "week") {
    const weekday = new Date(endStartMs).getUTCDay();
    const sinceMonday = (weekday + 6) % 7;
    const startKey = toDateKeyUTC(endStartMs - sinceMonday * DAY_MS);
    return { startKey, endKey };
  }

  const date = new Date(endStartMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (preset === "month") {
    const startKey = toDateKeyUTC(Date.UTC(year, month, 1));
    return { startKey, endKey };
  }

  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const startKey = toDateKeyUTC(Date.UTC(year, quarterStartMonth, 1));
    return { startKey, endKey };
  }

  const startKey = toDateKeyUTC(Date.UTC(year, 0, 1));
  return { startKey, endKey };
}

export function rangeKeysToUtcMs(
  startKey: string,
  endKey: string
): { startMs: number; endMsExclusive: number } | null {
  const startMs = dateKeyToUtcStartMs(startKey);
  const endMs = dateKeyToUtcStartMs(endKey);
  if (startMs === null || endMs === null) return null;
  if (startMs > endMs) return null;
  return { startMs, endMsExclusive: endMs + DAY_MS };
}

export function toMillis(value: unknown): number | null {
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
    const maybe = value as { toMillis?: unknown; seconds?: unknown };
    if (typeof maybe.toMillis === "function") {
      try {
        const ms = (maybe.toMillis as () => unknown)();
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
