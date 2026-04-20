"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "../ui/chart";

export type BarDatum = { name: string; value: number };

const chartConfig = {
  value: {
    label: "Значение",
    color: "var(--chart-fg)",
  },
} satisfies ChartConfig;

export function BarTopChart({
  data,
  valueLabel,
}: {
  data: BarDatum[];
  valueLabel?: string;
}): JSX.Element {
  return (
    <ChartContainer config={chartConfig} style={{ height: Math.max(320, 44 * Math.min(10, data.length) + 60) }}>
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
            tick={{ fill: "var(--chart-fg)", fontSize: 12 }}
            tickMargin={6}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
            content={
              <ChartTooltipContent
                valueFormatter={(value) => (valueLabel ? `${value.toLocaleString("ru-RU")} ${valueLabel}` : value.toLocaleString("ru-RU"))}
              />
            }
          />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[8, 8, 8, 8]}
            barSize={18}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
