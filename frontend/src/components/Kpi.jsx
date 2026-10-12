import React from "react";
export default function Kpi({label, value, sub}) {
  return <div className="kpi">
    <span>{label}</span>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
  </div>
}
