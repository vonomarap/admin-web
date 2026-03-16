"use client";

import { useMemo } from "react";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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

  return (
    <div style={{ width: "100%" }}>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip
              formatter={(value: unknown) => Number(value).toLocaleString("ru-RU")}
              contentStyle={{
                backgroundColor: "var(--chart-tooltip-bg)",
                border: "1px solid var(--chart-tooltip-border)",
                borderRadius: 12,
                color: "var(--chart-fg)",
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
              }}
              labelStyle={{ color: "var(--chart-muted)" }}
              itemStyle={{ color: "var(--chart-fg)" }}
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
              stroke="rgba(255, 255, 255, 0.94)"
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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px 14px",
          marginTop: 10,
        }}
      >
        {legendItems.map((item) => (
          <div key={item.key} style={{ display: "grid", gap: 4, minWidth: 140, maxWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: item.fill,
                  boxShadow: "0 0 0 2px rgba(15, 23, 42, 0.06)",
                  flex: "0 0 auto",
                }}
              />
              <span
                title={item.name}
                style={{
                  color: "var(--chart-muted)",
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.name}
              </span>
            </div>
            <div
              style={{
                paddingLeft: 16,
                fontSize: 12,
                fontWeight: 800,
                color: "var(--chart-fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {item.pctText}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
