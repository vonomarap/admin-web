import {
  getDefaultCalcConfig,
  type GlassOptionCatalogItem,
  type GlassOptionsInput,
  type HardwareOptionCatalogItem,
  type OptionPrice,
  type ProfileModelCatalogItem,
  type WindowGeometryConfig,
} from "window-door-store-calc-engine";

export const DEFAULT_BASE_RATE = 13000;

export type CalcConfigFull = {
  baseRates: Record<string, number>;
  coefficients: {
    material: Record<string, number>;
    profileModel: Record<string, number>;
    profileSeries: Record<string, number>;
    profileDepthMm: Record<string, number>;
    glazing: Record<string, number>;
    lamination: Record<string, number>;
    laminationGroup: Record<string, number>;
    laminationSide: Record<string, number>;
    laminationColor: Record<string, number>;
    glassOptions: Partial<Record<keyof GlassOptionsInput, number>>;
    door: {
      fillType: Record<string, number>;
      fillTop: Record<string, number>;
      fillBottom: Record<string, number>;
    };
  };
  options: Record<string, OptionPrice>;
  fees: {
    openingSash: Record<string, number>;
    meetingPairKit: number;
    mullionPerM: number;
    install: {
      perM2: number;
      perSash: number;
    };
    delivery: {
      base: number;
      freeKm: number;
      perKm: number;
    };
  };
  roundingRules: {
    step: number;
  };
  uiCatalog: {
    profileModels: ProfileModelCatalogItem[];
    glassOptions: GlassOptionCatalogItem[];
    hardwareOptions: HardwareOptionCatalogItem[];
  };
  windowGeometry: WindowGeometryConfig;
};

export type CalcConfig = Partial<CalcConfigFull>;

export type NormalizedCalcConfig = {
  config: CalcConfigFull;
  extras: Record<string, unknown>;
  warnings: string[];
};

const ROOT_KEYS = new Set(["baseRates", "coefficients", "options", "fees", "roundingRules", "uiCatalog", "windowGeometry"]);
const LEGACY_ONLY_KEYS = new Set(["version", "currencyRules"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function looksLikeLegacyCalcConfig(raw: Record<string, unknown>): boolean {
  const version = toFiniteNumber(raw.version);
  if (version === 1) return true;
  if (isRecord(raw.currencyRules)) return true;

  const baseRates = isRecord(raw.baseRates)
    ? Object.values(raw.baseRates)
        .map((value) => toFiniteNumber(value))
        .filter((value): value is number => value !== null)
    : [];
  if (baseRates.length && Math.max(...baseRates) <= 500) return true;

  const optionKeys = isRecord(raw.options) ? Object.keys(raw.options).map((key) => key.trim().toLowerCase()) : [];
  return optionKeys.some((key) => key === "mosquito" || key === "warm_installation" || key === "lamination");
}

function readNumberMap(source: unknown, warnings: string[], label: string): Record<string, number> {
  if (!isRecord(source)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    const safeKey = key.trim();
    if (!safeKey) continue;
    const num = toFiniteNumber(value);
    if (num === null) {
      warnings.push(`${label}.${safeKey}: не число`);
      continue;
    }
    out[safeKey] = num;
  }
  return out;
}

function readOptionMap(source: unknown, warnings: string[], label: string): Record<string, OptionPrice> {
  if (!isRecord(source)) return {};
  const out: Record<string, OptionPrice> = {};
  for (const [key, value] of Object.entries(source)) {
    const safeKey = key.trim();
    if (!safeKey) continue;

    const num = toFiniteNumber(value);
    if (num !== null) {
      out[safeKey] = num;
      continue;
    }

    if (isRecord(value)) {
      const flat = toFiniteNumber(value.flat);
      const perM2 = toFiniteNumber(value.perM2);
      if (flat === null && perM2 === null) {
        warnings.push(`${label}.${safeKey}: нет flat/perM2`);
        continue;
      }
      out[safeKey] = {
        ...(flat === null ? {} : { flat }),
        ...(perM2 === null ? {} : { perM2 }),
      };
      continue;
    }

    warnings.push(`${label}.${safeKey}: некорректное значение`);
  }
  return out;
}

function readWindowGeometry(
  source: unknown,
  warnings: string[],
  defaults: WindowGeometryConfig
): WindowGeometryConfig {
  if (!isRecord(source)) return defaults;

  const out: WindowGeometryConfig = { ...defaults };
  const fields: Array<keyof WindowGeometryConfig> = [
    "Fw_mm",
    "Fh_mm",
    "Mw_mm",
    "Mh_mm",
    "minSashW_mm",
    "maxSashW_mm",
    "minSashH_mm",
    "maxSashH_mm",
    "minFixedW_mm",
    "minFixedH_mm",
    "glassInsetW_mm",
    "glassInsetH_mm",
    "glassWeightKgPerM2",
  ];

  for (const key of fields) {
    if (!(key in source)) continue;
    const num = toFiniteNumber(source[key]);
    if (num === null) {
      warnings.push(`windowGeometry.${String(key)}: не число`);
      continue;
    }
    (out as any)[key] = num < 0 ? 0 : num;
  }

  return out;
}

export function getDefaultCalcConfigFull(): CalcConfigFull {
  const defaults = getDefaultCalcConfig();
  const defaultOptions: Record<string, OptionPrice> = {};
  for (const [key, value] of Object.entries(defaults.options ?? {})) {
    defaultOptions[key] = typeof value === "number" ? value : { ...value };
  }

  return {
    baseRates: {
      ...(defaults.baseRates ?? { default: DEFAULT_BASE_RATE }),
    },
    coefficients: {
      material: {
        ...(defaults.coefficients?.material ?? {}),
      },
      profileModel: {
        ...(defaults.coefficients?.profileModel ?? {}),
      },
      profileSeries: {
        ...(defaults.coefficients?.profileSeries ?? {}),
      },
      profileDepthMm: {
        ...(defaults.coefficients?.profileDepthMm ?? {}),
      },
      glazing: {
        ...(defaults.coefficients?.glazing ?? {}),
      },
      lamination: {
        ...(defaults.coefficients?.lamination ?? {}),
      },
      laminationGroup: {
        ...(defaults.coefficients?.laminationGroup ?? {}),
      },
      laminationSide: {
        ...(defaults.coefficients?.laminationSide ?? {}),
      },
      laminationColor: {
        ...(defaults.coefficients?.laminationColor ?? {}),
      },
      glassOptions: {
        ...(defaults.coefficients?.glassOptions ?? {}),
      },
      door: {
        fillType: {
          ...(defaults.coefficients?.door?.fillType ?? {}),
        },
        fillTop: {
          ...(defaults.coefficients?.door?.fillTop ?? {}),
        },
        fillBottom: {
          ...(defaults.coefficients?.door?.fillBottom ?? {}),
        },
      },
    },
    options: defaultOptions,
    fees: {
      openingSash: {
        turn: defaults.fees?.openingSash?.turn ?? 0,
        tiltTurn: defaults.fees?.openingSash?.tiltTurn ?? 0,
      },
      meetingPairKit: defaults.fees?.meetingPairKit ?? 0,
      mullionPerM: defaults.fees?.mullionPerM ?? 0,
      install: {
        perM2: defaults.fees?.install?.perM2 ?? 0,
        perSash: defaults.fees?.install?.perSash ?? 0,
      },
      delivery: {
        base: defaults.fees?.delivery?.base ?? 0,
        freeKm: defaults.fees?.delivery?.freeKm ?? 0,
        perKm: defaults.fees?.delivery?.perKm ?? 0,
      },
    },
    roundingRules: {
      step: defaults.roundingRules?.step ?? 1,
    },
    uiCatalog: {
      profileModels: defaults.uiCatalog?.profileModels ?? [],
      glassOptions: defaults.uiCatalog?.glassOptions ?? [],
      hardwareOptions: defaults.uiCatalog?.hardwareOptions ?? [],
    },
    windowGeometry: {
      ...(defaults.windowGeometry ?? {}),
    },
  };
}

export function normalizeCalcConfig(raw: unknown): NormalizedCalcConfig {
  const warnings: string[] = [];
  const defaults = getDefaultCalcConfigFull();

  if (!isRecord(raw)) {
    return { config: defaults, extras: {}, warnings };
  }

  const legacyConfig = looksLikeLegacyCalcConfig(raw);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (legacyConfig && LEGACY_ONLY_KEYS.has(key)) continue;
    if (!ROOT_KEYS.has(key)) extras[key] = value;
  }

  if (legacyConfig) {
    warnings.push("Обнаружена устаревшая конфигурация v1. Применена новая рыночная модель по умолчанию.");
    return { config: defaults, extras, warnings };
  }

  const baseRates = readNumberMap(raw.baseRates, warnings, "baseRates");
  if (baseRates.default == null) {
    baseRates.default = DEFAULT_BASE_RATE;
    warnings.push(`baseRates.default: не задано, использую ${DEFAULT_BASE_RATE}`);
  }

  const coeffRaw = raw.coefficients;
  const coefficients: CalcConfigFull["coefficients"] = {
    material: readNumberMap(isRecord(coeffRaw) ? coeffRaw.material : undefined, warnings, "coefficients.material"),
    profileModel: readNumberMap(isRecord(coeffRaw) ? coeffRaw.profileModel : undefined, warnings, "coefficients.profileModel"),
    profileSeries: readNumberMap(isRecord(coeffRaw) ? coeffRaw.profileSeries : undefined, warnings, "coefficients.profileSeries"),
    profileDepthMm: readNumberMap(isRecord(coeffRaw) ? coeffRaw.profileDepthMm : undefined, warnings, "coefficients.profileDepthMm"),
    glazing: readNumberMap(isRecord(coeffRaw) ? coeffRaw.glazing : undefined, warnings, "coefficients.glazing"),
    lamination: readNumberMap(isRecord(coeffRaw) ? coeffRaw.lamination : undefined, warnings, "coefficients.lamination"),
    laminationGroup: readNumberMap(isRecord(coeffRaw) ? coeffRaw.laminationGroup : undefined, warnings, "coefficients.laminationGroup"),
    laminationSide: readNumberMap(isRecord(coeffRaw) ? coeffRaw.laminationSide : undefined, warnings, "coefficients.laminationSide"),
    laminationColor: readNumberMap(isRecord(coeffRaw) ? coeffRaw.laminationColor : undefined, warnings, "coefficients.laminationColor"),
    glassOptions: readNumberMap(isRecord(coeffRaw) ? coeffRaw.glassOptions : undefined, warnings, "coefficients.glassOptions"),
    door: {
      fillType: {},
      fillTop: {},
      fillBottom: {},
    },
  };

  const doorCoeffRaw = isRecord(coeffRaw) ? coeffRaw.door : undefined;
  if (isRecord(doorCoeffRaw)) {
    coefficients.door.fillType = readNumberMap(doorCoeffRaw.fillType, warnings, "coefficients.door.fillType");
    coefficients.door.fillTop = readNumberMap(doorCoeffRaw.fillTop, warnings, "coefficients.door.fillTop");
    coefficients.door.fillBottom = readNumberMap(doorCoeffRaw.fillBottom, warnings, "coefficients.door.fillBottom");
  }

  const options = readOptionMap(raw.options, warnings, "options");

  const feesRaw = raw.fees;
  const openingSash = readNumberMap(isRecord(feesRaw) ? feesRaw.openingSash : undefined, warnings, "fees.openingSash");
  const meetingPairKit = toFiniteNumber(isRecord(feesRaw) ? feesRaw.meetingPairKit : undefined) ?? 0;
  const mullionPerM = toFiniteNumber(isRecord(feesRaw) ? feesRaw.mullionPerM : undefined) ?? 0;

  const installRaw = isRecord(feesRaw) ? feesRaw.install : undefined;
  const installPerM2 = toFiniteNumber(isRecord(installRaw) ? installRaw.perM2 : undefined) ?? 0;
  const installPerSash = toFiniteNumber(isRecord(installRaw) ? installRaw.perSash : undefined) ?? 0;

  const deliveryRaw = isRecord(feesRaw) ? feesRaw.delivery : undefined;
  const deliveryBase = toFiniteNumber(isRecord(deliveryRaw) ? deliveryRaw.base : undefined) ?? 0;
  const deliveryFreeKm = toFiniteNumber(isRecord(deliveryRaw) ? deliveryRaw.freeKm : undefined) ?? 0;
  const deliveryPerKm = toFiniteNumber(isRecord(deliveryRaw) ? deliveryRaw.perKm : undefined) ?? 0;

  const roundingRaw = raw.roundingRules;
  const step = toFiniteNumber(isRecord(roundingRaw) ? roundingRaw.step : undefined);

  const windowGeometry = readWindowGeometry(raw.windowGeometry, warnings, defaults.windowGeometry);

  return {
    config: {
      baseRates,
      coefficients,
      options,
      fees: {
        openingSash: { ...defaults.fees.openingSash, ...openingSash },
        meetingPairKit: meetingPairKit < 0 ? 0 : meetingPairKit,
        mullionPerM: mullionPerM < 0 ? 0 : mullionPerM,
        install: { perM2: installPerM2, perSash: installPerSash },
        delivery: { base: deliveryBase, freeKm: deliveryFreeKm, perKm: deliveryPerKm },
      },
      roundingRules: { step: step && step > 0 ? step : defaults.roundingRules.step },
      uiCatalog: {
        profileModels:
          isRecord(raw.uiCatalog) && Array.isArray(raw.uiCatalog.profileModels)
            ? raw.uiCatalog.profileModels
            : defaults.uiCatalog.profileModels,
        glassOptions:
          isRecord(raw.uiCatalog) && Array.isArray(raw.uiCatalog.glassOptions)
            ? raw.uiCatalog.glassOptions
            : defaults.uiCatalog.glassOptions,
        hardwareOptions:
          isRecord(raw.uiCatalog) && Array.isArray(raw.uiCatalog.hardwareOptions)
            ? raw.uiCatalog.hardwareOptions
            : defaults.uiCatalog.hardwareOptions,
      },
      windowGeometry,
    },
    extras,
    warnings,
  };
}
