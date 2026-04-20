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
import { ChartContainer, ChartLegendContent, ChartTooltipContent, type ChartConfig } from "../ui/chart";

export type ConversionAovPoint = {
  dateKey: string;
  conversionPct: number;
  aov: number;
};

const chartConfig = {
  conversionPct: {
    label: "Конверсия (%)",
    color: "var(--chart-fg)",
  },
  aov: {
    label: "Средний чек",
    color: "var(--chart-muted)",
  },
} satisfies ChartConfig;

function formatTick(key: string): string {
  if (typeof key !== "string" || key.length !== 10) return String(key);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

export function ConversionAovChart({ data }: { data: ConversionAovPoint[] }): JSX.Element {
  return (
    <ChartContainer config={chartConfig} className="h-[320px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 10" vertical={false} />
          <XAxis
            dataKey="dateKey"
            tickFormatter={formatTick}
            minTickGap={18}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
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
            cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `Дата: ${formatTick(String(label ?? ""))}`}
                valueFormatter={(value, key) => (key === "conversionPct" ? `${value.toFixed(1)}%` : value.toLocaleString("ru-RU"))}
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            height={28}
            content={<ChartLegendContent />}
          />
          <Line
            yAxisId="pct"
            type="natural"
            dataKey="conversionPct"
            name="Конверсия (%)"
            stroke="var(--color-conversionPct)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-conversionPct)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="money"
            type="natural"
            dataKey="aov"
            name="Средний чек"
            stroke="var(--color-aov)"
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-aov)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={640}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
