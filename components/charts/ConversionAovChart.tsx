"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ConversionAovPoint = {
  dateKey: string;
  conversionPct: number;
  aov: number;
};

const COLORS = {
  conversion: "var(--chart-fg)",
  aov: "var(--chart-muted)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-muted)",
  tooltipBg: "var(--chart-tooltip-bg)",
  tooltipBorder: "var(--chart-tooltip-border)",
};

function formatTick(key: string): string {
  if (typeof key !== "string" || key.length !== 10) return String(key);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

export function ConversionAovChart({ data }: { data: ConversionAovPoint[] }): JSX.Element {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="2 10" vertical={false} />
          <XAxis
            dataKey="dateKey"
            tickFormatter={formatTick}
            minTickGap={18}
            axisLine={false}
            tickLine={false}
            tick={{ fill: COLORS.axis, fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            yAxisId="pct"
            width={0}
            tickFormatter={(v) => `${Math.round(Number(v))}%`}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="money"
            orientation="right"
            width={0}
            tickFormatter={(v) => Number(v).toLocaleString("ru-RU")}
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: "rgba(15, 23, 42, 0.22)", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: COLORS.tooltipBg,
              border: `1px solid ${COLORS.tooltipBorder}`,
              borderRadius: 12,
              color: "var(--chart-fg)",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
            }}
            labelStyle={{ color: "var(--chart-muted)" }}
            itemStyle={{ color: "var(--chart-fg)" }}
            formatter={(value: unknown, name: unknown) => {
              const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
              if (name === "conversionPct") return [`${safe.toFixed(1)}%`, "Конверсия"];
              if (name === "aov") return [safe.toLocaleString("ru-RU"), "Средний чек"];
              return [safe.toLocaleString("ru-RU"), String(name)];
            }}
            labelFormatter={(label) => `Дата: ${String(label)}`}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            align="center"
            height={28}
            wrapperStyle={{ color: "var(--chart-muted)", fontSize: 11 }}
          />
          <Line
            yAxisId="pct"
            type="natural"
            dataKey="conversionPct"
            name="Конверсия (%)"
            stroke={COLORS.conversion}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.conversion, stroke: "#ffffff", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="money"
            type="natural"
            dataKey="aov"
            name="Средний чек"
            stroke={COLORS.aov}
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.aov, stroke: "#ffffff", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={640}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
