import React, {useEffect, useMemo, useState} from "react";
import {request} from "../api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const PROJECT_ICONS = ["♛","✈","♟","◈","▦","◆"];
const DEMO_EMPLOYEES = [
  {id:1,full_name:"Azizbek Karimov",role:"sales_manager",active:true,leads:86,sold:21,calls:184,answered:139,talk_seconds:23840},
  {id:2,full_name:"Madina Akramova",role:"sales_manager",active:true,leads:74,sold:18,calls:162,answered:127,talk_seconds:21600},
  {id:3,full_name:"Jasur Tursunov",role:"sales_manager",active:true,leads:59,sold:12,calls:131,answered:96,talk_seconds:16420}
];
const DEMO_PROJECTS = [
  {id:1,name:"Kuzgi qabul",leads:92,sold:24,amount:68400000,lost:17,last_call_at:"2026-10-12T09:42:00Z"},
  {id:2,name:"Target — Toshkent",leads:76,sold:18,amount:52700000,lost:21,last_call_at:"2026-10-12T08:55:00Z"},
  {id:3,name:"Bepul konsultatsiya",leads:51,sold:9,amount:26100000,lost:14,last_call_at:"2026-10-11T16:20:00Z"}
];

function isoDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return `${y}-${m}-${d}`;}
function initialRange(){const to=new Date(),from=new Date(to.getFullYear(),0,1);return {from:isoDate(from),to:isoDate(to)};}
function formatNumber(value){return Number(value||0).toLocaleString("uz-UZ");}
function formatDuration(seconds){const total=Math.max(0,Math.round(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function formatDate(value){return value?new Intl.DateTimeFormat("uz-UZ",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"—";}
function initials(name){return String(name||"X").split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();}
function isSold(status){return ["paid","won","sold","success"].includes(String(status||"").toLowerCase());}
function isLost(status){return ["lost","failed","cancelled"].includes(String(status||"").toLowerCase());}

export default function Employees(){
  const [range,setRange]=useState(initialRange),[applied,setApplied]=useState(initialRange),[employees,setEmployees]=useState([]),[projects,setProjects]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");
    if(DEMO_MODE){setEmployees(DEMO_EMPLOYEES);setProjects(DEMO_PROJECTS);setLoading(false);return()=>{active=false;};}
    const query=new URLSearchParams({from:applied.from,to:applied.to});
    Promise.allSettled([request(`/api/leads?${query}`),request(`/api/analytics/campaigns?${query}`),request(`/api/pbx?${query}`)])
      .then(results=>{
        if(!active)return;
        const [leadsResult,campaignsResult,pbxResult]=results;
        const leads=leadsResult.status==="fulfilled"?leadsResult.value:[];
        const campaigns=campaignsResult.status==="fulfilled"?campaignsResult.value:[];
        const pbx=pbxResult.status==="fulfilled"?pbxResult.value:{employees:[],error:""};
        if(results.every(result=>result.status==="rejected")){setError("Ma’lumotlarni yuklab bo‘lmadi.");return;}
        const leadTotal=leads.length||campaigns.reduce((sum,item)=>sum+Number(item.leads||0),0);
        const sold=leads.filter(item=>isSold(item.status)).length||campaigns.reduce((sum,item)=>sum+Number(item.sales||0),0);
        const byName=new Map();
        leads.forEach(item=>{const name=item.assigned_to||"Savdo jamoasi";const row=byName.get(name)||{id:name,full_name:name,role:"team",active:true,leads:0,sold:0,calls:0,answered:0,talk_seconds:0,call_data_available:false};row.leads+=1;row.sold+=Number(isSold(item.status));byName.set(name,row);});
        (pbx.employees||[]).forEach(item=>{const name=item.name||`Xodim ${item.extension||""}`;const row=byName.get(name)||{id:`pbx-${item.extension}`,full_name:name,role:"team",active:true,leads:0,sold:0,calls:0,answered:0,talk_seconds:0,call_data_available:true};row.calls+=Number(item.total||0);row.answered+=Number(item.answered||0);row.talk_seconds+=Number(item.talk||0);row.call_data_available=true;byName.set(name,row);});
        setEmployees(byName.size?[...byName.values()]:[{id:"team",full_name:"Savdo jamoasi",role:"team",active:true,leads:leadTotal,sold,calls:0,answered:0,talk_seconds:0,call_data_available:false}]);
        const names=[...new Set([...campaigns.map(item=>item.name),...leads.map(item=>item.campaign_name)].filter(Boolean))];
        setProjects(names.map((name,index)=>{const projectLeads=leads.filter(item=>item.campaign_name===name),campaignRows=campaigns.filter(item=>item.name===name);return {id:index+1,name,leads:projectLeads.length||campaignRows.reduce((sum,item)=>sum+Number(item.leads||0),0),sold:projectLeads.filter(item=>isSold(item.status)).length||campaignRows.reduce((sum,item)=>sum+Number(item.sales||0),0),amount:campaignRows.reduce((sum,item)=>sum+Number(item.revenue||0),0),lost:projectLeads.filter(item=>isLost(item.status)).length,last_call_at:projectLeads.map(item=>item.created_at).filter(Boolean).sort().pop()};}));
      }).catch(()=>{if(active)setError("Xodimlar ma’lumotlarini yuklab bo‘lmadi.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[applied]);
  const totals=useMemo(()=>employees.reduce((sum,item)=>({leads:sum.leads+Number(item.leads||0),sold:sum.sold+Number(item.sold||0),calls:sum.calls+Number(item.calls||0),answered:sum.answered+Number(item.answered||0),talk:sum.talk+Number(item.talk_seconds||0)}),{leads:0,sold:0,calls:0,answered:0,talk:0}),[employees]);
  const top=employees[0]||{full_name:"Xodimlar",leads:totals.leads,sold:totals.sold};
  const callDataAvailable=DEMO_MODE||employees.some(item=>item.call_data_available);
  function setPreset(days){const to=new Date(),from=new Date(to);from.setDate(from.getDate()-(days-1));const next={from:isoDate(from),to:isoDate(to)};setRange(next);setApplied(next);}
  function setThisYear(){const to=new Date(),from=new Date(to.getFullYear(),0,1),next={from:isoDate(from),to:isoDate(to)};setRange(next);setApplied(next);}
  if(loading)return <section className="panel" role="status">Xodimlar ma’lumotlari yuklanmoqda…</section>;
  return <div className="employees-page">
    <div className="page-head employees-head"><div><span className="employees-eyebrow">TEAM PERFORMANCE</span><h1>Xodimlar natijalari</h1><p>Savdo jamoasi va loyihalar bo‘yicha mavjud real natijalar</p></div></div>
    {error&&<div className="employees-warning" role="alert">Xodimlar ma’lumotini yuklashda xato: {error}</div>}
    <section className="panel employees-filter"><div className="employees-presets"><button onClick={()=>setPreset(1)}>Bugun</button><button onClick={()=>setPreset(7)}>7 kun</button><button onClick={()=>setPreset(30)}>30 kun</button><button onClick={setThisYear}>Bu yil</button></div><form onSubmit={event=>{event.preventDefault();setApplied(range)}}><label>Dan<input type="date" value={range.from} max={range.to} onChange={event=>setRange({...range,from:event.target.value})}/></label><label>Gacha<input type="date" value={range.to} min={range.from} onChange={event=>setRange({...range,to:event.target.value})}/></label><button type="submit">Ko‘rsatish</button></form></section>
    <p className="employees-period">Davr: {applied.from} — {applied.to}</p>
    <section className="employees-overview"><div className="employees-overview-top"><div className="employees-person"><div className="employees-avatar">{initials(top.full_name)}</div><div><h2>{top.full_name}</h2><p>{top.id==="team"?"Umumiy natija":"Sotuv menejeri"}</p></div></div><div className="employees-headline"><span>Umumiy lid</span><strong>{formatNumber(top.leads)}</strong></div><div className="employees-headline success"><span>Sotilgan</span><strong>{formatNumber(top.sold)} ta</strong></div></div><div className="employees-call-stats"><div><i>☎</i><span>Qo‘ng‘iroqlar<strong>{callDataAvailable?formatNumber(totals.calls):"—"}</strong></span></div><div><i>◉</i><span>Javob berilgan<strong>{callDataAvailable?formatNumber(totals.answered):"—"}</strong></span></div><div><i>◔</i><span>Javob foizi<strong>{callDataAvailable?(totals.calls?Math.round(totals.answered/totals.calls*100):0)+"%":"—"}</strong></span></div><div><i>◷</i><span>Suhbat vaqti<strong>{callDataAvailable?formatDuration(totals.talk):"—"}</strong></span></div><div><i>⏱</i><span>O‘rtacha suhbat<strong>{callDataAvailable?formatDuration(totals.answered?totals.talk/totals.answered:0):"—"}</strong></span></div></div></section>
    <div className="employees-section-title"><div><h2>Loyihalar bo‘yicha natijalar</h2><p>{projects.length} ta faol loyiha</p></div></div>
    <section className="employees-project-grid">{projects.map((project,index)=>{const lostPercent=project.leads?Math.round(project.lost/project.leads*100):0;return <article className="employees-project" key={project.id||project.name}><div className="employees-project-head"><div>{PROJECT_ICONS[index%PROJECT_ICONS.length]}</div><h3>{project.name}</h3></div><div className="employees-project-stats"><div><span>Umumiy lid</span><strong>{formatNumber(project.leads)}</strong></div><div><span>Sotuvlar soni</span><strong>{formatNumber(project.sold)} ta</strong></div><div><span>Sotuv summasi</span><strong>{formatNumber(project.amount)} so‘m</strong></div><div><span>Yo‘qotilgan foiz</span><strong>{lostPercent}%</strong></div><div className="wide"><span>Oxirgi faollik</span><strong>{formatDate(project.last_call_at)}</strong></div></div><div className="employees-progress"><i style={{width:`${Math.min(100,lostPercent)}%`}}/></div><div className="employees-progress-label"><span>{formatNumber(project.lost)} yo‘qotilgan</span><span>{lostPercent}%</span></div></article>})}{!projects.length&&<div className="employees-empty">Tanlangan davrda loyiha ma’lumoti yo‘q.</div>}</section>
  </div>;
}
