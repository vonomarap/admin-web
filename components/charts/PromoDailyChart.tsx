"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type PromoDailyPoint = {
  dateKey: string;
  uses: number;
  discount: number;
};

const COLORS = {
  uses: "var(--chart-fg)",
  discount: "var(--chart-accent)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-muted)",
  tooltipBg: "var(--chart-tooltip-bg)",
  tooltipBorder: "var(--chart-tooltip-border)",
};

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
            width={44}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: COLORS.axis, fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            yAxisId="money"
            orientation="right"
            width={62}
            tickFormatter={(v) => Number(v).toLocaleString("ru-RU")}
            axisLine={false}
            tickLine={false}
            tick={{ fill: COLORS.axis, fontSize: 12 }}
            tickMargin={8}
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
              if (name === "uses") return [safe.toLocaleString("ru-RU"), "Использований"];
              if (name === "discount") {
                const label = currencyLabel ? `Скидка (${currencyLabel})` : "Скидка";
                return [safe.toLocaleString("ru-RU"), label];
              }
              return [safe.toLocaleString("ru-RU"), String(name)];
            }}
            labelFormatter={(label) => `Дата: ${String(label)}`}
          />
          <Line
            yAxisId="count"
            type="natural"
            dataKey="uses"
            name="Использований"
            stroke={COLORS.uses}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.uses, stroke: "#ffffff", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={520}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="money"
            type="natural"
            dataKey="discount"
            name={currencyLabel ? `Скидка (${currencyLabel})` : "Скидка"}
            stroke={COLORS.discount}
            strokeWidth={2}
            strokeDasharray="6 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 3, fill: COLORS.discount, stroke: "#ffffff", strokeWidth: 1 }}
            isAnimationActive
            animationDuration={640}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
