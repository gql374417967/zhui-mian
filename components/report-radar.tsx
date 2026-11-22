"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

export default function ReportRadar({ data }: { data: { label: string; score: number }[] }) {
  return <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <RadarChart data={data} outerRadius="61%">
      <PolarGrid stroke="#cbd5e1" />
      <PolarAngleAxis dataKey="label" tick={{ fill: "#334155", fontSize: 12 }} />
      <PolarRadiusAxis domain={[0, 5]} tickCount={6} axisLine={false} tick={false} />
      <Radar dataKey="score" stroke="#1d4ed8" strokeWidth={2} fill="#60a5fa" fillOpacity={0.35} isAnimationActive={false} />
    </RadarChart>
  </ResponsiveContainer>;
}
