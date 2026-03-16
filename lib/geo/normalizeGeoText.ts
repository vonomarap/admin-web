export function normalizeGeoText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

