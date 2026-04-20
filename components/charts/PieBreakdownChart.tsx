"use client";

import { useMemo } from "react";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "../ui/chart";

export type PieDatum = { key?: string; name: string; value: number; color?: string };

export const PIE_COLORS_NEUTRAL = [
  "#111827",
  "#1F2937",
  "#374151",
  "#4B5563",
  "#6B7280",
  "#9CA3AF",
  "#CBD5E1",
];

export const PIE_COLORS_BLACK = [
  "#0B0B0D",
  "#111827",
  "#1F2937",
  "#334155",
  "#4B5563",
  "#6B7280",
  "#9CA3AF",
];

export const PIE_COLORS_ORANGE = [
  "#9A3412",
  "#C2410C",
  "#EA580C",
  "#F97316",
  "#FB923C",
  "#FDBA74",
  "#FED7AA",
];

export const PIE_COLORS_RED = [
  "#7F1D1D",
  "#991B1B",
  "#B91C1C",
  "#DC2626",
  "#EF4444",
  "#F87171",
  "#FECACA",
];

export function PieBreakdownChart({ data, colors = PIE_COLORS_NEUTRAL }: { data: PieDatum[]; colors?: string[] }): JSX.Element {
  const total = useMemo(() => {
    return data.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0);
  }, [data]);

  const accentIndex = useMemo(() => {
    let idx = -1;
    let max = -1;
    for (let i = 0; i < data.length; i += 1) {
      const value = Number.isFinite(data[i]?.value) ? (data[i]?.value as number) : 0;
      if (value > max) {
        max = value;
        idx = i;
      }
    }
    return idx;
  }, [data]);

  const totalText = useMemo(() => total.toLocaleString("ru-RU"), [total]);

  const legendItems = useMemo(() => {
    const safeTotal = total > 0 ? total : 1;

    const formatPct = (pct: number) => {
      if (!Number.isFinite(pct) || pct <= 0) return "0%";
      if (pct >= 10) return `${pct.toFixed(0)}%`;
      if (pct >= 1) return `${pct.toFixed(1)}%`;
      return `${pct.toFixed(2)}%`;
    };

    return data.map((item, index) => {
      const fill = item.color
        ? item.color
        : index === accentIndex
          ? "var(--chart-accent)"
          : colors[index % colors.length];
      const pct = (item.value / safeTotal) * 100;
      return {
        key: item.key ?? item.name,
        name: item.name,
        value: item.value,
        fill,
        pct,
        pctText: formatPct(pct),
      };
    });
  }, [colors, data, total]);

  const chartConfig = useMemo<ChartConfig>(() => {
    return legendItems.reduce<ChartConfig>((acc, item) => {
      acc[item.key] = {
        label: item.name,
        color: item.fill,
      };
      return acc;
    }, {});
  }, [legendItems]);

  return (
    <ChartContainer config={chartConfig} className="w-full">
      <div className="h-[320px] w-full">
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              content={<ChartTooltipContent hideLabel valueFormatter={(value) => value.toLocaleString("ru-RU")} />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={112}
              innerRadius={64}
              paddingAngle={2}
              cornerRadius={6}
              strokeWidth={1}
              stroke="var(--background)"
              isAnimationActive
              animationDuration={980}
              animationEasing="ease-out"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={
                    entry.color
                      ? entry.color
                      : index === accentIndex
                        ? "var(--chart-accent)"
                        : colors[index % colors.length]
                  }
                />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  const cx = (viewBox as any)?.cx;
                  const cy = (viewBox as any)?.cy;
                  if (typeof cx !== "number" || typeof cy !== "number") return null;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                      <tspan x={cx} dy="-0.2em" fill="var(--chart-fg)" fontSize="22" fontWeight="900">
                        {totalText}
                      </tspan>
                      <tspan x={cx} dy="1.5em" fill="var(--chart-muted)" fontSize="12" fontWeight="700">
                        Итого
                      </tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {legendItems.map((item) => (
          <div key={item.key} className="grid min-w-[140px] max-w-[220px] gap-1 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.fill }}
              />
              <span title={item.name} className="truncate text-xs text-muted-foreground">
                {item.name}
              </span>
            </div>
            <div className="pl-4 text-sm font-semibold tabular-nums text-foreground">
              {item.pctText}
            </div>
          </div>
        ))}
      </div>
    </ChartContainer>
  );
}
