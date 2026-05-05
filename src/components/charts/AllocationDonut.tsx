"use client";

import * as React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatPercent } from "@/utils/formatting";

const PALETTE = [
  "#172F52", // navy.700
  "#456FAE", // navy.400
  "#947629", // gold.500
  "#D2B45A", // gold.300
  "#3E4659", // ink.600
  "#647088", // slatey.500
  "#2E7D4F",
  "#9B2C2C",
  "#A07815",
  "#1F3F6E",
];

export function AllocationDonut({
  data,
  currency = "USD",
  size = 200,
}: {
  data: { label: string; value: number; pct: number }[];
  currency?: string;
  size?: number;
}) {
  return (
    <div style={{ height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={size * 0.32}
            outerRadius={size * 0.46}
            dataKey="value"
            stroke="#fff"
            strokeWidth={2}
            paddingAngle={1}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #E7EAEF", fontSize: 12 }}
            formatter={(value: number, _n, p) => [
              `${formatCurrency(value, currency, { compact: true })} · ${formatPercent(p?.payload?.pct ?? 0, 1)}`,
              p?.payload?.label,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
