"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { EmptyState, FieldBlock, PageAlert, SectionCard, SwitchField, ToneBadge } from "../../../components/admin-kit";
import { CollapsibleSection } from "../../../components/CollapsibleSection";
import { KeyNumberTable } from "../../../components/forms/KeyNumberTable";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import { normalizeCalcConfig, type CalcConfigFull, getDefaultCalcConfigFull } from "../../../lib/calcConfig";
import {
  BASE_RATE_LABELS,
  DOOR_SUBTYPE_LABELS,
  DESIGN_OPTION_LABELS,
  ENTRANCE_FILL_LABELS,
  GLASS_OPTION_LABELS,
  GLAZING_LABELS,
  KNOWN_OPTION_KEYS,
  LAMINATION_COLOR_LABELS,
  LAMINATION_GROUP_LABELS,
  LAMINATION_LABELS,
  LAMINATION_SIDE_LABELS,
  OPENING_TYPE_LABELS,
  OPTION_LABELS,
  PROFILE_MODEL_LABELS,
  PROFILE_SERIES_LABELS,
} from "../../../lib/calcConstants";
import { calculateQuote, type CalcInput, type CalcResultDTO } from "../../../lib/calcPreview";

function toNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toInt(value: string): number | null {
  const num = toNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, safe));
}

type HardwareOptionDraft = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

type ProfileModelDraft = {
  key: string;
  label: string;
  brand: string;
  depthMm: string;
  chambers: string;
  thermalCoefficient: string;
  description: string;
  legacySeries: string;
  legacyDepthMm: string;
  enabled: boolean;
};

type GlassOptionDraft = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ModeOption<T extends string> = {
  value: T;
  label: string;
};

function ModeToggleGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ModeOption<T>[];
  className?: string;
}): JSX.Element {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      variant="outline"
      size="sm"
      spacing={2}
      className={["grid w-full grid-cols-1 gap-2 sm:grid-cols-2", className].filter(Boolean).join(" ")}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="h-9 min-w-0 justify-center px-3 text-center">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const ALLOWED_GLASS_OPTION_KEYS = new Set(Object.keys(GLASS_OPTION_LABELS));

function NumberStepperField({
  label,
  value,
  onChange,
  inputMode = "numeric",
  min,
  max,
  step = 1,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  inputMode?: "decimal" | "numeric";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  const numericValue = toNumber(value);

  const clampValue = (next: number): number => {
    let result = next;
    if (min != null) result = Math.max(min, result);
    if (max != null) result = Math.min(max, result);
    return result;
  };

  const applyStep = (delta: -1 | 1) => {
    const fallback = numericValue ?? min ?? 0;
    const next = clampValue(fallback + delta * step);
    const normalized = Number.isInteger(step) ? String(Math.round(next)) : String(Number(next.toFixed(2)));
    onChange(normalized);
  };

  const canDecrement = !disabled && (numericValue != null ? (min == null ? true : numericValue > min) : min !== undefined);
  const canIncrement = !disabled && (numericValue != null ? (max == null ? true : numericValue < max) : true);

  return (
    <FieldBlock label={label} className={className}>
      <div className="grid h-10 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[disabled=true]:opacity-60" data-disabled={disabled ? "true" : undefined}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 rounded-none border-r border-border/70 shadow-none"
          disabled={!canDecrement}
          onClick={() => applyStep(-1)}
          aria-label={`Уменьшить: ${label}`}
        >
          -
        </Button>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          disabled={disabled}
          className="h-10 rounded-none border-0 bg-transparent text-center shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 rounded-none border-l border-border/70 shadow-none"
          disabled={!canIncrement}
          onClick={() => applyStep(1)}
          aria-label={`Увеличить: ${label}`}
        >
          +
        </Button>
      </div>
    </FieldBlock>
  );
}

export default function CalcSettingsPage(): JSX.Element {
  const session = useAdminSession();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [resetKey, setResetKey] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [profileModels, setProfileModels] = useState<ProfileModelDraft[]>([]);
  const [glassOptionCatalog, setGlassOptionCatalog] = useState<GlassOptionDraft[]>([]);
  const [hardwareOptions, setHardwareOptions] = useState<HardwareOptionDraft[]>([]);

  const [baseRates, setBaseRates] = useState<Record<string, number>>({});
  const [coeffMaterial, setCoeffMaterial] = useState<Record<string, number>>({});
  const [coeffProfileModel, setCoeffProfileModel] = useState<Record<string, number>>({});
  const [coeffProfileSeries, setCoeffProfileSeries] = useState<Record<string, number>>({});
  const [coeffProfileDepthMm, setCoeffProfileDepthMm] = useState<Record<string, number>>({});
  const [coeffGlazing, setCoeffGlazing] = useState<Record<string, number>>({});
  const [coeffLamination, setCoeffLamination] = useState<Record<string, number>>({});
  const [coeffLaminationSide, setCoeffLaminationSide] = useState<Record<string, number>>({});
  const [coeffLaminationGroup, setCoeffLaminationGroup] = useState<Record<string, number>>({});
  const [coeffLaminationColor, setCoeffLaminationColor] = useState<Record<string, number>>({});
  const [coeffDoorFillType, setCoeffDoorFillType] = useState<Record<string, number>>({});
  const [coeffDoorFillTop, setCoeffDoorFillTop] = useState<Record<string, number>>({});
  const [coeffDoorFillBottom, setCoeffDoorFillBottom] = useState<Record<string, number>>({});

  const [glassOptionCoefficients, setGlassOptionCoefficients] = useState<Record<string, string>>({});

  const [optionsFlat, setOptionsFlat] = useState<Record<string, number>>({});
  const [optionsPerM2, setOptionsPerM2] = useState<Record<string, number>>({});

  const [feeOpeningTurn, setFeeOpeningTurn] = useState("0");
  const [feeOpeningTiltTurn, setFeeOpeningTiltTurn] = useState("0");
  const [feeMeetingPairKit, setFeeMeetingPairKit] = useState("0");
  const [feeMullionPerM, setFeeMullionPerM] = useState("0");
  const [feeInstallPerM2, setFeeInstallPerM2] = useState("0");
  const [feeInstallPerSash, setFeeInstallPerSash] = useState("0");
  const [feeDeliveryBase, setFeeDeliveryBase] = useState("0");
  const [feeDeliveryFreeKm, setFeeDeliveryFreeKm] = useState("0");
  const [feeDeliveryPerKm, setFeeDeliveryPerKm] = useState("0");
  const [roundingStep, setRoundingStep] = useState("1");

  const [geomFwMm, setGeomFwMm] = useState("70");
  const [geomFhMm, setGeomFhMm] = useState("70");
  const [geomMwMm, setGeomMwMm] = useState("60");
  const [geomMinSashW, setGeomMinSashW] = useState("300");
  const [geomMaxSashW, setGeomMaxSashW] = useState("");
  const [geomMinSashH, setGeomMinSashH] = useState("400");
  const [geomMaxSashH, setGeomMaxSashH] = useState("");
  const [geomMinFixedW, setGeomMinFixedW] = useState("200");
  const [geomGlassInsetW, setGeomGlassInsetW] = useState("0");
  const [geomGlassInsetH, setGeomGlassInsetH] = useState("0");

  const [tableErrors, setTableErrors] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!db) return;

    setLoadError(null);
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "calc_config", "global"));
      const normalized = normalizeCalcConfig(snap.exists() ? snap.data() : undefined);
      const config = normalized.config;

      setWarnings(normalized.warnings);
      setExtras(normalized.extras);
      setProfileModels(
        (config.uiCatalog.profileModels ?? []).map((item) => ({
          key: typeof item?.key === "string" ? item.key.trim() : "",
          label: typeof item?.label === "string" ? item.label.trim() : "",
          brand: typeof item?.brand === "string" ? item.brand.trim() : "",
          depthMm: item?.depthMm == null ? "" : String(item.depthMm),
          chambers: item?.chambers == null ? "" : String(item.chambers),
          thermalCoefficient: typeof item?.thermalCoefficient === "string" ? item.thermalCoefficient.trim() : "",
          description: typeof item?.description === "string" ? item.description.trim() : "",
          legacySeries: typeof item?.legacySeries === "string" ? item.legacySeries.trim() : "",
          legacyDepthMm: item?.legacyDepthMm == null ? "" : String(item.legacyDepthMm),
          enabled: item?.enabled !== false,
        }))
      );
      setGlassOptionCatalog(
        (config.uiCatalog.glassOptions ?? []).flatMap((item) => {
          const key = typeof item?.key === "string" ? item.key.trim() : "";
          if (!key || !ALLOWED_GLASS_OPTION_KEYS.has(key)) return [];
          return [{
            key,
            label: typeof item?.label === "string" ? item.label.trim() : "",
            description: typeof item?.description === "string" ? item.description.trim() : "",
            enabled: item?.enabled !== false,
          }];
        })
      );
      setHardwareOptions(
        (config.uiCatalog.hardwareOptions ?? []).map((item) => ({
          key: typeof item?.key === "string" ? item.key.trim() : "",
          label: typeof item?.label === "string" ? item.label.trim() : "",
          description: typeof item?.description === "string" ? item.description.trim() : "",
          enabled: item?.enabled !== false,
        }))
      );

      setBaseRates(config.baseRates);

      setCoeffMaterial(config.coefficients.material);
      setCoeffProfileModel(config.coefficients.profileModel);
      setCoeffProfileSeries(config.coefficients.profileSeries);
      setCoeffProfileDepthMm(config.coefficients.profileDepthMm);
      setCoeffGlazing(config.coefficients.glazing);
      setCoeffLamination(config.coefficients.lamination);
      setCoeffLaminationSide(config.coefficients.laminationSide);
      setCoeffLaminationGroup(config.coefficients.laminationGroup);
      setCoeffLaminationColor(config.coefficients.laminationColor);
      setCoeffDoorFillType(config.coefficients.door.fillType);
      setCoeffDoorFillTop(config.coefficients.door.fillTop);
      setCoeffDoorFillBottom(config.coefficients.door.fillBottom);

      setGlassOptionCoefficients(
        Object.fromEntries(
          Object.entries(config.coefficients.glassOptions ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])
        )
      );

      {
        const flat: Record<string, number> = {};
        const perM2: Record<string, number> = {};
        for (const [key, value] of Object.entries(config.options ?? {})) {
          if (typeof value === "number") {
            flat[key] = value;
            continue;
          }
          if (isRecord(value)) {
            if (typeof value.flat === "number" && Number.isFinite(value.flat)) flat[key] = value.flat;
            if (typeof value.perM2 === "number" && Number.isFinite(value.perM2)) perM2[key] = value.perM2;
          }
        }
        setOptionsFlat(flat);
        setOptionsPerM2(perM2);
      }

      setFeeOpeningTurn(String(config.fees.openingSash.turn ?? 0));
      setFeeOpeningTiltTurn(String(config.fees.openingSash.tiltTurn ?? 0));
      setFeeMeetingPairKit(String(config.fees.meetingPairKit ?? 0));
      setFeeMullionPerM(String(config.fees.mullionPerM ?? 0));
      setFeeInstallPerM2(String(config.fees.install.perM2 ?? 0));
      setFeeInstallPerSash(String(config.fees.install.perSash ?? 0));
      setFeeDeliveryBase(String(config.fees.delivery.base ?? 0));
      setFeeDeliveryFreeKm(String(config.fees.delivery.freeKm ?? 0));
      setFeeDeliveryPerKm(String(config.fees.delivery.perKm ?? 0));
      setRoundingStep(String(config.roundingRules.step ?? 1));

      {
        const geom = config.windowGeometry ?? {};
        setGeomFwMm(String(geom.Fw_mm ?? 70));
        setGeomFhMm(String(geom.Fh_mm ?? 70));
        setGeomMwMm(String(geom.Mw_mm ?? 60));
        setGeomMinSashW(String(geom.minSashW_mm ?? 300));
        setGeomMaxSashW(geom.maxSashW_mm == null ? "" : String(geom.maxSashW_mm));
        setGeomMinSashH(String(geom.minSashH_mm ?? 400));
        setGeomMaxSashH(geom.maxSashH_mm == null ? "" : String(geom.maxSashH_mm));
        setGeomMinFixedW(String(geom.minFixedW_mm ?? 200));
        setGeomGlassInsetW(String(geom.glassInsetW_mm ?? 0));
        setGeomGlassInsetH(String(geom.glassInsetH_mm ?? 0));
      }

      setTableErrors({});
      setResetKey((prev) => prev + 1);
    } catch (error) {
      console.error("Load calc config failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void load();
  }, [load, session.status]);

  const configDraft = useMemo<CalcConfigFull>(() => {
    const defaults = getDefaultCalcConfigFull();
    const normalizedGlassOptionCoefficients = Object.fromEntries(
      Object.entries(glassOptionCoefficients).flatMap(([key, raw]) => {
        const num = toNumber(raw);
        return num == null ? [] : [[key, num]];
      })
    );

    const openingTurn = toNumber(feeOpeningTurn) ?? defaults.fees.openingSash.turn;
    const openingTilt = toNumber(feeOpeningTiltTurn) ?? defaults.fees.openingSash.tiltTurn;

    const installPerM2 = toNumber(feeInstallPerM2) ?? defaults.fees.install.perM2;
    const installPerSash = toNumber(feeInstallPerSash) ?? defaults.fees.install.perSash;

    const deliveryBase = toNumber(feeDeliveryBase) ?? defaults.fees.delivery.base;
    const deliveryFreeKm = toNumber(feeDeliveryFreeKm) ?? defaults.fees.delivery.freeKm;
    const deliveryPerKm = toNumber(feeDeliveryPerKm) ?? defaults.fees.delivery.perKm;

    const step = toInt(roundingStep);
    const safeStep = step && step > 0 ? step : defaults.roundingRules.step;

    const meetingPairKit = toNumber(feeMeetingPairKit) ?? defaults.fees.meetingPairKit;
    const mullionPerM = toNumber(feeMullionPerM) ?? defaults.fees.mullionPerM;

    const combinedOptions: Record<string, any> = {};
    const optionKeys = new Set([...Object.keys(optionsFlat), ...Object.keys(optionsPerM2)]);
    for (const key of optionKeys) {
      const flat = optionsFlat[key];
      const perM2 = optionsPerM2[key];
      if (flat != null && perM2 != null) {
        combinedOptions[key] = { flat, perM2 };
      } else if (flat != null) {
        combinedOptions[key] = flat;
      } else if (perM2 != null) {
        combinedOptions[key] = { perM2 };
      }
    }

    const fw = toNumber(geomFwMm) ?? defaults.windowGeometry.Fw_mm ?? 70;
    const fh = toNumber(geomFhMm) ?? defaults.windowGeometry.Fh_mm ?? 70;
    const mw = toNumber(geomMwMm) ?? defaults.windowGeometry.Mw_mm ?? 60;
    const minSashW = toNumber(geomMinSashW) ?? defaults.windowGeometry.minSashW_mm ?? 300;
    const minSashH = toNumber(geomMinSashH) ?? defaults.windowGeometry.minSashH_mm ?? 400;
    const minFixedW = toNumber(geomMinFixedW) ?? defaults.windowGeometry.minFixedW_mm ?? 200;
    const insetW = toNumber(geomGlassInsetW) ?? defaults.windowGeometry.glassInsetW_mm ?? 0;
    const insetH = toNumber(geomGlassInsetH) ?? defaults.windowGeometry.glassInsetH_mm ?? 0;

    const maxSashW = geomMaxSashW.trim() ? toNumber(geomMaxSashW) : null;
    const maxSashH = geomMaxSashH.trim() ? toNumber(geomMaxSashH) : null;

    return {
      baseRates,
      coefficients: {
        material: coeffMaterial,
        profileModel: coeffProfileModel,
        profileSeries: coeffProfileSeries,
        profileDepthMm: coeffProfileDepthMm,
        glazing: coeffGlazing,
        lamination: coeffLamination,
        laminationSide: coeffLaminationSide,
        laminationGroup: coeffLaminationGroup,
        laminationColor: coeffLaminationColor,
        glassOptions: normalizedGlassOptionCoefficients,
        door: {
          fillType: coeffDoorFillType,
          fillTop: coeffDoorFillTop,
          fillBottom: coeffDoorFillBottom,
        },
      },
      options: combinedOptions,
      fees: {
        openingSash: {
          turn: openingTurn,
          tiltTurn: openingTilt,
        },
        meetingPairKit,
        mullionPerM,
        install: {
          perM2: installPerM2,
          perSash: installPerSash,
        },
        delivery: {
          base: deliveryBase,
          freeKm: deliveryFreeKm,
          perKm: deliveryPerKm,
        },
      },
      roundingRules: { step: safeStep },
      uiCatalog: {
        profileModels: profileModels.map((item) => ({
          key: item.key.trim(),
          label: item.label.trim(),
          brand: item.brand.trim(),
          depthMm: toInt(item.depthMm) ?? undefined,
          chambers: toInt(item.chambers) ?? undefined,
          thermalCoefficient: item.thermalCoefficient.trim() || undefined,
          description: item.description.trim() || undefined,
          legacySeries:
            item.legacySeries.trim() === "bautex" ||
            item.legacySeries.trim() === "kbe" ||
            item.legacySeries.trim() === "rehau" ||
            item.legacySeries.trim() === "kommerling"
              ? (item.legacySeries.trim() as CalcConfigFull["uiCatalog"]["profileModels"][number]["legacySeries"])
              : undefined,
          legacyDepthMm: toInt(item.legacyDepthMm) ?? undefined,
          enabled: Boolean(item.enabled),
        })),
        glassOptions: glassOptionCatalog
          .filter((item) => ALLOWED_GLASS_OPTION_KEYS.has(item.key.trim()))
          .map((item) => ({
            key: item.key.trim(),
            label: item.label.trim(),
            description: item.description.trim() || undefined,
            enabled: Boolean(item.enabled),
          })),
        hardwareOptions: hardwareOptions.map((opt) => ({
          key: opt.key.trim(),
          label: opt.label.trim(),
          description: opt.description.trim() || undefined,
          enabled: Boolean(opt.enabled),
        })),
      },
      windowGeometry: {
        Fw_mm: Math.max(0, fw),
        Fh_mm: Math.max(0, fh),
        Mw_mm: Math.max(0, mw),
        minSashW_mm: Math.max(0, minSashW),
        minSashH_mm: Math.max(0, minSashH),
        minFixedW_mm: Math.max(0, minFixedW),
        glassInsetW_mm: Math.max(0, insetW),
        glassInsetH_mm: Math.max(0, insetH),
        ...(typeof maxSashW === "number" && Number.isFinite(maxSashW) ? { maxSashW_mm: Math.max(0, maxSashW) } : {}),
        ...(typeof maxSashH === "number" && Number.isFinite(maxSashH) ? { maxSashH_mm: Math.max(0, maxSashH) } : {}),
      },
    };
  }, [
    baseRates,
    coeffDoorFillBottom,
    coeffDoorFillType,
    coeffDoorFillTop,
    coeffGlazing,
    coeffLamination,
    coeffLaminationColor,
    coeffLaminationSide,
    coeffLaminationGroup,
    coeffMaterial,
    coeffProfileModel,
    coeffProfileDepthMm,
    coeffProfileSeries,
    feeDeliveryBase,
    feeDeliveryFreeKm,
    feeDeliveryPerKm,
    feeInstallPerM2,
    feeInstallPerSash,
    feeMeetingPairKit,
    feeMullionPerM,
    feeOpeningTiltTurn,
    feeOpeningTurn,
    glassOptionCatalog,
    glassOptionCoefficients,
    geomFhMm,
    geomFwMm,
    geomGlassInsetH,
    geomGlassInsetW,
    geomMaxSashH,
    geomMaxSashW,
    geomMinFixedW,
    geomMinSashH,
    geomMinSashW,
    geomMwMm,
    hardwareOptions,
    optionsFlat,
    optionsPerM2,
    profileModels,
    roundingStep,
  ]);

  const leafErrors = useMemo(() => {
    const errs: string[] = [];

    const step = toInt(roundingStep);
    if (step === null || step < 1) errs.push("Округление: step должен быть числом >= 1.");

    const feeFields: Array<[string, string]> = [
      ["fees.openingSash.turn", feeOpeningTurn],
      ["fees.openingSash.tiltTurn", feeOpeningTiltTurn],
      ["fees.meetingPairKit", feeMeetingPairKit],
      ["fees.mullionPerM", feeMullionPerM],
      ["fees.install.perM2", feeInstallPerM2],
      ["fees.install.perSash", feeInstallPerSash],
      ["fees.delivery.base", feeDeliveryBase],
      ["fees.delivery.freeKm", feeDeliveryFreeKm],
      ["fees.delivery.perKm", feeDeliveryPerKm],
    ];

    for (const [label, raw] of feeFields) {
      const num = toNumber(raw);
      if (num === null) errs.push(`${label}: не число.`);
      else if (num < 0) errs.push(`${label}: должно быть >= 0.`);
    }

    const coeffFields = Object.entries(glassOptionCoefficients).map(
      ([key, raw]) => [`coefficients.glassOptions.${key}`, raw] as const
    );

    for (const [label, raw] of coeffFields) {
      if (!raw.trim()) continue;
      const num = toNumber(raw);
      if (num === null) errs.push(`${label}: не число.`);
      else if (num <= 0) errs.push(`${label}: должно быть > 0.`);
    }

    const geomFields: Array<[string, string]> = [
      ["windowGeometry.Fw_mm", geomFwMm],
      ["windowGeometry.Fh_mm", geomFhMm],
      ["windowGeometry.Mw_mm", geomMwMm],
      ["windowGeometry.minSashW_mm", geomMinSashW],
      ["windowGeometry.minSashH_mm", geomMinSashH],
      ["windowGeometry.minFixedW_mm", geomMinFixedW],
      ["windowGeometry.glassInsetW_mm", geomGlassInsetW],
      ["windowGeometry.glassInsetH_mm", geomGlassInsetH],
    ];

    for (const [label, raw] of geomFields) {
      const num = toNumber(raw);
      if (num === null) errs.push(`${label}: не число.`);
      else if (num < 0) errs.push(`${label}: должно быть >= 0.`);
    }

    const maxFields: Array<[string, string]> = [
      ["windowGeometry.maxSashW_mm", geomMaxSashW],
      ["windowGeometry.maxSashH_mm", geomMaxSashH],
    ];
    for (const [label, raw] of maxFields) {
      if (!raw.trim()) continue;
      const num = toNumber(raw);
      if (num === null) errs.push(`${label}: не число.`);
      else if (num <= 0) errs.push(`${label}: должно быть > 0 (или оставьте пустым).`);
    }

    const keyPattern = /^[a-z0-9_]+$/;
    const seenProfileKeys = new Set<string>();
    profileModels.forEach((item, idx) => {
      const key = item.key.trim().toLowerCase();
      const label = item.label.trim();
      if (!key) errs.push(`Модель профиля #${idx + 1}: key обязателен.`);
      else {
        if (!keyPattern.test(key)) errs.push(`Модель профиля "${item.key}": key должен быть в формате a-z, 0-9, _.`);
        if (seenProfileKeys.has(key)) errs.push(`Модель профиля: key "${item.key}" дублируется.`);
        seenProfileKeys.add(key);
      }
      if (!label) errs.push(`Модель профиля "${item.key || `#${idx + 1}`}": label обязателен.`);
    });

    const seenGlassKeys = new Set<string>();
    glassOptionCatalog.forEach((item, idx) => {
      const key = item.key.trim();
      const label = item.label.trim();
      if (!key) errs.push(`Опция стекла #${idx + 1}: key обязателен.`);
      else {
        const normalized = key.toLowerCase();
        if (!keyPattern.test(normalized)) errs.push(`Опция стекла "${key}": key должен быть в формате a-z, 0-9, _.`);
        if (seenGlassKeys.has(normalized)) errs.push(`Опция стекла: key "${key}" дублируется.`);
        seenGlassKeys.add(normalized);
      }
      if (!label) errs.push(`Опция стекла "${key || `#${idx + 1}`}": label обязателен.`);
    });

    const seenHardwareKeys = new Set<string>();
    hardwareOptions.forEach((opt, idx) => {
      const key = opt.key.trim();
      const label = opt.label.trim();

      if (!key) {
        errs.push(`Фурнитура #${idx + 1}: key обязателен.`);
      } else {
        const normalized = key.toLowerCase();
        if (!keyPattern.test(normalized)) {
          errs.push(`Фурнитура "${key}": key должен быть в формате a-z, 0-9, _.`);
        }
        if (seenHardwareKeys.has(normalized)) {
          errs.push(`Фурнитура: key "${key}" дублируется.`);
        }
        seenHardwareKeys.add(normalized);
      }

      if (!label) {
        errs.push(`Фурнитура "${key || `#${idx + 1}`}": label обязателен.`);
      }
    });

    return errs;
  }, [
    feeDeliveryBase,
    feeDeliveryFreeKm,
    feeDeliveryPerKm,
    feeInstallPerM2,
    feeInstallPerSash,
    feeMeetingPairKit,
    feeMullionPerM,
    feeOpeningTiltTurn,
    feeOpeningTurn,
    glassOptionCatalog,
    glassOptionCoefficients,
    geomFhMm,
    geomFwMm,
    geomGlassInsetH,
    geomGlassInsetW,
    geomMaxSashH,
    geomMaxSashW,
    geomMinFixedW,
    geomMinSashH,
    geomMinSashW,
    geomMwMm,
    hardwareOptions,
    profileModels,
    roundingStep,
  ]);

  const hasErrors = useMemo(() => {
    if (leafErrors.length) return true;
    return Object.values(tableErrors).some((list) => (list ?? []).length > 0);
  }, [leafErrors.length, tableErrors]);

  const onSave = async () => {
    if (!db) return;
    if (hasErrors) {
      setSavingError("Исправьте ошибки в настройках перед сохранением.");
      return;
    }

    setSaving(true);
    setSavingError(null);
    try {
      const payload: Record<string, unknown> = {
        ...extras,
        ...configDraft,
        updatedAt: serverTimestamp(),
        updatedBy: session.user?.email ?? null,
      };

      await setDoc(doc(db, "calc_config", "global"), payload);
      await load();
    } catch (error) {
      console.error("Save calc config failed:", error);
      setSavingError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Калькулятор" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const previewCard = <CalcPreview config={configDraft} />;

  return (
    <AdminShell
      title="Калькулятор"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <Button type="button" onClick={() => void onSave()} disabled={saving || loading || hasErrors}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </>
      }
    >
      {loadError ? <PageAlert title="Ошибка загрузки" description={loadError} /> : null}

      {warnings.length ? (
        <PageAlert
          title="Предупреждения"
          description={
            <div className="grid gap-2">
              <div>В документе есть значения, которые выглядят некорректно. Они были пропущены или приведены к дефолтам:</div>
              {warnings.slice(0, 10).map((msg) => (
                <div key={msg}>• {msg}</div>
              ))}
              {warnings.length > 10 ? <div>…и ещё {warnings.length - 10}</div> : null}
            </div>
          }
          variant="warning"
        />
      ) : null}

      {savingError ? <PageAlert title="Ошибка сохранения" description={savingError} /> : null}

      {leafErrors.length ? (
        <PageAlert
          title="Проверьте обязательные поля"
          description={
            <div className="grid gap-1">
              {leafErrors.map((msg) => (
                <div key={msg}>{msg}</div>
              ))}
            </div>
          }
        />
      ) : null}

      <CollapsibleSection
        storageKey="admin:calc_settings:base_rates:v1"
        title="Базовые ставки"
        subtitle="baseRates — базовая стоимость (используется как база для расчёта)"
        defaultOpen
      >
        <KeyNumberTable
          title="baseRates"
          subtitle="default обязателен. Пустое значение = ключ удалён (будут применены fallback-правила)."
          value={baseRates}
          resetKey={resetKey}
          normalizeKey={(key) => key.trim().toLowerCase()}
          lockedKeys={Object.keys(BASE_RATE_LABELS)}
          requiredKeys={["default"]}
          knownLabels={BASE_RATE_LABELS}
          keyPlaceholder="например: window"
          valuePlaceholder="например: 120"
          onChange={(next, meta) => {
            setBaseRates(next);
            setTableErrors((prev) => ({ ...prev, baseRates: meta.errors }));
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:coefficients:v1"
        title="Коэффициенты"
        subtitle="coefficients — множители (1 = без изменений)"
        defaultOpen={false}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Материал">
            <KeyNumberTable
              title="Материал"
              value={coeffMaterial}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              knownLabels={{ pvc: "ПВХ" }}
              keyPlaceholder="например: pvc"
              valuePlaceholder="например: 1"
              onChange={(next, meta) => {
                setCoeffMaterial(next);
                setTableErrors((prev) => ({ ...prev, coefficients_material: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Серия профиля">
            <KeyNumberTable
              title="Серия профиля"
              value={coeffProfileSeries}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(PROFILE_SERIES_LABELS)}
              knownLabels={PROFILE_SERIES_LABELS}
              keyPlaceholder="например: kbe"
              valuePlaceholder="например: 1.15"
              onChange={(next, meta) => {
                setCoeffProfileSeries(next);
                setTableErrors((prev) => ({ ...prev, coefficients_profileSeries: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Модель профиля">
            <KeyNumberTable
              title="Модель профиля"
              subtitle="Точный множитель по выбранной модели. Если profileModel задан, он используется вместо серии и глубины."
              value={coeffProfileModel}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(PROFILE_MODEL_LABELS)}
              knownLabels={PROFILE_MODEL_LABELS}
              keyPlaceholder="например: kbe_expert_70"
              valuePlaceholder="например: 1.08"
              onChange={(next, meta) => {
                setCoeffProfileModel(next);
                setTableErrors((prev) => ({ ...prev, coefficients_profileModel: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Глубина профиля">
            <KeyNumberTable
              title="Глубина профиля (мм)"
              subtitle="Ключ — число строкой: 60, 70, 80…"
              value={coeffProfileDepthMm}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim()}
              lockedKeys={["60", "70", "80", "90"]}
              knownLabels={{ "60": "60 мм", "70": "70 мм", "80": "80 мм", "90": "90 мм" }}
              keyPlaceholder="например: 70"
              valuePlaceholder="например: 1"
              onChange={(next, meta) => {
                setCoeffProfileDepthMm(next);
                setTableErrors((prev) => ({ ...prev, coefficients_profileDepthMm: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Стеклопакет">
            <KeyNumberTable
              title="Стеклопакет"
              value={coeffGlazing}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(GLAZING_LABELS)}
              knownLabels={GLAZING_LABELS}
              keyPlaceholder="например: double"
              valuePlaceholder="например: 1.2"
              onChange={(next, meta) => {
                setCoeffGlazing(next);
                setTableErrors((prev) => ({ ...prev, coefficients_glazing: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Ламинация">
            <KeyNumberTable
              title="Ламинация"
              value={coeffLamination}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim()}
              lockedKeys={Object.keys(LAMINATION_LABELS)}
              knownLabels={LAMINATION_LABELS}
              keyPlaceholder="например: oneSide"
              valuePlaceholder="например: 1.1"
              onChange={(next, meta) => {
                setCoeffLamination(next);
                setTableErrors((prev) => ({ ...prev, coefficients_lamination: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Сторона ламинации">
            <KeyNumberTable
              title="Сторона ламинации"
              subtitle="Применяется только если lamination == oneSide"
              value={coeffLaminationSide}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(LAMINATION_SIDE_LABELS)}
              knownLabels={LAMINATION_SIDE_LABELS}
              keyPlaceholder="например: outside"
              valuePlaceholder="например: 1.02"
              onChange={(next, meta) => {
                setCoeffLaminationSide(next);
                setTableErrors((prev) => ({ ...prev, coefficients_laminationSide: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Группа ламинации">
            <KeyNumberTable
              title="Группа ламинации"
              subtitle="Применяется только если lamination != none"
              value={coeffLaminationGroup}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(LAMINATION_GROUP_LABELS)}
              knownLabels={LAMINATION_GROUP_LABELS}
              keyPlaceholder="например: wood"
              valuePlaceholder="например: 1.05"
              onChange={(next, meta) => {
                setCoeffLaminationGroup(next);
                setTableErrors((prev) => ({ ...prev, coefficients_laminationGroup: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Цвет ламинации">
            <KeyNumberTable
              title="Цвет ламинации"
              subtitle="Тонкая надбавка поверх группы/стороны ламинации"
              value={coeffLaminationColor}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(LAMINATION_COLOR_LABELS)}
              knownLabels={LAMINATION_COLOR_LABELS}
              keyPlaceholder="например: gold_oak"
              valuePlaceholder="например: 1.03"
              onChange={(next, meta) => {
                setCoeffLaminationColor(next);
                setTableErrors((prev) => ({ ...prev, coefficients_laminationColor: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard
            title="Опции стекла"
            description="Если поле пустое, коэффициент считается равным 1."
            className="xl:col-span-2"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(GLASS_OPTION_LABELS).map(([key, label]) => (
                <FieldBlock key={key} label={label}>
                  <Input
                    value={glassOptionCoefficients[key] ?? ""}
                    onChange={(e) => setGlassOptionCoefficients((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="1"
                    inputMode="decimal"
                  />
                </FieldBlock>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Дверь: заполнение">
            <KeyNumberTable
              title="Дверь: заполнение"
              value={coeffDoorFillType}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(ENTRANCE_FILL_LABELS)}
              knownLabels={ENTRANCE_FILL_LABELS}
              keyPlaceholder="например: glass"
              valuePlaceholder="например: 1"
              onChange={(next, meta) => {
                setCoeffDoorFillType(next);
                setTableErrors((prev) => ({ ...prev, coefficients_door_fillType: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Дверь: верх двери">
            <KeyNumberTable
              title="Дверь: верх двери"
              subtitle="Если задано, имеет приоритет над fillType для верхней части"
              value={coeffDoorFillTop}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(ENTRANCE_FILL_LABELS)}
              knownLabels={ENTRANCE_FILL_LABELS}
              keyPlaceholder="например: glass"
              valuePlaceholder="например: 1.04"
              onChange={(next, meta) => {
                setCoeffDoorFillTop(next);
                setTableErrors((prev) => ({ ...prev, coefficients_door_fillTop: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Дверь: низ двери">
            <KeyNumberTable
              title="Дверь: низ двери"
              subtitle="Если задано, имеет приоритет над fillType для нижней части"
              value={coeffDoorFillBottom}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={Object.keys(ENTRANCE_FILL_LABELS)}
              knownLabels={ENTRANCE_FILL_LABELS}
              keyPlaceholder="например: sandwich"
              valuePlaceholder="например: 0.97"
              onChange={(next, meta) => {
                setCoeffDoorFillBottom(next);
                setTableErrors((prev) => ({ ...prev, coefficients_door_fillBottom: meta.errors }));
              }}
            />
          </SectionCard>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:options:v1"
        title="Комплектующие"
        subtitle="options — доплаты за комплектующие (flat) и/или за м² (perM2)"
        defaultOpen={false}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Комплектующие: flat">
            <KeyNumberTable
              title="Комплектующие: flat"
              subtitle="Фиксированная доплата. Ключи должны совпадать с приложением (например: mosquito_net)."
              value={optionsFlat}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={KNOWN_OPTION_KEYS}
              knownLabels={OPTION_LABELS}
              keyPlaceholder="например: mosquito_net"
              valuePlaceholder="например: 800"
              onChange={(next, meta) => {
                setOptionsFlat(next);
                setTableErrors((prev) => ({ ...prev, options_flat: meta.errors }));
              }}
            />
          </SectionCard>

          <SectionCard title="Комплектующие: perM2">
            <KeyNumberTable
              title="Комплектующие: perM2"
              subtitle="Доплата за м² (для стекла считается от суммарной площади стекла по секциям)."
              value={optionsPerM2}
              resetKey={resetKey}
              normalizeKey={(key) => key.trim().toLowerCase()}
              lockedKeys={["triplex", "tinted_glass"]}
              knownLabels={OPTION_LABELS}
              keyPlaceholder="например: triplex"
              valuePlaceholder="например: 2500"
              onChange={(next, meta) => {
                setOptionsPerM2(next);
                setTableErrors((prev) => ({ ...prev, options_perM2: meta.errors }));
              }}
            />
          </SectionCard>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:window_geometry:v1"
        title="Окна: геометрия"
        subtitle="windowGeometry — вычеты рамы/импоста и ограничения (мм)"
        defaultOpen={false}
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <SectionCard title="Вычеты (takeoffs)" className="xl:col-span-3">
            <div className="grid gap-4 md:grid-cols-3">
              <FieldBlock label="Fw_mm (рама слева/справа)">
                <Input value={geomFwMm} onChange={(e) => setGeomFwMm(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="Fh_mm (рама сверху/снизу)">
                <Input value={geomFhMm} onChange={(e) => setGeomFhMm(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="Mw_mm (верт. импост)">
                <Input value={geomMwMm} onChange={(e) => setGeomMwMm(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>

          <SectionCard title="Ограничения" className="xl:col-span-2">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="minSashW_mm">
                <Input value={geomMinSashW} onChange={(e) => setGeomMinSashW(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="maxSashW_mm (опц.)">
                <Input value={geomMaxSashW} onChange={(e) => setGeomMaxSashW(e.target.value)} inputMode="decimal" placeholder="пусто = нет" />
              </FieldBlock>
              <FieldBlock label="minSashH_mm">
                <Input value={geomMinSashH} onChange={(e) => setGeomMinSashH(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="maxSashH_mm (опц.)">
                <Input value={geomMaxSashH} onChange={(e) => setGeomMaxSashH(e.target.value)} inputMode="decimal" placeholder="пусто = нет" />
              </FieldBlock>
              <FieldBlock label="minFixedW_mm">
                <Input value={geomMinFixedW} onChange={(e) => setGeomMinFixedW(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>

          <SectionCard title="Стекло (опционально)">
            <div className="grid gap-4">
              <FieldBlock label="glassInsetW_mm">
                <Input value={geomGlassInsetW} onChange={(e) => setGeomGlassInsetW(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="glassInsetH_mm">
                <Input value={geomGlassInsetH} onChange={(e) => setGeomGlassInsetH(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:profile_catalog:v1"
        title="Каталог: модели профилей"
        subtitle="uiCatalog.profileModels — точные модели для калькулятора"
        defaultOpen={false}
      >
        <SectionCard
          title="Справочник профилей"
          description="Модель задаёт витринное описание и точный ключ для коэффициента profileModel."
        >
          <div className="grid gap-4">
            {profileModels.length ? (
              profileModels.map((item, idx) => (
                <div key={`profile-model-${idx}`} className="grid gap-4 rounded-2xl border border-border/70 bg-background/70 p-4 xl:grid-cols-[140px_minmax(0,1fr)_120px_100px_130px_180px_140px_120px_auto]">
                  <SwitchField
                    title="Включено"
                    checked={item.enabled}
                    onCheckedChange={(checked) =>
                      setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, enabled: checked } : row)))
                    }
                    size="sm"
                  />
                  <FieldBlock label="Key">
                    <Input
                      value={item.key}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row)))}
                      placeholder="например: rehau_grazio"
                    />
                  </FieldBlock>
                  <FieldBlock label="Название">
                    <Input
                      value={item.label}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)))}
                      placeholder="например: Rehau Grazio"
                    />
                  </FieldBlock>
                  <FieldBlock label="Бренд">
                    <Input
                      value={item.brand}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, brand: e.target.value } : row)))}
                      placeholder="Rehau"
                    />
                  </FieldBlock>
                  <FieldBlock label="Глубина">
                    <Input
                      value={item.depthMm}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, depthMm: e.target.value } : row)))}
                      inputMode="numeric"
                      placeholder="70"
                    />
                  </FieldBlock>
                  <FieldBlock label="Камеры">
                    <Input
                      value={item.chambers}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, chambers: e.target.value } : row)))}
                      inputMode="numeric"
                      placeholder="5"
                    />
                  </FieldBlock>
                  <FieldBlock label="Коэф.">
                    <Input
                      value={item.thermalCoefficient}
                      onChange={(e) =>
                        setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, thermalCoefficient: e.target.value } : row)))
                      }
                      placeholder="0.83"
                    />
                  </FieldBlock>
                  <FieldBlock label="Legacy series">
                    <NativeSelect
                      value={item.legacySeries || ""}
                      onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, legacySeries: e.target.value } : row)))}
                    >
                      <option value="">-</option>
                      {Object.entries(PROFILE_SERIES_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FieldBlock>
                  <FieldBlock label="Legacy depth">
                    <Input
                      value={item.legacyDepthMm}
                      onChange={(e) =>
                        setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, legacyDepthMm: e.target.value } : row)))
                      }
                      inputMode="numeric"
                      placeholder="70"
                    />
                  </FieldBlock>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => setProfileModels((prev) => prev.filter((_, i) => i !== idx))}>
                      Удалить
                    </Button>
                  </div>
                  <div className="xl:col-span-9">
                    <FieldBlock label="Описание">
                      <Input
                        value={item.description}
                        onChange={(e) => setProfileModels((prev) => prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)))}
                        placeholder="Короткое описание для калькулятора"
                      />
                    </FieldBlock>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Нет моделей" description="Добавьте первую модель профиля для калькулятора." />
            )}

            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setProfileModels((prev) => [
                    ...prev,
                    {
                      key: "",
                      label: "",
                      brand: "",
                      depthMm: "",
                      chambers: "",
                      thermalCoefficient: "",
                      description: "",
                      legacySeries: "",
                      legacyDepthMm: "",
                      enabled: true,
                    },
                  ])
                }
              >
                + Добавить модель
              </Button>
            </div>
          </div>
        </SectionCard>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:glass_catalog:v1"
        title="Каталог: опции стеклопакета"
        subtitle="uiCatalog.glassOptions — переключатели в калькуляторе"
        defaultOpen={false}
      >
        <SectionCard
          title="Справочник опций стекла"
          description="Текст из этого справочника используется в калькуляторе и подсказках."
        >
          <div className="grid gap-4">
            {glassOptionCatalog.length ? (
              glassOptionCatalog.map((item, idx) => (
                <div key={`glass-option-${idx}`} className="grid gap-4 rounded-2xl border border-border/70 bg-background/70 p-4 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <SwitchField
                    title="Включено"
                    checked={item.enabled}
                    onCheckedChange={(checked) =>
                      setGlassOptionCatalog((prev) => prev.map((row, i) => (i === idx ? { ...row, enabled: checked } : row)))
                    }
                    size="sm"
                  />
                  <FieldBlock label="Key">
                    <Input
                      value={item.key}
                      onChange={(e) => setGlassOptionCatalog((prev) => prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row)))}
                      placeholder="например: energySaving"
                    />
                  </FieldBlock>
                  <FieldBlock label="Название">
                    <Input
                      value={item.label}
                      onChange={(e) => setGlassOptionCatalog((prev) => prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)))}
                      placeholder="например: Энергосберегающий стеклопакет"
                    />
                  </FieldBlock>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => setGlassOptionCatalog((prev) => prev.filter((_, i) => i !== idx))}>
                      Удалить
                    </Button>
                  </div>
                  <div className="md:col-span-4">
                    <FieldBlock label="Описание">
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          setGlassOptionCatalog((prev) => prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)))
                        }
                        placeholder="Короткое описание эффекта"
                      />
                    </FieldBlock>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Нет опций" description="Добавьте первую опцию стеклопакета." />
            )}

            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGlassOptionCatalog((prev) => [...prev, { key: "", label: "", description: "", enabled: true }])}
              >
                + Добавить опцию
              </Button>
            </div>
          </div>
        </SectionCard>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:hardware_catalog:v1"
        title="Каталог: фурнитура"
        subtitle="uiCatalog.hardwareOptions — варианты выбора в калькуляторе (цена берётся из options по key)"
        defaultOpen={false}
      >
        <SectionCard
          title="Справочник фурнитуры"
          description="В приложении показываются только варианты с `enabled=true`. Для влияния на цену добавьте стоимость с тем же key в разделе комплектующих."
        >
          <div className="grid gap-4">
            {hardwareOptions.length ? (
              hardwareOptions.map((opt, idx) => (
                <div key={`hardware-${idx}`} className="grid gap-4 rounded-2xl border border-border/70 bg-background/70 p-4 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
                  <SwitchField
                    title="Включено"
                    checked={opt.enabled}
                    onCheckedChange={(checked) =>
                      setHardwareOptions((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, enabled: checked } : row))
                      )
                    }
                    size="sm"
                  />

                  <FieldBlock label="Key">
                    <Input
                      value={opt.key}
                      onChange={(e) =>
                        setHardwareOptions((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                        )
                      }
                      placeholder="например: titan_af"
                    />
                  </FieldBlock>

                  <FieldBlock label="Название">
                    <Input
                      value={opt.label}
                      onChange={(e) =>
                        setHardwareOptions((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row))
                        )
                      }
                      placeholder="например: Titan AF"
                    />
                  </FieldBlock>

                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => setHardwareOptions((prev) => prev.filter((_, i) => i !== idx))}>
                      Удалить
                    </Button>
                  </div>

                  <div className="md:col-span-4">
                    <FieldBlock label="Описание">
                      <Input
                        value={opt.description}
                        onChange={(e) =>
                          setHardwareOptions((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                          )
                        }
                        placeholder="Короткое описание для клиента"
                      />
                    </FieldBlock>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Нет вариантов" description="Добавьте первый вариант фурнитуры для калькулятора." />
            )}

            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setHardwareOptions((prev) => [
                    ...prev,
                    { key: "", label: "", description: "", enabled: true },
                  ])
                }
              >
                + Добавить вариант
              </Button>
            </div>
          </div>
        </SectionCard>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:fees:v1"
        title="Сборы и услуги"
        subtitle="fees — доплаты за створки, монтаж, доставку"
        defaultOpen={false}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Створки">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="Поворотная створка (turn)">
                <Input value={feeOpeningTurn} onChange={(e) => setFeeOpeningTurn(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="Повор.-откидная (tiltTurn)">
                <Input value={feeOpeningTiltTurn} onChange={(e) => setFeeOpeningTiltTurn(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>

          <SectionCard title="Окна">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="Meeting pair kit (fees.meetingPairKit)">
                <Input value={feeMeetingPairKit} onChange={(e) => setFeeMeetingPairKit(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="Импост за метр (fees.mullionPerM)">
                <Input value={feeMullionPerM} onChange={(e) => setFeeMullionPerM(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>

          <SectionCard title="Монтаж">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="За м² (perM2)">
                <Input value={feeInstallPerM2} onChange={(e) => setFeeInstallPerM2(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="За створку (perSash)">
                <Input value={feeInstallPerSash} onChange={(e) => setFeeInstallPerSash(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>

          <SectionCard title="Доставка">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="База (base)">
                <Input value={feeDeliveryBase} onChange={(e) => setFeeDeliveryBase(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="Бесплатно км (freeKm)">
                <Input value={feeDeliveryFreeKm} onChange={(e) => setFeeDeliveryFreeKm(e.target.value)} inputMode="decimal" />
              </FieldBlock>
              <FieldBlock label="За км (perKm)">
                <Input value={feeDeliveryPerKm} onChange={(e) => setFeeDeliveryPerKm(e.target.value)} inputMode="decimal" />
              </FieldBlock>
            </div>
          </SectionCard>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:rounding:v1"
        title="Округление"
        subtitle="roundingRules.step — шаг округления итоговой суммы"
        defaultOpen={false}
      >
        <SectionCard title="Шаг">
          <FieldBlock label="step">
            <Input value={roundingStep} onChange={(e) => setRoundingStep(e.target.value)} inputMode="numeric" />
          </FieldBlock>
        </SectionCard>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:preview:v1"
        title="Проверка расчёта"
        subtitle="Быстро проверь, что новые ставки дают ожидаемый итог"
        defaultOpen={false}
      >
        {previewCard}
      </CollapsibleSection>

      {Object.keys(extras).length ? (
        <CollapsibleSection
          storageKey="admin:calc_settings:extras:v1"
          title="Дополнительные поля"
          subtitle="Эти поля не относятся к настройкам калькулятора и сохраняются как есть"
          defaultOpen={false}
        >
          <SectionCard title="extras">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">Ключ</TableHead>
                  <TableHead>Значение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(extras)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{key}</TableCell>
                      <TableCell>
                        <div className="break-all text-sm text-muted-foreground">{JSON.stringify(value)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </SectionCard>
        </CollapsibleSection>
      ) : null}

    </AdminShell>
  );
}

function CalcPreview({ config }: { config: CalcConfigFull }): JSX.Element {
  type DesignOption = "none" | "outside" | "inside" | "twoSideWhite" | "twoSideColor";

  const [widthCm, setWidthCm] = useState("120");
  const [heightCm, setHeightCm] = useState("140");
  const [quantity, setQuantity] = useState("1");
  const [productType, setProductType] = useState<"window" | "door">("window");
  const [doorSubtype, setDoorSubtype] = useState<keyof typeof DOOR_SUBTYPE_LABELS>("balcony");
  const [sashCount, setSashCount] = useState("2");
  const [openingSashes, setOpeningSashes] = useState("1");
  const [openingType, setOpeningType] = useState<keyof typeof OPENING_TYPE_LABELS>("tiltTurn");
  const [meetingPairNoMullion, setMeetingPairNoMullion] = useState(false);
  const [profileSeries, setProfileSeries] = useState<keyof typeof PROFILE_SERIES_LABELS>("kbe");
  const [profileDepthMm, setProfileDepthMm] = useState("70");
  const [glazing, setGlazing] = useState<keyof typeof GLAZING_LABELS>("double");
  const [designOption, setDesignOption] = useState<DesignOption>("none");
  const [laminationColor, setLaminationColor] = useState<keyof typeof LAMINATION_COLOR_LABELS>("gold_oak");
  const lamination = designOption === "none" ? "none" : designOption === "outside" || designOption === "inside" ? "oneSide" : "twoSide";
  const laminationSide = designOption === "inside" ? "inside" : designOption === "outside" ? "outside" : undefined;
  const laminationGroup = designOption === "twoSideColor" ? "color" : designOption === "twoSideWhite" ? "white" : undefined;
  const [fillType, setFillType] = useState<keyof typeof ENTRANCE_FILL_LABELS>("glass");
  const [fillTop, setFillTop] = useState<keyof typeof ENTRANCE_FILL_LABELS>("glass");
  const [fillBottom, setFillBottom] = useState<keyof typeof ENTRANCE_FILL_LABELS>("glass");
  const [hardwareKey, setHardwareKey] = useState("");

  const [energySaving, setEnergySaving] = useState(false);
  const [multiFunctional, setMultiFunctional] = useState(false);

  const [installEnabled, setInstallEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryKm, setDeliveryKm] = useState("0");

  const [selectedOptions, setSelectedOptions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const key of KNOWN_OPTION_KEYS) initial[key] = false;
    return initial;
  });

  const meetingPairEligible = useMemo(() => {
    const sash = clampInt(toInt(sashCount) ?? 2, 1, 3);
    const opening = clampInt(toInt(openingSashes) ?? 1, 0, sash);
    return productType === "window" && sash === 2 && opening === 2;
  }, [openingSashes, productType, sashCount]);

  useEffect(() => {
    if (!meetingPairEligible && meetingPairNoMullion) {
      setMeetingPairNoMullion(false);
    }
  }, [meetingPairEligible, meetingPairNoMullion]);

  const hardwareCatalog = useMemo(
    () =>
      (config.uiCatalog?.hardwareOptions ?? [])
        .filter((item: CalcConfigFull["uiCatalog"]["hardwareOptions"][number]) => item?.enabled !== false && typeof item?.key === "string" && item.key.trim())
        .map((item: CalcConfigFull["uiCatalog"]["hardwareOptions"][number]) => ({
          key: String(item?.key).trim().toLowerCase(),
          label: typeof item?.label === "string" && item.label.trim() ? item.label.trim() : String(item?.key).trim(),
        })),
    [config.uiCatalog?.hardwareOptions]
  );

  useEffect(() => {
    if (!hardwareCatalog.length) {
      if (hardwareKey) setHardwareKey("");
      return;
    }
    if (hardwareKey && hardwareCatalog.some((item) => item.key === hardwareKey)) return;
    setHardwareKey(hardwareCatalog[0]?.key ?? "");
  }, [hardwareCatalog, hardwareKey]);

  const previewInput = useMemo<CalcInput>(() => {
    const width = toNumber(widthCm) ?? 0;
    const height = toNumber(heightCm) ?? 0;
    const qty = toInt(quantity) ?? 1;

    const sash = clampInt(toInt(sashCount) ?? 2, 1, 3);
    const opening = clampInt(toInt(openingSashes) ?? 1, 0, sash);

    const depth = toInt(profileDepthMm) ?? 70;

    const options = Object.entries(selectedOptions)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const isEntranceLike = productType === "door" && (doorSubtype === "entrance" || doorSubtype === "interior");

    return {
      width: Math.max(0, width / 100),
      height: Math.max(0, height / 100),
      quantity: clampInt(qty, 1, 999),
      productType,
      material: "pvc",
      options,

      doorSubtype: productType === "door" ? doorSubtype : undefined,
      sashCount: sash,
      openingSashes: opening,
      openingType,
      windowMeetingPairNoMullion: meetingPairEligible && meetingPairNoMullion ? true : undefined,

      profileSeries,
      profileDepthMm: depth,
      glazing,
      glassOptions: { energySaving, multiFunctional },
      lamination,
      laminationGroup,
      laminationSide,
      laminationColor: lamination === "none" ? undefined : laminationColor,

      entranceOptions: isEntranceLike ? { fillType, fillTop, fillBottom } : undefined,
      hardwareKey: productType === "door" && hardwareKey ? hardwareKey : undefined,
      hardwareLabel:
        productType === "door" && hardwareKey
          ? hardwareCatalog.find((item) => item.key === hardwareKey)?.label ?? undefined
          : undefined,

      services: {
        installEnabled,
        deliveryEnabled,
        deliveryKm: Math.max(0, toNumber(deliveryKm) ?? 0),
      },
    };
  }, [
    meetingPairEligible,
    meetingPairNoMullion,
    deliveryEnabled,
    deliveryKm,
    doorSubtype,
    energySaving,
    fillBottom,
    fillType,
    fillTop,
    glazing,
    hardwareCatalog,
    hardwareKey,
    heightCm,
    installEnabled,
    laminationColor,
    designOption,
    multiFunctional,
    openingSashes,
    openingType,
    productType,
    profileDepthMm,
    profileSeries,
    quantity,
    sashCount,
    selectedOptions,
    widthCm,
  ]);

  const preview = useMemo(() => {
    try {
      return { dto: calculateQuote(previewInput, config, "RUB") };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [config, previewInput]);

  return (
    <div className="grid gap-4">
      <SectionCard title="Параметры изделия" description="Мини-симулятор расчёта на основе текущего config draft.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberStepperField label="Ширина (см)" value={widthCm} onChange={setWidthCm} inputMode="decimal" min={20} step={5} />
          <NumberStepperField label="Высота (см)" value={heightCm} onChange={setHeightCm} inputMode="decimal" min={20} step={5} />
          <NumberStepperField label="Количество" value={quantity} onChange={setQuantity} min={1} step={1} />
          <FieldBlock label="Тип">
            <ModeToggleGroup<"window" | "door">
              value={productType}
              onChange={setProductType}
              options={[
                { value: "window", label: "Окно" },
                { value: "door", label: "Дверь" },
              ]}
              className="sm:grid-cols-1"
            />
          </FieldBlock>

          {productType === "door" ? (
            <FieldBlock label="Подтип двери">
              <ModeToggleGroup<keyof typeof DOOR_SUBTYPE_LABELS>
                value={doorSubtype}
                onChange={setDoorSubtype}
                options={Object.entries(DOOR_SUBTYPE_LABELS).map(([key, label]) => ({
                  value: key as keyof typeof DOOR_SUBTYPE_LABELS,
                  label,
                }))}
                className="sm:grid-cols-1"
              />
            </FieldBlock>
          ) : null}

          <NumberStepperField label="Створок" value={sashCount} onChange={setSashCount} min={1} step={1} />
          <NumberStepperField label="Открывающихся" value={openingSashes} onChange={setOpeningSashes} min={0} step={1} />
          <FieldBlock label="Открывание">
            <ModeToggleGroup<keyof typeof OPENING_TYPE_LABELS>
              value={openingType}
              onChange={setOpeningType}
              options={Object.entries(OPENING_TYPE_LABELS).map(([key, label]) => ({
                value: key as keyof typeof OPENING_TYPE_LABELS,
                label,
              }))}
              className="sm:grid-cols-1"
            />
          </FieldBlock>

          {meetingPairEligible ? (
            <SwitchField
              title="Без импоста (meeting pair)"
              checked={meetingPairNoMullion}
              onCheckedChange={setMeetingPairNoMullion}
              className="xl:col-span-2"
            />
          ) : null}

          <FieldBlock label="Серия профиля">
            <ModeToggleGroup<keyof typeof PROFILE_SERIES_LABELS>
              value={profileSeries}
              onChange={setProfileSeries}
              options={Object.entries(PROFILE_SERIES_LABELS).map(([key, label]) => ({
                value: key as keyof typeof PROFILE_SERIES_LABELS,
                label,
              }))}
              className="sm:grid-cols-1"
            />
          </FieldBlock>
          <NumberStepperField label="Глубина (мм)" value={profileDepthMm} onChange={setProfileDepthMm} min={40} step={5} />
          <FieldBlock label="Стеклопакет">
            <ModeToggleGroup<keyof typeof GLAZING_LABELS>
              value={glazing}
              onChange={setGlazing}
              options={Object.entries(GLAZING_LABELS).map(([key, label]) => ({
                value: key as keyof typeof GLAZING_LABELS,
                label,
              }))}
              className="sm:grid-cols-1"
            />
          </FieldBlock>
          <FieldBlock label="Дизайн">
            <NativeSelect value={designOption} onChange={(e) => setDesignOption(e.target.value as DesignOption)}>
              <option value="none">{DESIGN_OPTION_LABELS.none}</option>
              <option value="outside">{DESIGN_OPTION_LABELS.outside}</option>
              <option value="inside">{DESIGN_OPTION_LABELS.inside}</option>
              <option value="twoSideWhite">{DESIGN_OPTION_LABELS.twoSideWhite}</option>
              <option value="twoSideColor">{DESIGN_OPTION_LABELS.twoSideColor}</option>
            </NativeSelect>
          </FieldBlock>
          {designOption !== "none" ? (
            <FieldBlock label="Цвет ламинации">
              <NativeSelect value={laminationColor} onChange={(e) => setLaminationColor(e.target.value as keyof typeof LAMINATION_COLOR_LABELS)}>
                {Object.entries(LAMINATION_COLOR_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
          ) : null}
          {productType === "door" && hardwareCatalog.length ? (
            <FieldBlock label="Фурнитура">
              <NativeSelect value={hardwareKey} onChange={(e) => setHardwareKey(e.target.value)}>
                {hardwareCatalog.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
          ) : null}
        </div>

        {productType === "door" && (doorSubtype === "entrance" || doorSubtype === "interior") ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FieldBlock label="Общее заполнение">
              <ModeToggleGroup<keyof typeof ENTRANCE_FILL_LABELS>
                value={fillType}
                onChange={setFillType}
                options={Object.entries(ENTRANCE_FILL_LABELS).map(([key, label]) => ({
                  value: key as keyof typeof ENTRANCE_FILL_LABELS,
                  label,
                }))}
                className="sm:grid-cols-1"
              />
            </FieldBlock>
            <FieldBlock label="Верх двери">
              <NativeSelect value={fillTop} onChange={(e) => setFillTop(e.target.value as keyof typeof ENTRANCE_FILL_LABELS)}>
                {Object.entries(ENTRANCE_FILL_LABELS).map(([key, label]) => (
                  <option key={`top-${key}`} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
            <FieldBlock label="Низ двери">
              <NativeSelect value={fillBottom} onChange={(e) => setFillBottom(e.target.value as keyof typeof ENTRANCE_FILL_LABELS)}>
                {Object.entries(ENTRANCE_FILL_LABELS).map(([key, label]) => (
                  <option key={`bottom-${key}`} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SwitchField
            title="Энергосбережение"
            checked={energySaving}
            onCheckedChange={setEnergySaving}
          />
          <SwitchField
            title="Мультифункциональное"
            checked={multiFunctional}
            onCheckedChange={setMultiFunctional}
          />
        </div>
      </SectionCard>

      <SectionCard title="Комплектующие">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {KNOWN_OPTION_KEYS.map((key) => (
            <SwitchField
              key={key}
              title={OPTION_LABELS[key] ?? key}
              checked={Boolean(selectedOptions[key])}
              onCheckedChange={(checked) => setSelectedOptions((prev) => ({ ...prev, [key]: checked }))}
              size="sm"
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Услуги">
        <div className="grid gap-4 md:grid-cols-2">
          <SwitchField
            title="Монтаж"
            checked={installEnabled}
            onCheckedChange={setInstallEnabled}
          />
          <SwitchField
            title="Доставка"
            checked={deliveryEnabled}
            onCheckedChange={setDeliveryEnabled}
          />
          <NumberStepperField
            label="Км доставки"
            value={deliveryKm}
            onChange={setDeliveryKm}
            inputMode="decimal"
            min={0}
            step={1}
            disabled={!deliveryEnabled}
            className="md:col-span-2"
          />
        </div>
      </SectionCard>

      {preview.error ? (
        <PageAlert title="Ошибка расчёта" description={preview.error} />
      ) : preview.dto ? (
        <SectionCard title="Итог" description="Сводка по pricing factors и derived values.">
          <div className="grid gap-4">
            {preview.dto.issues.errors.length ? (
              <PageAlert
                title="Ошибки расчёта"
                description={
                  <div className="grid gap-1">
                    {preview.dto.issues.errors.slice(0, 3).map((e) => (
                      <div key={e.code}>
                        <b>{e.code}</b>: {e.message}
                      </div>
                    ))}
                  </div>
                }
              />
            ) : null}

            {preview.dto.issues.warnings.length ? (
              <PageAlert
                title="Предупреждения"
                description={preview.dto.issues.warnings.slice(0, 3).map((w) => `${w.code}: ${w.message}`).join(" · ")}
                variant="warning"
              />
            ) : null}

            <div className="flex flex-wrap gap-2">
              <ToneBadge tone="outline">Subtotal: {preview.dto.pricing.subtotal.toLocaleString("ru-RU")}</ToneBadge>
              <ToneBadge tone="success">Total: {preview.dto.pricing.total.toLocaleString("ru-RU")}</ToneBadge>
              <ToneBadge tone="outline">baseKey: {preview.dto.pricing.factors.baseKey}</ToneBadge>
              <ToneBadge tone="outline">area: {preview.dto.pricing.factors.area.toFixed(3)}</ToneBadge>
            </div>

            {preview.dto.pricing.breakdown.groups.length ? (
              <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="text-sm font-medium">Состав сметы</div>
                <div className="grid gap-3">
                  {preview.dto.pricing.breakdown.groups.map((group) => (
                    <div key={group.key} className="grid gap-2 rounded-xl border border-border/60 bg-card/60 p-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-medium">
                        <span>{group.key}</span>
                        <span>{group.total.toLocaleString("ru-RU")}</span>
                      </div>
                      <div className="grid gap-1 text-sm text-muted-foreground">
                        {group.items.map((item: CalcResultDTO["pricing"]["lineItems"][number]) => (
                          <div key={`${group.key}:${item.key}:${item.title ?? ""}`} className="flex items-start justify-between gap-3">
                            <span>{item.title ?? item.key}</span>
                            <span>{item.total.toLocaleString("ru-RU")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="text-sm font-medium">Базовые факторы</div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div>Subtotal: {preview.dto.pricing.subtotal.toLocaleString("ru-RU")}</div>
                  <div>Total: {preview.dto.pricing.total.toLocaleString("ru-RU")}</div>
                  <div>baseKey: {preview.dto.pricing.factors.baseKey}</div>
                  <div>baseRate: {preview.dto.pricing.factors.baseRate}</div>
                  <div>area: {preview.dto.pricing.factors.area.toFixed(3)}</div>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="text-sm font-medium">Надбавки и сервисы</div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div>Комплектующие: {preview.dto.pricing.factors.optionsTotal.toLocaleString("ru-RU")}</div>
                  <div>Фурнитура: {preview.dto.pricing.factors.hardwareTotal.toLocaleString("ru-RU")}</div>
                  <div>
                    Створки: {preview.dto.pricing.factors.openingSashes} / {preview.dto.pricing.factors.openingSashFee.toLocaleString("ru-RU")}
                  </div>
                  <div>
                    Meeting pair: {preview.dto.derived.meetingPairKitCount} / {preview.dto.pricing.factors.meetingPairKitFee.toLocaleString("ru-RU")}
                  </div>
                  <div>
                    Импосты: {preview.dto.derived.mullionCount} / {preview.dto.pricing.factors.mullionFee.toLocaleString("ru-RU")}
                  </div>
                  <div>Изделия без услуг: {preview.dto.pricing.factors.itemsSubtotal.toLocaleString("ru-RU")}</div>
                  <div>Монтаж: {preview.dto.pricing.factors.installFee.toLocaleString("ru-RU")}</div>
                  <div>Доставка: {preview.dto.pricing.factors.deliveryFee.toLocaleString("ru-RU")}</div>
                  <div>Округление: {preview.dto.pricing.factors.roundingDelta.toLocaleString("ru-RU")}</div>
                  <div>
                    Стекло, м²: {typeof preview.dto.derived.glassAreaTotal_m2 === "number" ? preview.dto.derived.glassAreaTotal_m2.toFixed(3) : "-"}
                  </div>
                  <div>
                    Секции (мм): {preview.dto.sections.length ? preview.dto.sections.map((s) => `${s.index + 1}:${s.secW_mm}`).join(", ") : "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
