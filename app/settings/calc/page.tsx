"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { CollapsibleSection } from "../../../components/CollapsibleSection";
import { KeyNumberTable } from "../../../components/forms/KeyNumberTable";
import { normalizeCalcConfig, type CalcConfigFull, getDefaultCalcConfigFull } from "../../../lib/calcConfig";
import {
  BASE_RATE_LABELS,
  DOOR_SUBTYPE_LABELS,
  DESIGN_OPTION_LABELS,
  ENTRANCE_FILL_LABELS,
  GLAZING_LABELS,
  KNOWN_OPTION_KEYS,
  LAMINATION_GROUP_LABELS,
  LAMINATION_LABELS,
  LAMINATION_SIDE_LABELS,
  OPENING_TYPE_LABELS,
  OPTION_LABELS,
  PROFILE_SERIES_LABELS,
} from "../../../lib/calcConstants";
import { calculateQuote, type CalcInput } from "../../../lib/calcPreview";

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
  enabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  const [hardwareOptions, setHardwareOptions] = useState<HardwareOptionDraft[]>([]);

  const [baseRates, setBaseRates] = useState<Record<string, number>>({});
  const [coeffMaterial, setCoeffMaterial] = useState<Record<string, number>>({});
  const [coeffProfileSeries, setCoeffProfileSeries] = useState<Record<string, number>>({});
  const [coeffProfileDepthMm, setCoeffProfileDepthMm] = useState<Record<string, number>>({});
  const [coeffGlazing, setCoeffGlazing] = useState<Record<string, number>>({});
  const [coeffLamination, setCoeffLamination] = useState<Record<string, number>>({});
  const [coeffLaminationSide, setCoeffLaminationSide] = useState<Record<string, number>>({});
  const [coeffLaminationGroup, setCoeffLaminationGroup] = useState<Record<string, number>>({});
  const [coeffDoorFillType, setCoeffDoorFillType] = useState<Record<string, number>>({});

  const [glassEnergySavingCoeff, setGlassEnergySavingCoeff] = useState<string>("");
  const [glassMultiFunctionalCoeff, setGlassMultiFunctionalCoeff] = useState<string>("");

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
      {
        const uiCatalog = isRecord(normalized.extras.uiCatalog) ? normalized.extras.uiCatalog : null;
        const rawList = uiCatalog && Array.isArray((uiCatalog as any).hardwareOptions) ? (uiCatalog as any).hardwareOptions : [];
        const parsed: HardwareOptionDraft[] = Array.isArray(rawList)
          ? rawList
              .map((item) => {
                if (!isRecord(item)) return null;
                const key = typeof item.key === "string" ? item.key.trim() : "";
                const label = typeof item.label === "string" ? item.label.trim() : "";
                const enabled = item.enabled !== false;
                if (!key && !label) return null;
                return { key, label, enabled };
              })
              .filter((v): v is HardwareOptionDraft => Boolean(v))
          : [];
        setHardwareOptions(parsed);
      }

      setBaseRates(config.baseRates);

      setCoeffMaterial(config.coefficients.material);
      setCoeffProfileSeries(config.coefficients.profileSeries);
      setCoeffProfileDepthMm(config.coefficients.profileDepthMm);
      setCoeffGlazing(config.coefficients.glazing);
      setCoeffLamination(config.coefficients.lamination);
      setCoeffLaminationSide(config.coefficients.laminationSide);
      setCoeffLaminationGroup(config.coefficients.laminationGroup);
      setCoeffDoorFillType(config.coefficients.door.fillType);

      setGlassEnergySavingCoeff(
        config.coefficients.glassOptions.energySaving == null ? "" : String(config.coefficients.glassOptions.energySaving)
      );
      setGlassMultiFunctionalCoeff(
        config.coefficients.glassOptions.multiFunctional == null ? "" : String(config.coefficients.glassOptions.multiFunctional)
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

    const energySaving = toNumber(glassEnergySavingCoeff);
    const multiFunctional = toNumber(glassMultiFunctionalCoeff);

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
        profileSeries: coeffProfileSeries,
        profileDepthMm: coeffProfileDepthMm,
        glazing: coeffGlazing,
        lamination: coeffLamination,
        laminationSide: coeffLaminationSide,
        laminationGroup: coeffLaminationGroup,
        glassOptions: {
          ...(energySaving == null ? {} : { energySaving }),
          ...(multiFunctional == null ? {} : { multiFunctional }),
        },
        door: {
          fillType: coeffDoorFillType,
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
    coeffDoorFillType,
    coeffGlazing,
    coeffLamination,
    coeffLaminationSide,
    coeffLaminationGroup,
    coeffMaterial,
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
    glassEnergySavingCoeff,
    glassMultiFunctionalCoeff,
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
    optionsFlat,
    optionsPerM2,
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

    const coeffFields: Array<[string, string]> = [
      ["coefficients.glassOptions.energySaving", glassEnergySavingCoeff],
      ["coefficients.glassOptions.multiFunctional", glassMultiFunctionalCoeff],
    ];

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
    glassEnergySavingCoeff,
    glassMultiFunctionalCoeff,
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
      const uiCatalogPrev = isRecord(extras.uiCatalog) ? extras.uiCatalog : {};
      const uiCatalogNext = {
        ...uiCatalogPrev,
        hardwareOptions: hardwareOptions.map((opt) => ({
          key: opt.key.trim(),
          label: opt.label.trim(),
          enabled: Boolean(opt.enabled),
        })),
      };

      const extrasNext: Record<string, unknown> = {
        ...extras,
        uiCatalog: uiCatalogNext,
      };

      const payload: Record<string, unknown> = {
        ...extrasNext,
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
          <button type="button" onClick={() => void onSave()} disabled={saving || loading || hasErrors}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Загрузка..." : "Обновить"}
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >

      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка загрузки</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      {warnings.length ? (
        <section className="card noticeCard noticeCard-warning">
          <h3 style={{ marginBottom: 6 }} className="noticeText-warning">Предупреждения</h3>
          <small className="noticeText-warning">
            В документе есть значения, которые выглядят некорректно. Я их пропустил/привёл к дефолтам:
          </small>
          <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
            {warnings.slice(0, 10).map((msg) => (
              <small key={msg} className="noticeText-warning">
                • {msg}
              </small>
            ))}
            {warnings.length > 10 ? (
              <small className="noticeText-warning">…и ещё {warnings.length - 10}</small>
            ) : null}
          </div>
        </section>
      ) : null}

      {savingError ? <div className="errorBox">{savingError}</div> : null}

      {leafErrors.length ? (
        <div className="errorBox">
          {leafErrors.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
        </div>
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
        <div className="grid cols-2">
          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card">
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
          </section>

          <section className="card" style={{ gridColumn: "1 / -1" }}>
            <h3>Опции стекла</h3>
            <small>Если поле пустое — коэффициент считается равным 1.</small>
            <div className="grid cols-2" style={{ gap: 12, marginTop: 12 }}>
              <label className="field">
                <span className="fieldLabel">Energy saving</span>
                <input
                  value={glassEnergySavingCoeff}
                  onChange={(e) => setGlassEnergySavingCoeff(e.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                />
              </label>
              <label className="field">
                <span className="fieldLabel">Multi functional</span>
                <input
                  value={glassMultiFunctionalCoeff}
                  onChange={(e) => setGlassMultiFunctionalCoeff(e.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                />
              </label>
            </div>
          </section>

          <section className="card">
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
          </section>

        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:options:v1"
        title="Комплектующие"
        subtitle="options — доплаты за комплектующие (flat) и/или за м² (perM2)"
        defaultOpen={false}
      >
        <div className="grid cols-2" style={{ gap: 12 }}>
          <section className="card">
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
          </section>

          <section className="card">
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
          </section>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:window_geometry:v1"
        title="Окна: геометрия"
        subtitle="windowGeometry — вычеты рамы/импоста и ограничения (мм)"
        defaultOpen={false}
      >
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Вычеты (takeoffs)</h3>
          <div className="grid cols-3" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">Fw_mm (рама слева/справа)</span>
              <input value={geomFwMm} onChange={(e) => setGeomFwMm(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">Fh_mm (рама сверху/снизу)</span>
              <input value={geomFhMm} onChange={(e) => setGeomFhMm(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">Mw_mm (верт. импост)</span>
              <input value={geomMwMm} onChange={(e) => setGeomMwMm(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Ограничения</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">minSashW_mm</span>
              <input value={geomMinSashW} onChange={(e) => setGeomMinSashW(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">maxSashW_mm (опц.)</span>
              <input value={geomMaxSashW} onChange={(e) => setGeomMaxSashW(e.target.value)} inputMode="decimal" placeholder="пусто = нет" />
            </label>
            <label className="field">
              <span className="fieldLabel">minSashH_mm</span>
              <input value={geomMinSashH} onChange={(e) => setGeomMinSashH(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">maxSashH_mm (опц.)</span>
              <input value={geomMaxSashH} onChange={(e) => setGeomMaxSashH(e.target.value)} inputMode="decimal" placeholder="пусто = нет" />
            </label>
            <label className="field">
              <span className="fieldLabel">minFixedW_mm</span>
              <input value={geomMinFixedW} onChange={(e) => setGeomMinFixedW(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Стекло (опционально)</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">glassInsetW_mm</span>
              <input value={geomGlassInsetW} onChange={(e) => setGeomGlassInsetW(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">glassInsetH_mm</span>
              <input value={geomGlassInsetH} onChange={(e) => setGeomGlassInsetH(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:hardware_catalog:v1"
        title="Каталог: фурнитура"
        subtitle="uiCatalog.hardwareOptions — варианты выбора в калькуляторе (цена берётся из options по key)"
        defaultOpen={false}
      >
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <small style={{ color: "var(--muted)" }}>
            В приложении показываются только варианты с enabled=true. Чтобы вариант влиял на цену, добавьте его стоимость в разделе «Комплектующие»
            с тем же key.
          </small>

          <div style={{ display: "grid", gap: 12 }}>
            {hardwareOptions.length ? (
              hardwareOptions.map((opt, idx) => (
                <div
                  key={`hardware-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px minmax(0, 1fr) minmax(0, 1fr) auto",
                    gap: 12,
                    alignItems: "end"
                  }}
                >
                  <label className="field" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 46 }}>
                    <input
                      type="checkbox"
                      checked={opt.enabled}
                      onChange={(e) =>
                        setHardwareOptions((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, enabled: e.target.checked } : row))
                        )
                      }
                    />
                    <span className="fieldLabel" style={{ margin: 0 }}>
                      Включено
                    </span>
                  </label>

                  <label className="field">
                    <span className="fieldLabel">Key</span>
                    <input
                      value={opt.key}
                      onChange={(e) =>
                        setHardwareOptions((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                        )
                      }
                      placeholder="например: hardware_standard"
                    />
                  </label>

                  <label className="field">
                    <span className="fieldLabel">Название</span>
                    <input
                      value={opt.label}
                      onChange={(e) =>
                        setHardwareOptions((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row))
                        )
                      }
                      placeholder="например: Стандарт"
                    />
                  </label>

                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setHardwareOptions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </button>
                </div>
              ))
            ) : (
              <small style={{ color: "var(--muted)" }}>Нет вариантов. Добавьте первый вариант.</small>
            )}

            <button
              type="button"
              className="secondary"
              onClick={() => setHardwareOptions((prev) => [...prev, { key: "", label: "", enabled: true }])}
            >
              + Добавить вариант
            </button>
          </div>
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:fees:v1"
        title="Сборы и услуги"
        subtitle="fees — доплаты за створки, монтаж, доставку"
        defaultOpen={false}
      >
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Створки</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">Поворотная створка (turn)</span>
              <input value={feeOpeningTurn} onChange={(e) => setFeeOpeningTurn(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">Повор.-откидная (tiltTurn)</span>
              <input value={feeOpeningTiltTurn} onChange={(e) => setFeeOpeningTiltTurn(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Окна</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">Meeting pair kit (fees.meetingPairKit)</span>
              <input value={feeMeetingPairKit} onChange={(e) => setFeeMeetingPairKit(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">Импост за метр (fees.mullionPerM)</span>
              <input value={feeMullionPerM} onChange={(e) => setFeeMullionPerM(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Монтаж</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">За м² (perM2)</span>
              <input value={feeInstallPerM2} onChange={(e) => setFeeInstallPerM2(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">За створку (perSash)</span>
              <input value={feeInstallPerSash} onChange={(e) => setFeeInstallPerSash(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Доставка</h3>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="fieldLabel">База (base)</span>
              <input value={feeDeliveryBase} onChange={(e) => setFeeDeliveryBase(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">Бесплатно км (freeKm)</span>
              <input value={feeDeliveryFreeKm} onChange={(e) => setFeeDeliveryFreeKm(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span className="fieldLabel">За км (perKm)</span>
              <input value={feeDeliveryPerKm} onChange={(e) => setFeeDeliveryPerKm(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="admin:calc_settings:rounding:v1"
        title="Округление"
        subtitle="roundingRules.step — шаг округления итоговой суммы"
        defaultOpen={false}
      >
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3>Шаг</h3>
          <label className="field">
            <span className="fieldLabel">step</span>
            <input value={roundingStep} onChange={(e) => setRoundingStep(e.target.value)} inputMode="numeric" />
          </label>
        </section>
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
          <section className="card" style={{ display: "grid", gap: 12 }}>
            <h3>extras</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "34%" }}>Ключ</th>
                    <th>Значение</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(extras)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <tr key={key}>
                        <td>
                          <b>{key}</b>
                        </td>
                        <td>
                          <small className="breakLong">{JSON.stringify(value)}</small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
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
  const lamination = designOption === "none" ? "none" : designOption === "outside" || designOption === "inside" ? "oneSide" : "twoSide";
  const laminationSide = designOption === "inside" ? "inside" : designOption === "outside" ? "outside" : undefined;
  const laminationGroup = designOption === "twoSideColor" ? "color" : designOption === "twoSideWhite" ? "white" : undefined;
  const [fillType, setFillType] = useState<keyof typeof ENTRANCE_FILL_LABELS>("glass");

  const [energySaving, setEnergySaving] = useState(false);
  const [multiFunctional, setMultiFunctional] = useState(false);

  const [installEnabled, setInstallEnabled] = useState(false);
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

      entranceOptions: isEntranceLike ? { fillType } : undefined,

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
    fillType,
    glazing,
    heightCm,
    installEnabled,
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
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <h3>Превью</h3>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <label className="field">
          <span className="fieldLabel">Ширина (см)</span>
          <input value={widthCm} onChange={(e) => setWidthCm(e.target.value)} inputMode="decimal" />
        </label>
        <label className="field">
          <span className="fieldLabel">Высота (см)</span>
          <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="decimal" />
        </label>
        <label className="field">
          <span className="fieldLabel">Количество</span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
        </label>
        <label className="field">
          <span className="fieldLabel">Тип</span>
          <select value={productType} onChange={(e) => setProductType(e.target.value as "window" | "door")}>
            <option value="window">Окно</option>
            <option value="door">Дверь</option>
          </select>
        </label>

        {productType === "door" ? (
          <label className="field">
            <span className="fieldLabel">Подтип двери</span>
            <select value={doorSubtype} onChange={(e) => setDoorSubtype(e.target.value as keyof typeof DOOR_SUBTYPE_LABELS)}>
              {Object.entries(DOOR_SUBTYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span className="fieldLabel">Створок</span>
          <input value={sashCount} onChange={(e) => setSashCount(e.target.value)} inputMode="numeric" />
        </label>
        <label className="field">
          <span className="fieldLabel">Открывающихся</span>
          <input value={openingSashes} onChange={(e) => setOpeningSashes(e.target.value)} inputMode="numeric" />
        </label>
        <label className="field">
          <span className="fieldLabel">Открывание</span>
          <select value={openingType} onChange={(e) => setOpeningType(e.target.value as keyof typeof OPENING_TYPE_LABELS)}>
            {Object.entries(OPENING_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {meetingPairEligible ? (
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={meetingPairNoMullion} onChange={(e) => setMeetingPairNoMullion(e.target.checked)} />
            <span>Без импоста (meeting pair)</span>
          </label>
        ) : null}

        <label className="field">
          <span className="fieldLabel">Серия профиля</span>
          <select value={profileSeries} onChange={(e) => setProfileSeries(e.target.value as keyof typeof PROFILE_SERIES_LABELS)}>
            {Object.entries(PROFILE_SERIES_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fieldLabel">Глубина (мм)</span>
          <input value={profileDepthMm} onChange={(e) => setProfileDepthMm(e.target.value)} inputMode="numeric" />
        </label>
        <label className="field">
          <span className="fieldLabel">Стеклопакет</span>
          <select value={glazing} onChange={(e) => setGlazing(e.target.value as keyof typeof GLAZING_LABELS)}>
            {Object.entries(GLAZING_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fieldLabel">Дизайн</span>
          <select value={designOption} onChange={(e) => setDesignOption(e.target.value as DesignOption)}>
            <option value="none">{DESIGN_OPTION_LABELS.none}</option>
            <option value="outside">{DESIGN_OPTION_LABELS.outside}</option>
            <option value="inside">{DESIGN_OPTION_LABELS.inside}</option>
            <option value="twoSideWhite">{DESIGN_OPTION_LABELS.twoSideWhite}</option>
            <option value="twoSideColor">{DESIGN_OPTION_LABELS.twoSideColor}</option>
          </select>
        </label>
      </div>

      {productType === "door" && (doorSubtype === "entrance" || doorSubtype === "interior") ? (
        <div className="grid cols-2" style={{ gap: 12 }}>
          <label className="field">
            <span className="fieldLabel">Заполнение</span>
            <select value={fillType} onChange={(e) => setFillType(e.target.value as keyof typeof ENTRANCE_FILL_LABELS)}>
              {Object.entries(ENTRANCE_FILL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="grid cols-2" style={{ gap: 12 }}>
        <label className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={energySaving} onChange={(e) => setEnergySaving(e.target.checked)} />
          <span>Энергосбережение</span>
        </label>
        <label className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={multiFunctional} onChange={(e) => setMultiFunctional(e.target.checked)} />
          <span>Мультифункциональное</span>
        </label>
      </div>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h3>Комплектующие</h3>
        <div className="grid cols-2" style={{ gap: 8 }}>
          {KNOWN_OPTION_KEYS.map((key) => (
            <label key={key} className="row" style={{ gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={Boolean(selectedOptions[key])}
                onChange={(e) => setSelectedOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>{OPTION_LABELS[key] ?? key}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h3>Услуги</h3>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={installEnabled} onChange={(e) => setInstallEnabled(e.target.checked)} />
            <span>Монтаж</span>
          </label>
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={deliveryEnabled} onChange={(e) => setDeliveryEnabled(e.target.checked)} />
            <span>Доставка</span>
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="fieldLabel">Км доставки</span>
            <input value={deliveryKm} onChange={(e) => setDeliveryKm(e.target.value)} inputMode="decimal" disabled={!deliveryEnabled} />
          </label>
        </div>
      </section>

      {preview.error ? (
        <div className="errorBox">{preview.error}</div>
      ) : preview.dto ? (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <h3>Итог</h3>

          {preview.dto.issues.errors.length ? (
            <div className="errorBox">
              {preview.dto.issues.errors.slice(0, 3).map((e) => (
                <div key={e.code}>
                  <b>{e.code}</b>: {e.message}
                </div>
              ))}
            </div>
          ) : null}

          {preview.dto.issues.warnings.length ? (
            <section className="card noticeCard noticeCard-warning" style={{ margin: 0 }}>
              <small className="noticeText-warning">
                {preview.dto.issues.warnings.slice(0, 3).map((w) => `${w.code}: ${w.message}`).join(" · ")}
              </small>
            </section>
          ) : null}

          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="kv">
              <div className="kvRow">
                <div className="kvLabel">Subtotal</div>
                <div className="kvValue">{preview.dto.pricing.subtotal.toLocaleString("ru-RU")}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">Total</div>
                <div className="kvValue">{preview.dto.pricing.total.toLocaleString("ru-RU")}</div>
              </div>
            </div>
            <div className="kv">
              <div className="kvRow">
                <div className="kvLabel">baseKey</div>
                <div className="kvValue">{preview.dto.pricing.factors.baseKey}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">baseRate</div>
                <div className="kvValue">{preview.dto.pricing.factors.baseRate}</div>
              </div>
              <div className="kvRow">
                <div className="kvLabel">area</div>
                <div className="kvValue">{preview.dto.pricing.factors.area.toFixed(3)}</div>
              </div>
            </div>
          </div>

          <div className="kv">
            <div className="kvRow">
              <div className="kvLabel">Комплектующие</div>
              <div className="kvValue">{preview.dto.pricing.factors.optionsTotal.toLocaleString("ru-RU")}</div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Створки</div>
              <div className="kvValue">
                {preview.dto.pricing.factors.openingSashes} / {preview.dto.pricing.factors.openingSashFee.toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Meeting pair</div>
              <div className="kvValue">
                {preview.dto.derived.meetingPairKitCount} / {preview.dto.pricing.factors.meetingPairKitFee.toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Импосты</div>
              <div className="kvValue">
                {preview.dto.derived.mullionCount} / {preview.dto.pricing.factors.mullionFee.toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Монтаж</div>
              <div className="kvValue">{preview.dto.pricing.factors.installFee.toLocaleString("ru-RU")}</div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Доставка</div>
              <div className="kvValue">{preview.dto.pricing.factors.deliveryFee.toLocaleString("ru-RU")}</div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Стекло, м²</div>
              <div className="kvValue">
                {typeof preview.dto.derived.glassAreaTotal_m2 === "number" ? preview.dto.derived.glassAreaTotal_m2.toFixed(3) : "-"}
              </div>
            </div>
            <div className="kvRow">
              <div className="kvLabel">Секции (мм)</div>
              <div className="kvValue">
                {preview.dto.sections.length
                  ? preview.dto.sections.map((s) => `${s.index + 1}:${s.secW_mm}`).join(", ")
                  : "-"}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
