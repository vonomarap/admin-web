import * as engine from "window-door-store-calc-engine";

export const DEFAULT_BASE_RATE = engine.DEFAULT_BASE_RATE;
export const calculateQuote = engine.calculateQuote;
export const computeQuoteTotal = engine.computeQuoteTotal;

export type {
  CalcConfig,
  CalcInput,
  CalcIssue,
  CalcResultDTO,
  HandleSide,
  LaminationColor,
  OpeningType,
  OptionPrice,
  SashOpening,
  WindowGeometryConfig,
} from "window-door-store-calc-engine";
