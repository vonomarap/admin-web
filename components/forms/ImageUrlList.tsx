"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "../Icons";
import { auth, db } from "../../lib/firebase";
import { uploadMediaFile, type MediaFolder } from "../../lib/media";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

type ImageUrlRow = {
  id: string;
  url: string;
};

function newRowId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function coerceUrl(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildRows(urls: string[]): ImageUrlRow[] {
  const rows = Array.isArray(urls) ? urls.map((url) => ({ id: newRowId(), url: coerceUrl(url) })) : [];
  return rows.length ? rows : [{ id: newRowId(), url: "" }];
}

function canPreview(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

export function ImageUrlList({
  title,
  subtitle,
  value,
  resetKey,
  onChange,
  disabled,
  uploadFolder,
  uploadLabel = "Загрузить фото",
  addLabel = "Добавить фото",
  inputPlaceholder = "https://...",
}: {
  title: string;
  subtitle?: string;
  value: string[];
  resetKey: string | number;
  onChange: (next: string[]) => void;
  disabled?: boolean;
  uploadFolder?: MediaFolder;
  uploadLabel?: string;
  addLabel?: string;
  inputPlaceholder?: string;
}): JSX.Element {
  const [rows, setRows] = useState<ImageUrlRow[]>(() => buildRows(value));
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<{ index: number; total: number; pct: number } | null>(null);

  useEffect(() => {
    setRows(buildRows(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const urls = useMemo(() => rows.map((row) => row.url), [rows]);

  useEffect(() => {
    onChange(urls);
  }, [onChange, urls]);

  const updateRow = (id: string, patch: Partial<Pick<ImageUrlRow, "url">>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { id: newRowId(), url: "" }]);
  };

  const onUpload = async (files: File[]) => {
    if (!uploadFolder) return;
    if (!files.length) return;
    if (!db) {
      setUploadError("Firebase не настроен.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadInfo({ index: 0, total: files.length, pct: 0 });
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        setUploadInfo({ index: i + 1, total: files.length, pct: 0 });
        const res = await uploadMediaFile({
          db,
          folder: uploadFolder,
          file,
          userUid: auth?.currentUser?.uid ?? undefined,
          onProgress: (pct) => setUploadInfo({ index: i + 1, total: files.length, pct }),
        });
        urls.push(res.url);
      }

      setRows((prev) => [...prev, ...urls.map((url) => ({ id: newRowId(), url }))]);
    } catch (error) {
      console.error("ImageUrlList upload failed:", error);
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      setUploadInfo(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length ? next : [{ id: newRowId(), url: "" }];
    });
  };

  const moveRow = (index: number, delta: -1 | 1) => {
    setRows((prev) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = prev.slice();
      const temp = next[index]!;
      next[index] = next[nextIndex]!;
      next[nextIndex] = temp;
      return next;
    });
  };

  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="rowActions" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle ? <small className="breakLong">{subtitle}</small> : null}
        </div>
        <div className="rowActions" style={{ justifyContent: "flex-end" }}>
          {uploadFolder ? (
            <>
              <Input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => void onUpload(Array.from(e.currentTarget.files || []))}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => uploadInputRef.current?.click()}
                disabled={disabled || uploading}
              >
                {uploadInfo ? `Загрузка ${uploadInfo.index}/${uploadInfo.total}…` : uploadLabel}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={disabled || uploading}>
            {addLabel}
          </Button>
        </div>
      </div>

      {uploadInfo ? <small>Прогресс: {Math.round(uploadInfo.pct)}%</small> : null}
      {uploadError ? <div className="errorBox">{uploadError}</div> : null}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row, index) => {
          const trimmed = row.url.trim();
          const preview = canPreview(trimmed) ? trimmed : "";
          const isFirst = index === 0;

          return (
            <div key={row.id} className="rowActions" style={{ alignItems: "flex-start", gap: 10 }}>
              <Card
                style={{
                  width: 64,
                  height: 64,
                  overflow: "hidden",
                  flex: "0 0 auto",
                }}
                title={preview || undefined}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : null}
              </Card>

              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                <Input
                  placeholder={inputPlaceholder}
                  value={row.url}
                  onChange={(e) => updateRow(row.id, { url: e.target.value })}
                  autoCapitalize="none"
                  disabled={disabled}
                />
                <small>{isFirst ? "Первое фото используется как обложка." : "\u00A0"}</small>
              </div>

              <div className="rowActions" style={{ flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Вверх"
                  title="Вверх"
                  disabled={disabled || index === 0}
                  onClick={() => moveRow(index, -1)}
                >
                  <ChevronUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Вниз"
                  title="Вниз"
                  disabled={disabled || index === rows.length - 1}
                  onClick={() => moveRow(index, 1)}
                >
                  <ChevronDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label="Удалить"
                  title="Удалить"
                  disabled={disabled}
                  onClick={() => removeRow(row.id)}
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
