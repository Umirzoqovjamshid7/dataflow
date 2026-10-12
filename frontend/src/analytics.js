export function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function percentageChange(current, previous) {
  const currentValue = safeNumber(current);
  const previousValue = Number(previous);
  if (!Number.isFinite(previousValue)) return null;
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 1000) / 10;
}

export function businessTone(metric, change) {
  if (change === null || change === 0 || metric === "spend") return "neutral";
  const improvement = metric === "cpl" ? change < 0 : change > 0;
  return improvement ? "positive" : "negative";
}

export function formatMetric(value, type = "number") {
  const number = safeNumber(value);
  if (type === "money") return `$${number.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  if (type === "percent") return `${number.toLocaleString("uz-UZ", {minimumFractionDigits: 1, maximumFractionDigits: 1})}%`;
  if (type === "ratio") return `${number.toLocaleString("uz-UZ", {minimumFractionDigits: 1, maximumFractionDigits: 2})}x`;
  return number.toLocaleString("uz-UZ", {maximumFractionDigits: 0});
}

export function conversionRate(value, base) {
  const safeValue = safeNumber(value);
  const safeBase = safeNumber(base);
  if (safeBase <= 0) return null;
  return Math.round((safeValue / safeBase) * 1000) / 10;
}

export function sortRows(rows, key, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (typeof a === "number" || typeof b === "number") return (safeNumber(a) - safeNumber(b)) * factor;
    return String(a ?? "").localeCompare(String(b ?? ""), "uz") * factor;
  });
}
