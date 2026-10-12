import React, {useEffect, useState} from "react";
import {formatMetric, safeNumber} from "../analytics";
import {GrowthIndicator} from "./AnalyticsUI";

function useCountUp(value, reducedMotion) {
  const target = safeNumber(value);
  const [display, setDisplay] = useState(reducedMotion ? target : 0);
  useEffect(() => {
    if (reducedMotion) { setDisplay(target); return undefined; }
    let frame;
    const started = performance.now();
    const animate = now => {
      const progress = Math.min(1, (now - started) / 500);
      setDisplay(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);
  return display;
}

export default function Kpi({label, icon, value, type, currency, comparisonLabel, tooltip, stats, reducedMotion=false}) {
  const display = useCountUp(value, reducedMotion);
  const trend = Array.isArray(stats?.trend) ? stats.trend : [];
  const max = Math.max(1, ...trend.map(point => safeNumber(point.value)));
  return <article className="kpi" title={tooltip || label}>
    <div className="kpi-top"><span>{label}</span><span className="kpi-icon" aria-hidden="true">{icon || "◇"}</span></div>
    <strong className="kpi-value">{value == null ? "Ma'lumot yo'q" : formatMetric(display, type, currency)}</strong>
    <small className="kpi-previous">Oldingi davr: {stats?.previous == null ? "—" : formatMetric(stats.previous, type, stats.previous_currency)}</small>
    <GrowthIndicator stats={stats} comparisonLabel={comparisonLabel}/>
    {value != null && trend.length > 0 && trend.every(point=>point.value!=null) && <svg className="kpi-trend" viewBox="0 0 120 28" role="img" aria-label="7 kunlik trend"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={trend.map((point, index) => `${index * 20},${26 - safeNumber(point.value) / max * 24}`).join(" ")}/></svg>}
  </article>;
}
