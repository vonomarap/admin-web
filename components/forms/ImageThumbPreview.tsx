"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

function canPreview(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

export function ImageThumbPreview({
  url,
  size = 64,
  openLabel = "Открыть",
}: {
  url: string;
  size?: number;
  openLabel?: string;
}): JSX.Element | null {
  const previewUrl = useMemo(() => {
    const trimmed = (url || "").trim();
    return canPreview(trimmed) ? trimmed : "";
  }, [url]);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [previewUrl]);

  if (!previewUrl) return null;

  const open = () => {
    try {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(previewUrl, "_blank");
    }
  };

  return (
    <div className="rowActions" style={{ alignItems: "center", gap: 10 }}>
      <Card
        style={{
          width: size,
          height: size,
          overflow: "hidden",
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
        }}
        title={previewUrl}
      >
        {!failed ? (
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <small style={{ textAlign: "center", opacity: 0.75, padding: 6 }}>нет превью</small>
        )}
      </Card>

      <Button type="button" variant="secondary" size="sm" onClick={open}>
        {openLabel}
      </Button>
    </div>
  );
}
