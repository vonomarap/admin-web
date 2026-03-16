"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarDatum = { name: string; value: number };

export function BarTopChart({
  data,
  valueLabel,
}: {
  data: BarDatum[];
  valueLabel?: string;
}): JSX.Element {
  return (
    <div style={{ width: "100%", height: Math.max(320, 44 * Math.min(10, data.length) + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 10" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => Number(v).toLocaleString("ru-RU")}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgba(17, 24, 39, 0.72)", fontSize: 12 }}
            tickMargin={6}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
            contentStyle={{
              backgroundColor: "var(--chart-tooltip-bg)",
              border: "1px solid var(--chart-tooltip-border)",
              borderRadius: 12,
              color: "var(--chart-fg)",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
            }}
            labelStyle={{ color: "var(--chart-muted)" }}
            itemStyle={{ color: "var(--chart-fg)" }}
            formatter={(value: unknown) => {
              const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
              return valueLabel ? [`${safe.toLocaleString("ru-RU")} ${valueLabel}`, ""] : safe.toLocaleString("ru-RU");
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--chart-fg)"
            radius={[8, 8, 8, 8]}
            barSize={18}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
