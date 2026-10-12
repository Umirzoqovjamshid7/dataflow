import React, {useEffect, useMemo, useState} from "react";
import {request} from "../api";
import Kpi from "../components/Kpi";
import {conversionRate, formatMetric, safeNumber, sortRows} from "../analytics";
import {Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";

const PAGE_SIZE = 10;
const columns = [
  ["index", "№"], ["name", "Reklama kampaniyasi"], ["platform", "Platforma"],
  ["spend", "Xarajat"], ["impressions", "Ko'rishlar"], ["clicks", "Bosishlar"],
  ["ctr", "CTR"], ["leads", "Lidlar"], ["cpl", "CPL"], ["sales", "Sotuvlar"], ["roas", "ROAS"]
];

function dateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function quickRange(kind) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let end = new Date(start);
  if (kind === "yesterday") { start.setDate(start.getDate() - 1); end = new Date(start); }
  if (kind === "7days") start.setDate(start.getDate() - 6);
  if (kind === "30days") start.setDate(start.getDate() - 29);
  if (kind === "month") start.setDate(1);
  if (kind === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  }
  return {from: dateInput(start), to: dateInput(end), platform: "", campaign: ""};
}

function Pagination({page, total, onChange}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="table-pagination">
    <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Oldingi</button>
    <span>{page} / {pages}</span>
    <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Keyingi</button>
  </div>;
}

function EmptyState({text="Tanlangan davr uchun ma'lumot topilmadi."}) {
  return <div className="empty-state"><span aria-hidden="true">⌁</span><strong>Ma'lumot yo'q</strong><p>{text}</p></div>;
}

function ChartTooltip({active, payload, label}) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map(item => <span key={item.dataKey} style={{color:item.color}}>{item.name}: {formatMetric(item.value, item.dataKey === "spend" || item.dataKey === "cpl" ? "money" : "number")}</span>)}</div>;
}

function FunnelStep({label, value, base, max, color, linked=true, note}) {
  const rate = linked ? conversionRate(value, base) : null;
  const width = max > 0 ? Math.max(10, Math.min(100, safeNumber(value) / max * 100)) : 10;
  return <div className="v3-funnel-step" title={note || `${label}: ${formatMetric(value)}`}>
    <div className="v3-funnel-copy"><span>{label}</span><strong>{formatMetric(value)}</strong></div>
    <div className="v3-funnel-track"><span style={{width:`${width}%`, background:color}} /></div>
    <small>{base === null ? "Boshlang'ich bosqich" : rate === null ? (note || "Bog'lanish tasdiqlanmagan") : `${rate.toFixed(1)}% oldingi bosqichdan`}</small>
  </div>;
}

function SkeletonDashboard() {
  return <div className="dashboard-page" aria-busy="true" aria-label="Ma'lumotlar yuklanmoqda">
    <div className="skeleton skeleton-title" />
    <div className="kpis">{Array.from({length:6}, (_, index) => <div className="kpi skeleton-card" key={index}><i/><i/><i/></div>)}</div>
    <div className="panel skeleton skeleton-panel" />
    <div className="panel skeleton skeleton-chart" />
  </div>;
}

function download(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function exportCampaigns(rows, format) {
  const headers = columns.slice(1).map(([, label]) => label);
  const data = rows.map(row => [row.name, row.platform, row.spend, row.impressions, row.clicks, row.ctr, row.leads, row.cpl, row.sales, row.roas].map(safeCell));
  if (format === "csv") {
    const csv = [headers, ...data].map(line => line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    download("kampaniyalar.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
    return;
  }
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const table = `<table><thead><tr>${headers.map(value => `<th>${escape(value)}</th>`).join("")}</tr></thead><tbody>${data.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  download("kampaniyalar.xls", `\uFEFF${table}`, "application/vnd.ms-excel;charset=utf-8");
}

export default function Dashboard({role}) {
  const initial = useMemo(() => quickRange("month"), []);
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [summary, setSummary] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [dailyMetric, setDailyMetric] = useState("spend");
  const [search, setSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [sort, setSort] = useState({key:"leads", direction:"desc"});
  const [page, setPage] = useState(1);
  const [leadPage, setLeadPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState(() => new Set(columns.map(([key]) => key)));
  const [reducedMotion, setReducedMotion] = useState(false);
  const canAnalytics = role !== "sales_manager";
  const canLeads = ["super_admin", "tenant_admin", "sales_manager"].includes(role);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(Object.entries(applied).filter(([, value]) => value));
    const suffix = query.size ? `?${query}` : "";
    setLoading(true);
    setError("");
    Promise.all([
      canAnalytics ? request(`/api/analytics/summary${suffix}`, {signal:controller.signal}) : Promise.resolve({}),
      canAnalytics ? request(`/api/analytics/campaigns${suffix}`, {signal:controller.signal}) : Promise.resolve([]),
      canLeads ? request(`/api/leads${suffix}`, {signal:controller.signal}) : Promise.resolve([])
    ]).then(([nextSummary, nextCampaigns, nextLeads]) => {
      setSummary(nextSummary);
      setCampaigns(nextCampaigns);
      setLeads(nextLeads);
    }).catch(nextError => {
      if (nextError.name !== "AbortError") setError(nextError.message || "Ma'lumotlarni yuklab bo'lmadi");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [role, applied, retry, canAnalytics, canLeads]);

  const daily = Array.isArray(summary.daily_activity) ? summary.daily_activity.map(row => ({
    ...row,
    spend:safeNumber(row.spend), impressions:safeNumber(row.impressions), clicks:safeNumber(row.clicks),
    leads:safeNumber(row.leads), cpl:safeNumber(row.cpl)
  })) : [];
  const previous = summary.previous || {};
  const comparisonLabel = summary.comparison_label || "Taqqoslash uchun ma'lumot yo'q";
  const normalizedSearch = search.trim().toLocaleLowerCase("uz");
  const filteredCampaigns = campaigns.filter(row => !normalizedSearch || [row.name, row.platform].some(value => String(value || "").toLocaleLowerCase("uz").includes(normalizedSearch)));
  const sortedCampaigns = sortRows(filteredCampaigns, sort.key, sort.direction);
  const pagedCampaigns = sortedCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const normalizedLeadSearch = leadSearch.trim().toLocaleLowerCase("uz");
  const filteredLeads = leads.filter(row => !normalizedLeadSearch || [row.name, row.phone, row.source, row.campaign_name, row.status].some(value => String(value || "").toLocaleLowerCase("uz").includes(normalizedLeadSearch)));
  const pagedLeads = filteredLeads.slice((leadPage - 1) * PAGE_SIZE, leadPage * PAGE_SIZE);
  const maxFunnel = Math.max(1, safeNumber(summary.impressions));
  const platformData = Object.values(campaigns.reduce((result, row) => {
    const key = row.platform || "Noma'lum";
    result[key] ||= {platform:key, spend:0, leads:0, sales:0};
    result[key].spend += safeNumber(row.spend);
    result[key].leads += safeNumber(row.leads);
    result[key].sales += safeNumber(row.sales);
    return result;
  }, {}));
  const topCampaigns = sortRows(campaigns, "leads", "desc").slice(0, 10);

  function applyQuick(kind) {
    const range = quickRange(kind);
    setFilters(range);
    setApplied(range);
    setPage(1);
    setLeadPage(1);
  }
  function changeSort(key) {
    setSort(current => ({key, direction:current.key === key && current.direction === "desc" ? "asc" : "desc"}));
  }
  function toggleColumn(key) {
    setVisibleColumns(current => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function cell(row, key, index) {
    if (key === "index") return (page - 1) * PAGE_SIZE + index + 1;
    if (key === "spend" || key === "cpl") return formatMetric(row[key], "money");
    if (key === "ctr") return formatMetric(row[key], "percent");
    if (key === "roas") return formatMetric(row[key], "ratio");
    if (["impressions", "clicks", "leads", "sales"].includes(key)) return formatMetric(row[key]);
    return row[key] || "—";
  }

  if (loading) return <SkeletonDashboard/>;
  if (error) return <section className="panel error-state" role="alert"><span>!</span><h2>Ma'lumot yuklanmadi</h2><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Qayta urinish</button></section>;

  return <div className="dashboard-page">
    <header className="page-head dashboard-heading"><div><span className="eyebrow">DATAFLOW ANALYTICS</span><h1>Marketing tahlili</h1><p>Reklama xarajatidan sotuvgacha bo'lgan haqiqiy natijalar</p></div><span className="live-chip"><i/> Joriy ma'lumotlar</span></header>

    <section className="panel dashboard-filters">
      <div className="filter-title"><div><h2>Filtrlar</h2><p>Barcha ko'rsatkichlar tanlangan davr bo'yicha bir vaqtda yangilanadi.</p></div><button className="clear-filter" type="button" onClick={() => {setFilters(initial);setApplied(initial)}}>Tozalash</button></div>
      <div className="quick-filters">{[["today","Bugun"],["yesterday","Kecha"],["7days","7 kun"],["30days","30 kun"],["month","Joriy oy"],["lastMonth","O'tgan oy"]].map(([key,label]) => <button type="button" key={key} onClick={() => applyQuick(key)}>{label}</button>)}</div>
      <form className="filter-grid" onSubmit={event => {event.preventDefault();setApplied(filters);setPage(1);setLeadPage(1)}}>
        <label>Boshlanish sanasi<input type="date" max={dateInput(new Date())} value={filters.from} onChange={event => setFilters({...filters,from:event.target.value})}/></label>
        <label>Tugash sanasi<input type="date" min={filters.from} max={dateInput(new Date())} value={filters.to} onChange={event => setFilters({...filters,to:event.target.value})}/></label>
        <label>Platforma<select value={filters.platform} onChange={event => setFilters({...filters,platform:event.target.value,campaign:""})}><option value="">Barcha platformalar</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></label>
        <label>Kampaniya<select value={filters.campaign} onChange={event => setFilters({...filters,campaign:event.target.value})}><option value="">Barcha kampaniyalar</option>{campaigns.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <button className="apply-filter" type="submit">Filtrni qo'llash</button>
      </form>
    </section>

    {canAnalytics && <>
      <div className="kpis">
        <Kpi label="Reklama xarajati" icon="◈" value={summary.spend} previous={previous.spend} metric="spend" type="money" comparisonLabel={comparisonLabel} tooltip="Tanlangan davrdagi jami reklama xarajati" reducedMotion={reducedMotion}/>
        <Kpi label="Jami lidlar" icon="◎" value={summary.leads} previous={previous.leads} metric="leads" type="number" comparisonLabel={comparisonLabel} tooltip="Reklama yoki lead yozuvlaridan olingan jami lidlar" reducedMotion={reducedMotion}/>
        <Kpi label="Bir lid narxi" icon="◇" value={summary.cpl} previous={previous.cpl} metric="cpl" type="money" comparisonLabel={comparisonLabel} tooltip="Xarajatning lidlar soniga nisbati" reducedMotion={reducedMotion}/>
        <Kpi label="Bosish ko'rsatkichi" icon="↗" value={summary.ctr} previous={previous.ctr} metric="ctr" type="percent" comparisonLabel={comparisonLabel} tooltip="Bosishlarning ko'rishlarga nisbati" reducedMotion={reducedMotion}/>
        <Kpi label="Sotuvlar" icon="▣" value={summary.sales} previous={previous.sales} metric="sales" type="number" comparisonLabel={comparisonLabel} tooltip="Kampaniyalarda qayd etilgan sotuvlar" reducedMotion={reducedMotion}/>
        <Kpi label="Reklama qaytimi" icon="✦" value={summary.roas} previous={previous.roas} metric="roas" type="ratio" comparisonLabel={comparisonLabel} tooltip="Daromadning reklama xarajatiga nisbati" reducedMotion={reducedMotion}/>
      </div>

      <section className="panel funnel-panel">
        <div className="section-heading"><div><span className="eyebrow">KONVERSIYA</span><h2>Marketing voronkasi</h2></div><span className="data-note">CRM atributsiyasi tasdiqlanmagan</span></div>
        <div className="v3-funnel">
          <FunnelStep label="Reklama ko'rishlari" value={summary.impressions} base={null} max={maxFunnel} color="#8B5CF6"/>
          <FunnelStep label="Reklama bosishlari" value={summary.clicks} base={summary.impressions} max={maxFunnel} color="#38BDF8"/>
          <FunnelStep label="Facebook lidlari" value={summary.leads} base={summary.clicks} max={maxFunnel} color="#22C55E"/>
          <FunnelStep label="CRM saralangan lidlar" value={summary.qualified} base={summary.leads} max={maxFunnel} color="#F59E0B" linked={false} note="CRM va reklama lidlari bog'lanishi tasdiqlanmagan"/>
          <FunnelStep label="Sotuvlar" value={summary.sales} base={summary.qualified} max={maxFunnel} color="#EF4444" linked={false} note="Sotuv atributsiyasi tasdiqlanmagan"/>
        </div>
      </section>

      <section className="dashboard-chart-grid">
        <article className="panel chart-card chart-card-wide">
          <div className="section-heading"><div><span className="eyebrow">KUNLIK DINAMIKA</span><h2>Kunlik reklama samaradorligi</h2></div><select aria-label="Grafik ko'rsatkichi" value={dailyMetric} onChange={event => setDailyMetric(event.target.value)}><option value="spend">Xarajat</option><option value="leads">Lidlar</option><option value="clicks">Bosishlar</option></select></div>
          {!daily.length ? <EmptyState/> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{top:12,right:12,left:0,bottom:0}}><defs><linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity=".34"/><stop offset="100%" stopColor="#8B5CF6" stopOpacity=".02"/></linearGradient></defs><CartesianGrid stroke="#27324A" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="date" tickLine={false}/><YAxis tickLine={false} width={58}/><Tooltip content={<ChartTooltip/>}/><Area type="monotone" dataKey={dailyMetric} name={{spend:"Xarajat",leads:"Lidlar",clicks:"Bosishlar"}[dailyMetric]} stroke="#8B5CF6" strokeWidth={3} fill="url(#metricFill)" activeDot={{r:5}} isAnimationActive={!reducedMotion}/></AreaChart></ResponsiveContainer></div>}
        </article>
        <article className="panel chart-card">
          <div className="section-heading"><div><span className="eyebrow">SAMARADORLIK</span><h2>CPL dinamikasi</h2></div></div>
          {!daily.length ? <EmptyState/> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><CartesianGrid stroke="#27324A" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="date" tickLine={false}/><YAxis tickLine={false}/><Tooltip content={<ChartTooltip/>}/><Area type="monotone" dataKey="cpl" name="CPL" stroke="#38BDF8" strokeWidth={3} fill="#38BDF822" isAnimationActive={!reducedMotion}/></AreaChart></ResponsiveContainer></div>}
        </article>
        <article className="panel chart-card">
          <div className="section-heading"><div><span className="eyebrow">KANALLAR</span><h2>Platformalar samaradorligi</h2></div></div>
          {!platformData.length ? <EmptyState/> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={platformData}><CartesianGrid stroke="#27324A" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="platform"/><YAxis/><Tooltip content={<ChartTooltip/>}/><Legend/><Bar dataKey="leads" name="Lidlar" fill="#38BDF8" radius={[6,6,0,0]} isAnimationActive={!reducedMotion}/><Bar dataKey="sales" name="Sotuvlar" fill="#22C55E" radius={[6,6,0,0]} isAnimationActive={!reducedMotion}/></BarChart></ResponsiveContainer></div>}
        </article>
        <article className="panel chart-card chart-card-wide">
          <div className="section-heading"><div><span className="eyebrow">TOP 10</span><h2>Kampaniyalar reytingi</h2></div></div>
          {!topCampaigns.length ? <EmptyState/> : <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={topCampaigns} layout="vertical" margin={{left:24}}><CartesianGrid stroke="#27324A" strokeDasharray="4 4" horizontal={false}/><XAxis type="number"/><YAxis type="category" dataKey="name" width={110}/><Tooltip content={<ChartTooltip/>}/><Bar dataKey="leads" name="Lidlar" fill="#8B5CF6" radius={[0,6,6,0]} isAnimationActive={!reducedMotion}/></BarChart></ResponsiveContainer></div>}
        </article>
      </section>

      <section className="panel" id="campaigns">
        <div className="table-heading"><div><span className="eyebrow">BATAFSIL</span><h2>Kampaniyalar</h2></div><div className="table-actions"><input className="table-search" type="search" placeholder="Kampaniya qidirish..." value={search} onChange={event => {setSearch(event.target.value);setPage(1)}}/><details className="column-menu"><summary>Ustunlar</summary><div>{columns.map(([key,label]) => <label key={key}><input type="checkbox" checked={visibleColumns.has(key)} onChange={() => toggleColumn(key)}/>{label}</label>)}</div></details><button type="button" onClick={() => exportCampaigns(sortedCampaigns,"csv")}>CSV</button><button type="button" onClick={() => exportCampaigns(sortedCampaigns,"xls")}>Excel</button></div></div>
        {!filteredCampaigns.length ? <EmptyState text="Filtrga mos kampaniya topilmadi."/> : <><div className="table-wrap"><table><thead><tr>{columns.filter(([key]) => visibleColumns.has(key)).map(([key,label]) => <th key={key}>{key === "index" ? label : <button type="button" onClick={() => changeSort(key)}>{label}{sort.key === key ? (sort.direction === "desc" ? " ↓" : " ↑") : ""}</button>}</th>)}</tr></thead><tbody>{pagedCampaigns.map((row,index) => <tr key={row.id}>{columns.filter(([key]) => visibleColumns.has(key)).map(([key]) => <td key={key}>{cell(row,key,index)}</td>)}</tr>)}</tbody></table></div><Pagination page={page} total={filteredCampaigns.length} onChange={setPage}/></>}
      </section>
    </>}

    {canLeads && <section className="panel"><div className="table-heading"><div><span className="eyebrow">CRM</span><h2>So'nggi lidlar</h2></div><input className="table-search" type="search" placeholder="Lid qidirish..." value={leadSearch} onChange={event => {setLeadSearch(event.target.value);setLeadPage(1)}}/></div>{!filteredLeads.length ? <EmptyState text="Filtrga mos lid topilmadi."/> : <><div className="table-wrap"><table><thead><tr><th>To'liq ism</th><th>Telefon</th><th>Manba</th><th>Kampaniya</th><th>Holat</th></tr></thead><tbody>{pagedLeads.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.phone}</td><td>{row.source}</td><td>{row.campaign_name || "—"}</td><td><span className="badge">{row.status}</span></td></tr>)}</tbody></table></div><Pagination page={leadPage} total={filteredLeads.length} onChange={setLeadPage}/></>}</section>}
  </div>;
}
