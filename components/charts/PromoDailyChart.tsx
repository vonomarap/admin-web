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

export type PromoDailyPoint = {
  dateKey: string;
  uses: number;
  discount: number;
};

const chartConfig = {
  uses: {
    label: "Использований",
    color: "var(--chart-fg)",
  },
  discount: {
    label: "Скидка",
    color: "var(--chart-accent)",
  },
} satisfies ChartConfig;

function formatTick(key: string): string {
  if (typeof key !== "string" || key.length !== 10) return String(key);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

export function PromoDailyChart({
  data,
  discountCurrency,
}: {
  data: PromoDailyPoint[];
  discountCurrency?: string;
}): JSX.Element {
  const currencyLabel = (discountCurrency || "").trim().toUpperCase();

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
            yAxisId="count"
            width={44}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            yAxisId="money"
            orientation="right"
            width={62}
            tickFormatter={(v) => Number(v).toLocaleString("ru-RU")}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            tickMargin={8}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `Дата: ${formatTick(String(label ?? ""))}`}
                valueFormatter={(value) => value.toLocaleString("ru-RU")}
              />
            }
          />
          <Legend verticalAlign="bottom" align="center" height={28} content={<ChartLegendContent />} />
          <Line
            yAxisId="count"
            type="natural"
            dataKey="uses"
            name="Использований"
            stroke="var(--color-uses)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-uses)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="money"
            type="natural"
            dataKey="discount"
            name={currencyLabel ? `Скидка (${currencyLabel})` : "Скидка"}
            stroke="var(--color-discount)"
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-discount)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={640}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
