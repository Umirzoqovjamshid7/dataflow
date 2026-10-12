import React from "react";

export function GrowthIndicator({stats,comparisonLabel}) {
  const change=stats?.change_percent;
  const available=typeof change === "number" && Number.isFinite(change);
  const tone=available && ["positive","negative"].includes(stats?.tone) ? stats.tone : "neutral";
  const direction=available && stats?.direction==="up" ? "↑" : available && stats?.direction==="down" ? "↓" : "→";
  return <div className={`kpi-change ${tone}`}><b>{direction} {available ? `${change>0 ? "+" : ""}${change.toFixed(1)}%` : "—"}</b><small>{available ? comparisonLabel || "O'tgan oyga nisbatan" : "Taqqoslash uchun ma'lumot yo'q"}</small></div>;
}
export function ChartCard({children,wide=false}) {
  return <article className={`panel chart-card ${wide ? "chart-card-wide" : ""}`}>{children}</article>;
}
export function DataTable({children,...props}) {
  return <div className="table-wrap"><table {...props}>{children}</table></div>;
}
export function FilterBar({children}) {
  return <section className="panel dashboard-filters" aria-label="Analytics filtrlari">{children}</section>;
}
