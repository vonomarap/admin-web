"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type GeoBbox = {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
};

export type DotDensityPoint = {
  lon: number;
  lat: number;
  weight: number;
};

export type PlaceDot = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  count: number;
};

type Props = {
  bbox: GeoBbox;
  ring: ReadonlyArray<readonly [number, number]>;
  points: readonly DotDensityPoint[];
  places?: readonly PlaceDot[];
  showTooltip?: boolean;
  placeDotScale?: number;
  placeDotRadius?: number;
  minHeight?: number;
  maxHeight?: number;
  dotSpacing?: number;
  dotRadius?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type Rgb = { r: number; g: number; b: number };

function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  const tt = clamp(t, 0, 1);
  return {
    r: Math.round(lerp(from.r, to.r, tt)),
    g: Math.round(lerp(from.g, to.g, tt)),
    b: Math.round(lerp(from.b, to.b, tt)),
  };
}

type ProjectedPoint = { x: number; y: number };

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

type PlaceHit = {
  id: string;
  name: string;
  count: number;
  x: number;
  y: number;
  r: number;
};

type BlinkDot = {
  id: string;
  x: number;
  y: number;
  r: number;
  color: Rgb;
};

function findPlaceHit(hits: readonly PlaceHit[], x: number, y: number): PlaceHit | null {
  let best: PlaceHit | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;

  for (const hit of hits) {
    const dx = x - hit.x;
    const dy = y - hit.y;
    const d2 = dx * dx + dy * dy;
    const threshold = hit.r + 10;
    if (d2 > threshold * threshold) continue;
    if (d2 < bestD2) {
      best = hit;
      bestD2 = d2;
    }
  }

  return best;
}

export function DotDensityMap({
  bbox,
  ring,
  points,
  places,
  showTooltip = true,
  placeDotScale = 1.8,
  placeDotRadius,
  minHeight = 260,
  maxHeight = 560,
  dotSpacing = 8,
  dotRadius = 2.691,
}: Props): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const placeHitsRef = useRef<PlaceHit[]>([]);
  const blinkDotsRef = useRef<BlinkDot[]>([]);
  const clipPathRef = useRef<Path2D | null>(null);
  const dprRef = useRef(1);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverIdRef = useRef<string | null>(null);
  const [width, setWidth] = useState(0);
  const [isFinePointer, setIsFinePointer] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [hitsRev, setHitsRev] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      setWidth((prev) => (prev === next ? prev : next));
    };

    update();

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(pointer: fine)");
    const update = () => setIsFinePointer(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    const legacy = media as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    legacy.addListener?.(update);
    return () => legacy.removeListener?.(update);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    const legacy = media as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    legacy.addListener?.(update);
    return () => legacy.removeListener?.(update);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setDocumentVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const projection = useMemo(() => {
    const midLat = (bbox.minLat + bbox.maxLat) / 2;
    const cosLat = Math.cos(degToRad(midLat));
    const project = (lon: number, lat: number): ProjectedPoint => ({ x: lon * cosLat, y: lat });

    const min = project(bbox.minLon, bbox.minLat);
    const max = project(bbox.maxLon, bbox.maxLat);
    const minX = Math.min(min.x, max.x);
    const maxX = Math.max(min.x, max.x);
    const minY = Math.min(bbox.minLat, bbox.maxLat);
    const maxY = Math.max(bbox.minLat, bbox.maxLat);

    return { project, minX, maxX, minY, maxY };
  }, [bbox.maxLat, bbox.maxLon, bbox.minLat, bbox.minLon]);

  const height = useMemo(() => {
    if (!width) return minHeight;
    const projWidth = Math.max(1e-9, projection.maxX - projection.minX);
    const projHeight = Math.max(1e-9, projection.maxY - projection.minY);
    const aspect = projWidth / projHeight;
    const computed = Math.round(width / aspect);
    return clamp(computed, minHeight, maxHeight);
  }, [maxHeight, minHeight, projection.maxX, projection.maxY, projection.minX, projection.minY, width]);

  const dotScale = useMemo(() => {
    if (!width || !isFinePointer) return 1;
    const scaleStartWidth = 760;
    const scaleEndWidth = 1200;
    const desktopScaleMax = 1.4;
    const t = clamp((width - scaleStartWidth) / (scaleEndWidth - scaleStartWidth), 0, 1);
    return lerp(1, desktopScaleMax, t);
  }, [isFinePointer, width]);

  const blinkIds = useMemo(() => {
    if (!places?.length) return new Set<string>();
    const active = places
      .filter((place) => (place.count ?? 0) > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 3);
    return new Set(active.map((place) => place.id));
  }, [places]);

  const shouldBlink = blinkIds.size > 0 && !reduceMotion && documentVisible;

  useEffect(() => {
    const fgCanvas = fgCanvasRef.current;
    if (!fgCanvas || width <= 0 || height <= 0) return;

    const ctx = fgCanvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current || 1;
    const orange = { r: 249, g: 115, b: 22 };

    const clear = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    };

    const draw = (blinkPhase: number) => {
      const blinkPulse = 0.5 - 0.5 * Math.cos(Math.PI * 2 * blinkPhase);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const path = clipPathRef.current;
      ctx.save();
      if (path) ctx.clip(path);

      for (const dot of blinkDotsRef.current) {
        const radius = dot.r * (1 + 0.18 * blinkPulse);

        const haloAlpha = 0.18 * blinkPulse;
        if (haloAlpha > 0) {
          ctx.fillStyle = `rgba(${orange.r}, ${orange.g}, ${orange.b}, ${haloAlpha})`;
          ctx.beginPath();
          ctx.moveTo(dot.x + radius * 1.65, dot.y);
          ctx.arc(dot.x, dot.y, radius * 1.65, 0, Math.PI * 2);
          ctx.fill();
        }

        const dotAlpha = clamp(0.95 + 0.05 * blinkPulse, 0, 1);
        ctx.fillStyle = `rgba(${dot.color.r}, ${dot.color.g}, ${dot.color.b}, ${dotAlpha})`;
        ctx.beginPath();
        ctx.moveTo(dot.x + radius, dot.y);
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    if (!shouldBlink) {
      clear();
      return;
    }
    if (typeof window.requestAnimationFrame !== "function") return;

    const periodMs = 1400;
    const minFrameMs = 50; // ~20fps: smoother scroll + lower CPU
    const start = performance.now();
    let lastUpdate = start;
    let raf = 0;
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      if (now - lastUpdate >= minFrameMs) {
        lastUpdate = now;
        draw(((now - start) % periodMs) / periodMs);
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(raf);
      clear();
    };
  }, [height, shouldBlink, width]);

  const activeId = pinnedId ?? hoverId;
  const activeHit = useMemo(() => {
    if (!showTooltip || !activeId) return null;
    return placeHitsRef.current.find((hit) => hit.id === activeId) ?? null;
  }, [activeId, hitsRev, showTooltip]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas || width <= 0 || height <= 0) return;

    const bgCtx = bgCanvas.getContext("2d");
    const fgCtx = fgCanvas.getContext("2d");
    if (!bgCtx || !fgCtx) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    dprRef.current = dpr;

    const resizeBuffer = (canvas: HTMLCanvasElement) => {
      const nextW = Math.max(1, Math.floor(width * dpr));
      const nextH = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
    };

    resizeBuffer(bgCanvas);
    resizeBuffer(fgCanvas);

    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    bgCtx.clearRect(0, 0, width, height);

    const pad = 14;
    const projWidth = Math.max(1e-9, projection.maxX - projection.minX);
    const projHeight = Math.max(1e-9, projection.maxY - projection.minY);
    const scale = Math.min((width - pad * 2) / projWidth, (height - pad * 2) / projHeight);
    const offsetX = pad + (width - pad * 2 - projWidth * scale) / 2 - projection.minX * scale;
    const offsetY = pad + (height - pad * 2 - projHeight * scale) / 2 + projection.maxY * scale;

    const toCanvas = (lon: number, lat: number): ProjectedPoint => {
      const projected = projection.project(lon, lat);
      return { x: offsetX + projected.x * scale, y: offsetY - projected.y * scale };
    };

    const effectiveDotRadius = dotRadius * dotScale;

    const path = new Path2D();
    const ringPoints = ring.map(([lon, lat]) => toCanvas(lon, lat));
    if (ringPoints.length) {
      path.moveTo(ringPoints[0].x, ringPoints[0].y);
      for (let i = 1; i < ringPoints.length; i += 1) {
        path.lineTo(ringPoints[i].x, ringPoints[i].y);
      }
      path.closePath();
    }

    clipPathRef.current = ringPoints.length ? path : null;

    bgCtx.save();
    if (ringPoints.length) bgCtx.clip(path);

    const gray = { r: 148, g: 163, b: 184 };
    const orange = { r: 249, g: 115, b: 22 };
    const baseAlpha = 0.34;
    const overlayMaxAlpha = 0.94;
    const gamma = 0.65;
    const gridSpacing = dotSpacing * dotScale;
    const sigma = gridSpacing * 4.5;
    const twoSigma2Inv = 1 / (2 * sigma * sigma);

    const placePx = points
      .map((p) => {
        const at = toCanvas(p.lon, p.lat);
        const weight = Math.sqrt(Math.max(0, p.weight));
        return { x: at.x, y: at.y, weight };
      })
      .filter((p) => p.weight > 0);

    const startY = -gridSpacing;
    const endY = height + gridSpacing;
    const startX = -gridSpacing;
    const endX = width + gridSpacing;
    const rowCount = Math.floor((endY - startY) / gridSpacing) + 1;
    const colCount = Math.floor((endX - startX) / gridSpacing) + 1;

    // Base layer: uniform dotted fill.
    bgCtx.fillStyle = `rgba(${gray.r}, ${gray.g}, ${gray.b}, ${baseAlpha})`;
    bgCtx.beginPath();
    let rowIndex = 0;
    for (let y = startY; y <= endY; y += gridSpacing) {
      const rowShift = rowIndex % 2 ? gridSpacing / 2 : 0;
      for (let x = startX; x <= endX; x += gridSpacing) {
        const xx = x + rowShift;
        bgCtx.moveTo(xx + effectiveDotRadius, y);
        bgCtx.arc(xx, y, effectiveDotRadius, 0, Math.PI * 2);
      }
      rowIndex += 1;
    }
    bgCtx.fill();

    const hasPlacesGlow = Boolean(places?.some((place) => (place.count ?? 0) > 0));

    // Small-dot glow: only a single ring of dots around each place.
    if (places?.length && hasPlacesGlow) {
      const maxCount = places.reduce((acc, place) => Math.max(acc, place.count || 0), 0);
      const gammaPlaceGlow = 0.55;
      const glowMaxAlpha = 0.22;
      const ringStepRadius = 2;
      const sectorCount = 6;
      const sectorAngle = (Math.PI * 2) / sectorCount;
      const targetRadius = gridSpacing * 1.15;
      const ringMin = gridSpacing * 0.75;
      const ringMax = gridSpacing * 1.65;

      const intensityByKey = new Map<number, number>();

      for (const place of places) {
        if (!place.count) continue;

        const pos = toCanvas(place.lon, place.lat);
        const t = maxCount ? clamp(place.count / maxCount, 0, 1) : 0;
        const placeIntensity = Math.pow(t, gammaPlaceGlow);
        if (!placeIntensity) continue;

        const approxRow = clamp(Math.round((pos.y - startY) / gridSpacing), 0, Math.max(0, rowCount - 1));
        const approxShift = approxRow % 2 ? gridSpacing / 2 : 0;
        const approxCol = clamp(Math.round((pos.x - approxShift - startX) / gridSpacing), 0, Math.max(0, colCount - 1));

        const candidates: Array<{ key: number; d2: number; d: number; angle: number }> = [];
        for (let r = approxRow - ringStepRadius; r <= approxRow + ringStepRadius; r += 1) {
          if (r < 0 || r >= rowCount) continue;
          const rowShift = r % 2 ? gridSpacing / 2 : 0;
          const y = startY + r * gridSpacing;
          for (let c = approxCol - ringStepRadius; c <= approxCol + ringStepRadius; c += 1) {
            if (c < 0 || c >= colCount) continue;
            const x = startX + c * gridSpacing + rowShift;
            const dx = x - pos.x;
            const dy = y - pos.y;
            const d2 = dx * dx + dy * dy;
            if (!d2) continue;
            const d = Math.sqrt(d2);
            if (d < ringMin || d > ringMax) continue;
            const angleRaw = Math.atan2(dy, dx);
            const angle = angleRaw < 0 ? angleRaw + Math.PI * 2 : angleRaw;
            candidates.push({ key: r * colCount + c, d2, d, angle });
          }
        }

        const sectorBest = new Map<number, { key: number; score: number }>();
        for (const candidate of candidates) {
          const sector = Math.floor(candidate.angle / sectorAngle);
          const sectorIdx = clamp(sector, 0, sectorCount - 1);
          const score = Math.abs(candidate.d - targetRadius);
          const prev = sectorBest.get(sectorIdx);
          if (!prev || score < prev.score) {
            sectorBest.set(sectorIdx, { key: candidate.key, score });
          }
        }

        for (const selected of sectorBest.values()) {
          const prevIntensity = intensityByKey.get(selected.key) ?? 0;
          if (placeIntensity > prevIntensity) intensityByKey.set(selected.key, placeIntensity);
        }
      }

      const bucketCount = 10;
      const buckets: Array<number[]> = Array.from({ length: bucketCount }, () => []);

      for (const [key, intensity] of intensityByKey.entries()) {
        if (!Number.isFinite(intensity) || intensity <= 0) continue;
        const idx = Math.min(bucketCount - 1, Math.max(0, Math.round(intensity * (bucketCount - 1))));
        if (idx <= 0) continue;
        buckets[idx].push(key);
      }

      for (let i = 1; i < buckets.length; i += 1) {
        const bucket = buckets[i];
        if (!bucket.length) continue;
        const t = i / (bucketCount - 1);
        const alpha = clamp(t * glowMaxAlpha, 0, glowMaxAlpha);
        bgCtx.fillStyle = `rgba(${orange.r}, ${orange.g}, ${orange.b}, ${alpha})`;
        bgCtx.beginPath();
        for (const key of bucket) {
          const r = Math.floor(key / colCount);
          const c = key - r * colCount;
          const rowShift = r % 2 ? gridSpacing / 2 : 0;
          const x = startX + c * gridSpacing + rowShift;
          const y = startY + r * gridSpacing;
          bgCtx.moveTo(x + effectiveDotRadius, y);
          bgCtx.arc(x, y, effectiveDotRadius, 0, Math.PI * 2);
        }
        bgCtx.fill();
      }
    } else if (placePx.length) {
      // Fallback for other usages: gaussian overlay based on points.
      const positions: Array<{ x: number; y: number }> = [];
      const densities: number[] = [];
      let maxDensity = 0;

      rowIndex = 0;
      for (let y = startY; y <= endY; y += gridSpacing) {
        const rowShift = rowIndex % 2 ? gridSpacing / 2 : 0;
        for (let x = startX; x <= endX; x += gridSpacing) {
          const xx = x + rowShift;

          let density = 0;
          for (const place of placePx) {
            const dx = xx - place.x;
            const dy = y - place.y;
            const d2 = dx * dx + dy * dy;
            density += place.weight * Math.exp(-d2 * twoSigma2Inv);
          }

          positions.push({ x: xx, y });
          densities.push(density);
          if (density > maxDensity) maxDensity = density;
        }
        rowIndex += 1;
      }

      const bucketCount = 14;
      const buckets: Array<Array<{ x: number; y: number }>> = Array.from({ length: bucketCount }, () => []);
      const invMax = maxDensity ? 1 / maxDensity : 0;

      for (let i = 0; i < positions.length; i += 1) {
        const intensity = Math.pow(densities[i] * invMax, gamma);
        if (!Number.isFinite(intensity) || intensity <= 0) continue;
        const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(intensity * (bucketCount - 1))));
        if (idx <= 0) continue;
        buckets[idx].push(positions[i]);
      }

      for (let i = 1; i < buckets.length; i += 1) {
        const bucket = buckets[i];
        if (!bucket.length) continue;
        const t = i / (bucketCount - 1);
        const alpha = clamp(t * overlayMaxAlpha, 0, overlayMaxAlpha);
        bgCtx.fillStyle = `rgba(${orange.r}, ${orange.g}, ${orange.b}, ${alpha})`;
        bgCtx.beginPath();
        for (const pos of bucket) {
          bgCtx.moveTo(pos.x + effectiveDotRadius, pos.y);
          bgCtx.arc(pos.x, pos.y, effectiveDotRadius, 0, Math.PI * 2);
        }
        bgCtx.fill();
      }
    }

    const hits: PlaceHit[] = [];
    const blinkDots: BlinkDot[] = [];

    if (places?.length) {
      const maxCount = places.reduce((acc, place) => Math.max(acc, place.count || 0), 0);
      const baseRadius = placeDotRadius ?? effectiveDotRadius * placeDotScale;
      const gammaPlace = 0.55;
      const alpha = 0.95;

      for (const place of places) {
        const pos = toCanvas(place.lon, place.lat);
        const t = maxCount ? clamp(place.count / maxCount, 0, 1) : 0;
        const intensity = Math.pow(t, gammaPlace);
        const color = mixRgb(gray, orange, intensity);
        const isActive = blinkIds.has(place.id);
        const radius = baseRadius;

        if (isActive && shouldBlink) {
          blinkDots.push({ id: place.id, x: pos.x, y: pos.y, r: radius, color });
        } else {
          bgCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
          bgCtx.beginPath();
          bgCtx.moveTo(pos.x + radius, pos.y);
          bgCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
          bgCtx.fill();
        }

        hits.push({ id: place.id, name: place.name, count: place.count, x: pos.x, y: pos.y, r: radius });
      }
    }

    bgCtx.restore();

    placeHitsRef.current = hits;
    blinkDotsRef.current = shouldBlink ? blinkDots : [];

    fgCtx.clearRect(0, 0, width, height);
    setHitsRev((prev) => prev + 1);
  }, [
    blinkIds,
    dotRadius,
    dotScale,
    dotSpacing,
    height,
    placeDotRadius,
    placeDotScale,
    places,
    points,
    projection,
    ring,
    shouldBlink,
    width,
  ]);

  return (
    <div ref={wrapRef} style={{ width: "100%", position: "relative" }}>
      <div style={{ position: "relative", width: "100%", height, borderRadius: 14, overflow: "hidden" }}>
        <canvas
          ref={bgCanvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            pointerEvents: "none",
          }}
        />
        <canvas
          ref={fgCanvasRef}
          role="img"
          aria-label="Карта плотности заказов точками"
          onPointerDown={(event) => {
            if (!showTooltip) return;
            const canvas = fgCanvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = findPlaceHit(placeHitsRef.current, x, y);
            if (!hit) {
              setPinnedId(null);
              return;
            }
            setPinnedId((prev) => (prev === hit.id ? null : hit.id));
          }}
          onPointerMove={(event) => {
            if (!showTooltip) return;
            if (pinnedId) return;
            const canvas = fgCanvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            hoverPosRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };

            const run = () => {
              const pos = hoverPosRef.current;
              if (!pos) return;
              const hit = findPlaceHit(placeHitsRef.current, pos.x, pos.y);
              const nextId = hit?.id ?? null;
              if (lastHoverIdRef.current !== nextId) {
                lastHoverIdRef.current = nextId;
                setHoverId(nextId);
              }
            };

            if (typeof window.requestAnimationFrame !== "function") {
              run();
              return;
            }

            if (hoverFrameRef.current !== null) return;
            hoverFrameRef.current = window.requestAnimationFrame(() => {
              hoverFrameRef.current = null;
              run();
            });
          }}
          onPointerLeave={() => {
            if (!showTooltip) return;
            hoverPosRef.current = null;
            if (hoverFrameRef.current !== null) {
              window.cancelAnimationFrame(hoverFrameRef.current);
              hoverFrameRef.current = null;
            }
            if (!pinnedId) {
              lastHoverIdRef.current = null;
              setHoverId(null);
            }
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            cursor: showTooltip ? "pointer" : "default",
          }}
        />
      </div>
      {showTooltip && activeHit ? (
        <div
          style={{
            position: "absolute",
            left: clamp(activeHit.x + 10, 8, Math.max(8, width - 8)),
            top: clamp(activeHit.y - activeHit.r - 10, 8, Math.max(8, height - 8)),
            transform: "translate(0, -100%)",
            background: "rgba(255, 255, 255, 0.92)",
            border: "1px solid rgba(11, 18, 32, 0.10)",
            borderRadius: 12,
            padding: "8px 10px",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
            backdropFilter: "blur(10px)",
            pointerEvents: "none",
            maxWidth: 260,
            color: "rgb(11, 18, 32)",
          }}
        >
          <div style={{ fontWeight: 900, letterSpacing: 0.1, lineHeight: 1.15 }}>{activeHit.name}</div>
          <small style={{ color: "inherit" }}>{activeHit.count.toLocaleString("ru-RU")} заявок</small>
        </div>
      ) : null}
    </div>
  );
}
