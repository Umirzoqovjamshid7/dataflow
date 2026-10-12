import React, {useEffect, useState} from "react";
import {businessTone, formatMetric, percentageChange, safeNumber} from "../analytics";

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

export default function Kpi({label, icon, value, previous, metric, type, comparisonLabel, tooltip, reducedMotion=false}) {
  const display = useCountUp(value, reducedMotion);
  const change = percentageChange(value, previous);
  const tone = businessTone(metric, change);
  const direction = change === null || change === 0 ? "→" : change > 0 ? "↑" : "↓";
  return <article className="kpi" title={tooltip}>
    <div className="kpi-top"><span>{label}</span><span className="kpi-icon" aria-hidden="true">{icon}</span></div>
    <strong>{formatMetric(display, type)}</strong>
    <div className={`kpi-change ${tone}`}>
      <b>{direction} {change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</b>
      <small>{change === null ? "Taqqoslash uchun ma'lumot yo'q" : comparisonLabel}</small>
    </div>
  </article>;
}
