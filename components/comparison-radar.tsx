"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

type Row = { label: string; original: number; current: number };

export default function ComparisonRadar({ data, labels }: { data: Row[]; labels: [string, string] }) {
  return <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <RadarChart data={data} outerRadius="58%">
      <PolarGrid stroke="#cbd5e1" />
      <PolarAngleAxis dataKey="label" tick={{ fill: "#334155", fontSize: 12 }} />
      <PolarRadiusAxis domain={[0, 5]} tickCount={6} axisLine={false} tick={false} />
      <Radar name={labels[0]} dataKey="original" stroke="#1d4ed8" strokeWidth={2} fill="#1d4ed8" fillOpacity={0.16} isAnimationActive={false} />
      <Radar name={labels[1]} dataKey="current" stroke="#7e22ce" strokeWidth={2} strokeDasharray="5 3" fill="#7e22ce" fillOpacity={0.17} isAnimationActive={false} />
    </RadarChart>
  </ResponsiveContainer>;
}
