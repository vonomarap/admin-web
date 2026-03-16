"use client";

import { useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import { uploadMediaFile, type MediaFolder } from "../../lib/media";
import { useAdminSession } from "../AdminSessionProvider";
import { ImageThumbPreview } from "./ImageThumbPreview";

export function MediaUploadButton({
  folder,
  multiple = false,
  accept = "image/*",
  label = "Загрузить",
  showPreview = false,
  disabled,
  className = "secondary small",
  onUploaded,
}: {
  folder: MediaFolder;
  multiple?: boolean;
  accept?: string;
  label?: string;
  showPreview?: boolean;
  disabled?: boolean;
  className?: string;
  onUploaded: (urls: string[]) => void;
}): JSX.Element {
  const session = useAdminSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<{ index: number; total: number } | null>(null);
  const [lastUploadedUrls, setLastUploadedUrls] = useState<string[]>([]);

  const canUse = useMemo(() => Boolean(db && session.isAdmin), [session.isAdmin]);
  const isDisabled = Boolean(disabled || uploading || !canUse);

  const openPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!db) {
      setError("Firebase не настроен.");
      return;
    }

    const items = Array.from(files);
    setUploading(true);
    setProgressPct(0);
    setError(null);
    setQueueInfo({ index: 0, total: items.length });
    try {
      const urls: string[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const file = items[i]!;
        setQueueInfo({ index: i + 1, total: items.length });
        setProgressPct(0);
        const res = await uploadMediaFile({
          db,
          folder,
          file,
          userUid: session.user?.uid ?? undefined,
          onProgress: (pct) => setProgressPct(pct),
        });
        urls.push(res.url);
      }
      setLastUploadedUrls(urls);
      onUploaded(urls);
    } catch (err) {
      console.error("Media upload failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setQueueInfo(null);
      setProgressPct(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const buttonLabel = uploading
    ? queueInfo
      ? `Загрузка ${queueInfo.index}/${queueInfo.total}… ${Math.round(progressPct)}%`
      : `Загрузка… ${Math.round(progressPct)}%`
    : label;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => void onPick(e.currentTarget.files)}
      />
      <button type="button" className={className} onClick={openPicker} disabled={isDisabled}>
        {buttonLabel}
      </button>
      {showPreview && lastUploadedUrls[0] ? <ImageThumbPreview url={lastUploadedUrls[0]} size={64} /> : null}
      {error ? <small className="noticeText-danger">{error}</small> : null}
    </span>
  );
}
