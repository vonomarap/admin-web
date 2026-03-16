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

export type DailySeriesPoint = {
  dateKey: string;
  leads: number;
  confirmed: number;
  revenue: number;
};

const COLORS = {
  leads: "var(--chart-fg)",
  confirmed: "var(--chart-muted)",
  revenue: "var(--chart-accent)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-muted)",
  tooltipBg: "var(--chart-tooltip-bg)",
  tooltipBorder: "var(--chart-tooltip-border)",
};

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
              if (name === "revenue") return [safe.toLocaleString("ru-RU"), "Выручка"];
              if (name === "confirmed") return [safe.toLocaleString("ru-RU"), "Подтверждено"];
              if (name === "leads") return [safe.toLocaleString("ru-RU"), "Заявки"];
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
            key={`ts-${animSeed}-leads`}
            yAxisId="count"
            type="natural"
            dataKey="leads"
            name="Заявки"
            stroke={COLORS.leads}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.leads, stroke: "#ffffff", strokeWidth: 1 }}
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
            stroke={COLORS.confirmed}
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.confirmed, stroke: "#ffffff", strokeWidth: 1 }}
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
            stroke={COLORS.revenue}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.revenue, stroke: "#ffffff", strokeWidth: 1 }}
            isAnimationActive={isAnimationActive}
            animationBegin={502}
            animationDuration={animationDuration}
            animationEasing={animationEasing}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
