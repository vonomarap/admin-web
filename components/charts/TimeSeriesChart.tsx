"use client";

import { useEffect, useLayoutEffect, useState } from "react";

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

export type DailySeriesPoint = {
  dateKey: string;
  leads: number;
  confirmed: number;
  revenue: number;
};

const chartConfig = {
  leads: {
    label: "Заявки",
    color: "var(--chart-fg)",
  },
  confirmed: {
    label: "Подтверждено",
    color: "var(--chart-muted)",
  },
  revenue: {
    label: "Выручка",
    color: "var(--chart-accent)",
  },
} satisfies ChartConfig;

function formatTick(key: string): string {
  if (typeof key !== "string" || key.length !== 10) return String(key);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

export function TimeSeriesChart({ data }: { data: DailySeriesPoint[] }): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [animSeed, setAnimSeed] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(Boolean(mq.matches));

    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }

    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useLayoutEffect(() => {
    setAnimSeed((s) => s + 1);
  }, [data]);

  const isAnimationActive = !reduceMotion;
  const animationDuration = 2822;
  const animationEasing = "ease-out";

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
            width={0}
            allowDecimals={false}
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
                valueFormatter={(value) => value.toLocaleString("ru-RU")}
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
            key={`ts-${animSeed}-leads`}
            yAxisId="count"
            type="natural"
            dataKey="leads"
            name="Заявки"
            stroke="var(--color-leads)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-leads)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive={isAnimationActive}
            animationBegin={0}
            animationDuration={animationDuration}
            animationEasing={animationEasing}
          />
          <Line
            key={`ts-${animSeed}-confirmed`}
            yAxisId="count"
            type="natural"
            dataKey="confirmed"
            name="Подтверждено"
            stroke="var(--color-confirmed)"
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-confirmed)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive={isAnimationActive}
            animationBegin={251}
            animationDuration={animationDuration}
            animationEasing={animationEasing}
          />
          <Line
            key={`ts-${animSeed}-revenue`}
            yAxisId="money"
            type="natural"
            dataKey="revenue"
            name="Выручка"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-revenue)", stroke: "var(--background)", strokeWidth: 1 }}
            isAnimationActive={isAnimationActive}
            animationBegin={502}
            animationDuration={animationDuration}
            animationEasing={animationEasing}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
