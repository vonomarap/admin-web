"use client";

import * as React from "react";
import type { LegendProps, TooltipProps } from "recharts";
import { cn } from "../../lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

function useChartConfig(): ChartConfig {
  return React.useContext(ChartContext) ?? {};
}

function resolveChartItem(
  config: ChartConfig,
  item: { dataKey?: unknown; name?: unknown; color?: string; payload?: Record<string, unknown> | undefined }
): { key: string; label: React.ReactNode; color?: string } {
  const candidates = [
    item.dataKey,
    item.name,
  ]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map((value) => String(value));

  for (const candidate of candidates) {
    if (config[candidate]) {
      return {
        key: candidate,
        label: config[candidate].label ?? candidate,
        color: item.color ?? config[candidate].color,
      };
    }
  }

  const fallback = String(item.name ?? item.dataKey ?? "value");
  return {
    key: fallback,
    label: fallback,
    color: item.color,
  };
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    config: ChartConfig;
  }
>(({ className, config, style, ...props }, ref) => {
  const cssVars = Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value.color) acc[`--color-${key}`] = value.color;
    return acc;
  }, {});

  return (
    <ChartContext.Provider value={config}>
      <div
        ref={ref}
        className={cn(
          "w-full text-sm [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-layer]:outline-none [&_.recharts-pie-sector]:outline-none",
          className
        )}
        style={{ ...cssVars, ...style }}
        {...props}
      />
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

type ChartTooltipContentProps = Omit<TooltipProps<number, string>, "content"> & {
  className?: string;
  hideLabel?: boolean;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  valueFormatter?: (value: number, key: string) => React.ReactNode;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
}: ChartTooltipContentProps): JSX.Element | null {
  const config = useChartConfig();

  if (!active || !payload?.length) return null;

  return (
    <div className={cn("grid min-w-[190px] gap-2 rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg", className)}>
      {!hideLabel ? (
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}

      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const { key, label: itemLabel, color } = resolveChartItem(config, item);
          const numericValue = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : Number(item.value ?? 0);

          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "currentColor" }} />
                <span className="truncate text-muted-foreground">{itemLabel}</span>
              </div>
              <span className="shrink-0 font-medium text-foreground">
                {valueFormatter ? valueFormatter(numericValue, key) : numericValue.toLocaleString("ru-RU")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ChartLegendContentProps = Pick<LegendProps, "payload" | "className">;

function ChartLegendContent({ payload, className }: ChartLegendContentProps): JSX.Element | null {
  const config = useChartConfig();

  if (!payload?.length) return null;

  return (
    <div className={cn("mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground", className)}>
      {payload.map((item, index) => {
        const { key, label, color } = resolveChartItem(config, item);
        return (
          <div key={`${key}-${index}`} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: color ?? "currentColor" }} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltipContent, ChartLegendContent };
