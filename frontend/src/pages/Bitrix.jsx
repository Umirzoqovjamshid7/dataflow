import React, {useEffect, useMemo, useState} from "react";
import {request} from "../api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const PAGE_SIZE = 10;
const STATUS_LABELS = {new:"Yangi",contacted:"Bog‘lanildi",qualified:"Saralangan",meeting:"Uchrashuv",prepayment:"Pretoplata",paid:"To‘lov",won:"Muvaffaqiyatli",lost:"Yo‘qotilgan"};
const STATUS_ORDER = ["new","contacted","qualified","meeting","prepayment","paid","won","lost"];
const DEMO_DEALS = [
  {id:1042,name:"Diyorbek Rasulov",phone:"+998 90 521 18 44",source:"Instagram",campaign_name:"Kuzgi qabul",status:"new",created_at:"2026-10-12T08:20:00Z",amount:0},
  {id:1041,name:"Madina Akramova",phone:"+998 93 441 22 10",source:"Facebook",campaign_name:"Target — Toshkent",status:"contacted",created_at:"2026-10-12T07:45:00Z",amount:0},
  {id:1039,name:"Sardor Qodirov",phone:"+998 99 840 61 17",source:"Website",campaign_name:"Bepul konsultatsiya",status:"qualified",created_at:"2026-10-11T15:18:00Z",amount:3200000},
  {id:1037,name:"Nilufar Hamidova",phone:"+998 95 330 04 56",source:"Instagram",campaign_name:"Kuzgi qabul",status:"meeting",created_at:"2026-10-11T11:05:00Z",amount:4500000},
  {id:1033,name:"Azizbek Umarov",phone:"+998 90 710 32 28",source:"Facebook",campaign_name:"Target — Toshkent",status:"prepayment",created_at:"2026-10-10T13:26:00Z",amount:1000000},
  {id:1029,name:"Malika Saidova",phone:"+998 97 214 09 88",source:"Website",campaign_name:"Bepul konsultatsiya",status:"paid",created_at:"2026-10-09T10:42:00Z",amount:5800000},
  {id:1024,name:"Jasur Tursunov",phone:"+998 91 234 56 78",source:"Facebook",campaign_name:"Target — Toshkent",status:"won",created_at:"2026-10-08T16:12:00Z",amount:7200000},
  {id:1018,name:"Aziza Karimova",phone:"+998 90 123 45 67",source:"Instagram",campaign_name:"Kuzgi qabul",status:"lost",created_at:"2026-10-07T09:36:00Z",amount:0}
];

function isoDate(date) { const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");return `${year}-${month}-${day}`; }
function initialRange() { const to=new Date(),from=new Date(to);from.setDate(from.getDate()-29);return {from:isoDate(from),to:isoDate(to)}; }
function normalizedStatus(value) { return String(value||"new").trim().toLowerCase(); }
function money(value) { return Number(value||0).toLocaleString("uz-UZ"); }
function displayDate(value) { return value ? new Intl.DateTimeFormat("uz-UZ",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value)) : "—"; }

export default function Bitrix() {
  const [range,setRange]=useState(initialRange),[applied,setApplied]=useState(initialRange),[deals,setDeals]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[source,setSource]=useState("all"),[search,setSearch]=useState(""),[page,setPage]=useState(1),[connection,setConnection]=useState(null);
  useEffect(()=>{setLoading(true);setError("");if(DEMO_MODE){setDeals(DEMO_DEALS.filter(item=>{const day=String(item.created_at).slice(0,10);return day>=applied.from&&day<=applied.to;}));setLoading(false);return;}const query=new URLSearchParams({from:applied.from,to:applied.to});request(`/api/leads?${query}`).then(setDeals).catch(err=>setError(err.message)).finally(()=>setLoading(false));},[applied]);
  useEffect(()=>{if(!DEMO_MODE)request("/api/integrations/bitrix/status").then(setConnection).catch(()=>setConnection(null));},[]);
  const sources=useMemo(()=>[...new Set(deals.map(item=>item.source).filter(Boolean))],[deals]);
  const sourceDeals=useMemo(()=>source==="all"?deals:deals.filter(item=>item.source===source),[deals,source]);
  const stageData=useMemo(()=>STATUS_ORDER.map(status=>({status,name:STATUS_LABELS[status],count:sourceDeals.filter(item=>normalizedStatus(item.status)===status).length})).filter(item=>item.count>0||["new","qualified","won","lost"].includes(item.status)),[sourceDeals]);
  const filteredDeals=useMemo(()=>{const query=search.trim().toLowerCase();return query?sourceDeals.filter(item=>[item.name,item.phone,item.source,item.campaign_name,item.status].some(value=>String(value||"").toLowerCase().includes(query))):sourceDeals;},[sourceDeals,search]);
  const pages=Math.max(1,Math.ceil(filteredDeals.length/PAGE_SIZE)),currentPage=Math.min(page,pages),pageDeals=filteredDeals.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const count=status=>sourceDeals.filter(item=>normalizedStatus(item.status)===status).length;
  const prepayments=count("prepayment"),payments=count("paid")+count("won"),lost=count("lost"),active=Math.max(0,sourceDeals.length-payments-lost);
  const prepaymentAmount=sourceDeals.filter(item=>normalizedStatus(item.status)==="prepayment").reduce((sum,item)=>sum+Number(item.amount||0),0);
  const paymentAmount=sourceDeals.filter(item=>["paid","won"].includes(normalizedStatus(item.status))).reduce((sum,item)=>sum+Number(item.amount||0),0);
  const conversion=sourceDeals.length?Math.round(payments/sourceDeals.length*1000)/10:0,maxStage=Math.max(...stageData.map(item=>item.count),1);
  const sourceStats=sources.map(name=>({name,count:deals.filter(item=>item.source===name).length})),maxSource=Math.max(...sourceStats.map(item=>item.count),1);
  const metrics=[["Umumiy lid",sourceDeals.length,"neutral"],["Yangi lid",count("new"),"blue"],["Faol bitim",active,"gold"],["Yo‘qotilgan",lost,"red"],["Pretoplata",prepayments,"gold"],["Pretoplata summasi",money(prepaymentAmount),"gold"],["To‘lov",payments,"green"],["To‘lov summasi",money(paymentAmount),"green"],["Konversiya",`${conversion}%`,"blue"]];
  function setPreset(days){const to=new Date(),from=new Date(to);from.setDate(from.getDate()-(days-1));const next={from:isoDate(from),to:isoDate(to)};setRange(next);setApplied(next);}
  function setThisYear(){const to=new Date(),from=new Date(to.getFullYear(),0,1),next={from:isoDate(from),to:isoDate(to)};setRange(next);setApplied(next);}
  if(loading)return <section className="panel" role="status">Bitrix ma’lumotlari yuklanmoqda…</section>;
  return <div className="bitrix-page">
    <div className="page-head bitrix-head"><div><span className="bitrix-eyebrow">CRM ANALYTICS</span><h1>Bitrix CRM</h1><p>Lidlar, bitimlar va savdo voronkasi</p></div><span className="bitrix-live">{connection?.connected?"Bitrix ulangan":"Ichki baza"}</span></div>
    {!DEMO_MODE&&!connection?.connected&&<div className="bitrix-warning" role="status">Bitrix24 hali ulanmagan. Sozlamalar → Bitrix24 orqali ulang.</div>}
    {connection?.connected&&<div className="integration-success" role="status">{connection.synced_records||0} ta bitim · Oxirgi sinxronlash: {connection.last_sync_at?new Date(connection.last_sync_at).toLocaleString("uz-UZ"):"hali bajarilmagan"}</div>}
    {error&&<div className="bitrix-warning" role="alert">Bitrix ma’lumotlarini yuklab bo‘lmadi: {error}</div>}
    <section className="panel bitrix-filter-panel"><div className="bitrix-presets"><button onClick={()=>setPreset(1)}>Bugun</button><button onClick={()=>setPreset(7)}>7 kun</button><button onClick={()=>setPreset(30)}>30 kun</button><button onClick={setThisYear}>Bu yil</button></div><form className="bitrix-date-form" onSubmit={event=>{event.preventDefault();setApplied(range);setPage(1)}}><label>Dan<input type="date" value={range.from} max={range.to} onChange={event=>setRange({...range,from:event.target.value})}/></label><label>Gacha<input type="date" value={range.to} min={range.from} onChange={event=>setRange({...range,to:event.target.value})}/></label><button type="submit">Ko‘rsatish</button></form></section>
    <div className="bitrix-tabs"><button className={source==="all"?"active":""} onClick={()=>{setSource("all");setPage(1)}}>Barcha manbalar</button>{sources.map(item=><button key={item} className={source===item?"active":""} onClick={()=>{setSource(item);setPage(1)}}>{item}</button>)}</div>
    <div className="bitrix-kpis">{metrics.map(([label,value,tone])=><article className={`bitrix-kpi ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="panel bitrix-panel"><div className="bitrix-section-title"><div><h2>Savdo voronkasi</h2><p>Joriy bosqichlar bo‘yicha bitimlar soni</p></div><span>{sourceDeals.length} ta lid</span></div><div className="bitrix-funnel">{stageData.map((item,index)=><div className={`bitrix-funnel-step ${item.status}`} key={item.status} style={{"--step-index":index}}><span>{item.name}</span><strong>{item.count}</strong></div>)}</div></section>
    <div className="bitrix-grid"><section className="panel bitrix-panel"><div className="bitrix-section-title"><div><h2>Manbalar bo‘yicha natija</h2><p>Har bir kanal olib kelgan lidlar</p></div></div><div className="bitrix-bars">{sourceStats.map(item=><div className="bitrix-bar-row" key={item.name}><span>{item.name}</span><div><i style={{width:`${item.count/maxSource*100}%`}}/></div><strong>{item.count}</strong></div>)}</div></section><section className="panel bitrix-panel"><div className="bitrix-section-title"><div><h2>Bosqichlarda qolgan bitimlar</h2><p>CRM statuslari bo‘yicha taqsimot</p></div></div><div className="bitrix-bars stage-bars">{stageData.map(item=><div className="bitrix-bar-row" key={item.status}><span>{item.name}</span><div><i style={{width:`${item.count/maxStage*100}%`}}/></div><strong>{item.count}</strong></div>)}</div></section></div>
    <section className="panel bitrix-panel"><div className="bitrix-deal-head"><div><h2>So‘nggi bitimlar</h2><p>{filteredDeals.length} ta natija · {applied.from} — {applied.to}</p></div><input type="search" value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Bitim, telefon yoki bosqich bo‘yicha qidirish…"/></div><div className="table-wrap"><table className="bitrix-table"><thead><tr><th>ID</th><th>Sana</th><th>Mijoz</th><th>Manba</th><th>Bosqich</th><th>Summa</th></tr></thead><tbody>{pageDeals.map(item=><tr key={item.id}><td>#{item.id}</td><td>{displayDate(item.created_at)}</td><td><strong>{item.name||"Nomsiz bitim"}</strong><small>{item.phone||item.campaign_name||"—"}</small></td><td>{item.source||"—"}</td><td><span className={`bitrix-status ${normalizedStatus(item.status)}`}>{STATUS_LABELS[normalizedStatus(item.status)]||item.status||"Yangi"}</span></td><td className="bitrix-money">{money(item.amount)}</td></tr>)}</tbody></table>{!pageDeals.length&&<div className="bitrix-empty">Tanlangan davrda bitim topilmadi.</div>}</div><div className="table-pagination"><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Oldingi</button><span>{currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Keyingi</button></div></section>
  </div>;
}
