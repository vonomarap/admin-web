import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function dateKeyToLocalDate(value: string): Date | undefined {
  if (!isDateKey(value)) return undefined;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  return new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

export function localDateToDateKey(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

export function formatDateKeyLabel(value: string): string {
  const date = dateKeyToLocalDate(value);
  if (!date) return "";
  return format(date, "dd.MM.yyyy", { locale: ru });
}

export function isTimeKey(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  return Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function splitLocalDateTime(value: string): { dateKey: string; timeKey: string } {
  const trimmed = (value || "").trim();
  if (!trimmed) return { dateKey: "", timeKey: "" };

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/);
  if (match && isDateKey(match[1])) {
    return {
      dateKey: match[1],
      timeKey: isTimeKey(match[2] ?? "") ? (match[2] as string) : "",
    };
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return { dateKey: "", timeKey: "" };

  return {
    dateKey: localDateToDateKey(parsed),
    timeKey: format(parsed, "HH:mm"),
  };
}

export function combineLocalDateTime(dateKey: string, timeKey: string): string {
  if (!isDateKey(dateKey)) return "";
  const safeTime = isTimeKey(timeKey) ? timeKey : "00:00";
  return `${dateKey}T${safeTime}`;
}

export function formatLocalDateTimeLabel(value: string): string {
  const { dateKey, timeKey } = splitLocalDateTime(value);
  if (!dateKey) return "";
  const dateLabel = formatDateKeyLabel(dateKey);
  return timeKey ? `${dateLabel} ${timeKey}` : dateLabel;
}
