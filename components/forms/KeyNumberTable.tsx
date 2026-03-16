"use client";

import { useEffect, useMemo, useState } from "react";
import { TrashIcon } from "../Icons";

type KeyNumberRow = {
  id: string;
  key: string;
  value: string;
  locked?: boolean;
};

function newRowId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function KeyNumberTable({
  title,
  subtitle,
  value,
  resetKey,
  onChange,
  knownLabels,
  normalizeKey,
  lockedKeys = [],
  requiredKeys = [],
  keyPlaceholder = "key",
  valuePlaceholder = "0",
  addLabel = "Добавить",
}: {
  title: string;
  subtitle?: string;
  value: Record<string, number>;
  resetKey: number;
  onChange: (next: Record<string, number>, meta: { errors: string[] }) => void;
  knownLabels?: Record<string, string>;
  normalizeKey?: (key: string) => string;
  lockedKeys?: string[];
  requiredKeys?: string[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}): JSX.Element {
  const lockedSet = useMemo(() => new Set(lockedKeys), [lockedKeys]);
  const requiredSet = useMemo(() => new Set(requiredKeys), [requiredKeys]);

  const buildRows = (record: Record<string, number>): KeyNumberRow[] => {
    const rows: KeyNumberRow[] = [];

    for (const key of lockedKeys) {
      rows.push({ id: newRowId(), key, value: record[key] == null ? "" : String(record[key]), locked: true });
    }

    const rest = Object.keys(record)
      .filter((k) => !lockedSet.has(k))
      .sort((a, b) => a.localeCompare(b));

    for (const key of rest) {
      rows.push({ id: newRowId(), key, value: String(record[key] ?? ""), locked: false });
    }

    if (!rows.length) rows.push({ id: newRowId(), key: "", value: "" });
    return rows;
  };

  const [rows, setRows] = useState<KeyNumberRow[]>(() => buildRows(value));

  useEffect(() => {
    setRows(buildRows(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const { parsed, errors } = useMemo(() => {
    const next: Record<string, number> = {};
    const errs: string[] = [];
    const seen = new Set<string>();

    const normalize = (key: string) => {
      const trimmed = key.trim();
      return normalizeKey ? normalizeKey(trimmed) : trimmed;
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const key = normalize(row.key);
      const valueStr = row.value.trim();

      if (!key) {
        if (valueStr) errs.push(`Строка ${index + 1}: ключ обязателен.`);
        continue;
      }

      if (seen.has(key)) {
        errs.push(`Дубликат ключа: "${key}".`);
        continue;
      }
      seen.add(key);

      if (!valueStr) {
        // Empty value means "remove" (defaults apply).
        continue;
      }

      const num = toNumber(valueStr);
      if (num === null) {
        errs.push(`"${key}": значение не число.`);
        continue;
      }

      next[key] = num;
    }

    for (const key of requiredSet) {
      if (next[key] == null) {
        errs.push(`Обязательный ключ "${key}" не задан (или значение не число).`);
      }
    }

    return { parsed: next, errors: errs };
  }, [normalizeKey, requiredSet, rows]);

  useEffect(() => {
    onChange(parsed, { errors });
  }, [errors, onChange, parsed]);

  const updateRow = (id: string, patch: Partial<Pick<KeyNumberRow, "key" | "value">>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length ? next : [{ id: newRowId(), key: "", value: "" }];
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, { id: newRowId(), key: "", value: "" }]);
  };

  const showLabels = true;

  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="rowActions" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle ? <small className="breakLong">{subtitle}</small> : null}
        </div>
        <button type="button" className="secondary small" onClick={addRow}>
          {addLabel}
        </button>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th style={{ width: "24%" }}>Значение</th>
              <th style={{ width: "30%" }}>Ключ</th>
              <th style={{ width: 68 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const keyTrimmed = row.key.trim();
              const label = showLabels && knownLabels ? knownLabels[keyTrimmed] ?? knownLabels[keyTrimmed.toLowerCase()] : undefined;
              const isLocked = Boolean(row.locked) || lockedSet.has(keyTrimmed);

              return (
                <tr key={row.id}>
                  <td>
                    {label ? <b className="breakLong">{label}</b> : <small>-</small>}
                  </td>
                  <td>
                    <input
                      value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })}
                      placeholder={valuePlaceholder}
                      inputMode="decimal"
                      autoCapitalize="none"
                    />
                  </td>
                  <td>
                    <input
                      value={row.key}
                      onChange={(e) => updateRow(row.id, { key: e.target.value })}
                      placeholder={keyPlaceholder}
                      autoCapitalize="none"
                      disabled={isLocked}
                    />
                  </td>
                  <td>
                    {!isLocked ? (
                      <button
                        type="button"
                        className="iconBtn iconBtn-danger"
                        aria-label="Удалить"
                        title="Удалить"
                        onClick={() => removeRow(row.id)}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errors.length ? (
        <div className="errorBox">
          {errors.slice(0, 6).map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          {errors.length > 6 ? <div>…и ещё {errors.length - 6}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
