import React, {useEffect, useMemo, useState} from "react";
import {Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {request} from "../api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_EMPLOYEES = [
  {name:"Azizbek Karimov",extension:"101",total:92,inbound:41,outbound:51,answered:76,talk:12840},
  {name:"Madina Akramova",extension:"102",total:81,inbound:46,outbound:35,answered:69,talk:11720},
  {name:"Jasur Tursunov",extension:"103",total:67,inbound:25,outbound:42,answered:51,talk:8360}
];
const DEMO_DAILY_TOTALS = [18,22,17,31,27,35,29,38,42,34,46,39,52,48];
const DEMO_CAUSES = [{label:"Muvaffaqiyatli yakunlangan",count:196},{label:"Javob berilmadi",count:44},{label:"Band",count:19},{label:"Bekor qilindi",count:8}];

function isoDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return `${y}-${m}-${d}`;}
function initialRange(){const to=new Date(),from=new Date(to);from.setDate(from.getDate()-29);return {from:isoDate(from),to:isoDate(to)};}
function formatNumber(value){return Number(value||0).toLocaleString("uz-UZ");}
function formatDuration(seconds){const total=Math.max(0,Math.round(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function demoData(direction,range){
  const factor=direction==="inbound"?.47:direction==="outbound"?.53:1;
  const chartEnd=new Date(`${range.to}T12:00:00`);
  const daily=DEMO_DAILY_TOTALS.map((total,index)=>{const day=new Date(chartEnd);day.setDate(day.getDate()-(DEMO_DAILY_TOTALS.length-index-1));return {date:isoDate(day),total:Math.round(total*factor),answered:Math.round(total*(.72+(index%4)*.04)*factor)};});
  const employees=DEMO_EMPLOYEES.map(item=>({...item,total:direction==="inbound"?item.inbound:direction==="outbound"?item.outbound:item.total,inbound:direction==="outbound"?0:item.inbound,outbound:direction==="inbound"?0:item.outbound,answered:Math.round(item.answered*factor),talk:Math.round(item.talk*factor)}));
  const total=employees.reduce((sum,item)=>sum+item.total,0),inbound=employees.reduce((sum,item)=>sum+item.inbound,0),outbound=employees.reduce((sum,item)=>sum+item.outbound,0),answered=employees.reduce((sum,item)=>sum+item.answered,0),talk_seconds=employees.reduce((sum,item)=>sum+item.talk,0),missed=Math.max(0,total-answered);
  return {start:range.from,end:range.to,total,inbound,outbound,answered,missed,answer_rate:total?Math.round(answered/total*100):0,talk_seconds,avg_talk:answered?talk_seconds/answered:0,daily,employees,causes:DEMO_CAUSES.map(item=>({...item,count:Math.round(item.count*factor)})),error:""};
}

function ChartTooltip({active,payload,label}){if(!active||!payload?.length)return null;const row=payload[0]?.payload||{};return <div className="calls-tooltip"><strong>{label}</strong><span>Jami: {formatNumber(row.total)}</span><span>Javob berilgan: {formatNumber(row.answered)}</span></div>;}

export default function Calls(){
  const [range,setRange]=useState(initialRange),[applied,setApplied]=useState(initialRange),[direction,setDirection]=useState("all"),[data,setData]=useState(()=>demoData("all",initialRange())),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;setLoading(true);setError("");
    if(DEMO_MODE){setData(demoData(direction,applied));setLoading(false);return()=>{active=false;};}
    const query=new URLSearchParams({from:applied.from,to:applied.to,direction});
    request(`/api/pbx?${query}`).then(result=>{if(active){setData(result);setError(result.error||"");}}).catch(()=>{if(active)setError("Qo‘ng‘iroqlar ma’lumotini yuklab bo‘lmadi.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[applied,direction]);
  const metrics=[["☎","Jami qo‘ng‘iroqlar",data.total,"blue"],["↙","Kiruvchi",data.inbound,"green"],["↗","Chiquvchi",data.outbound,"blue"],["✓","Javob berilgan",data.answered,"green"],["%","Javob foizi",`${formatNumber(data.answer_rate)}%`,"gold"],["↯","Javobsiz",data.missed,"red"],["◷","Umumiy suhbat",formatDuration(data.talk_seconds),"blue"],["▥","O‘rtacha",formatDuration(data.avg_talk),"blue"]];
  const maxCause=useMemo(()=>Math.max(...(data.causes||[]).map(item=>Number(item.count)||0),1),[data.causes]);
  function setPreset(days){const to=new Date(),from=new Date(to);from.setDate(from.getDate()-(days-1));const next={from:isoDate(from),to:isoDate(to)};setRange(next);setApplied(next);}
  return <div className="calls-page">
    <div className="page-head calls-head"><div><span className="calls-eyebrow">ONLINEPBX ANALYTICS</span><h1>Qo‘ng‘iroqlar</h1><p>Kiruvchi va chiquvchi qo‘ng‘iroqlar statistikasi</p></div><select value={direction} onChange={event=>setDirection(event.target.value)} aria-label="Qo‘ng‘iroq yo‘nalishi"><option value="all">Barcha yo‘nalish</option><option value="inbound">Kiruvchi</option><option value="outbound">Chiquvchi</option></select></div>
    {error&&<div className="calls-warning" role="alert">{error}</div>}
    <section className="panel calls-filter"><div className="calls-presets"><button onClick={()=>setPreset(1)}>Bugun</button><button onClick={()=>setPreset(7)}>7 kun</button><button onClick={()=>setPreset(30)}>30 kun</button></div><form onSubmit={event=>{event.preventDefault();setApplied(range);}}><label>Dan<input type="date" value={range.from} max={range.to} onChange={event=>setRange({...range,from:event.target.value})}/></label><label>Gacha<input type="date" value={range.to} min={range.from} onChange={event=>setRange({...range,to:event.target.value})}/></label><button type="submit">Ko‘rsatish</button></form></section>
    <p className="calls-period">Davr: {applied.from} — {applied.to} · {direction==="all"?"barcha yo‘nalish":direction==="inbound"?"kiruvchi":"chiquvchi"}</p>
    {loading?<section className="panel" role="status">Qo‘ng‘iroqlar ma’lumotlari yuklanmoqda…</section>:<>
      <section className="calls-cards">{metrics.map(([icon,label,value,tone])=><article className={`calls-card ${tone}`} key={label}><div><i>{icon}</i><span>{label}</span></div><strong>{typeof value==="number"?formatNumber(value):value}</strong></article>)}</section>
      <section className="panel calls-panel"><div className="calls-panel-head"><div><h2>Qo‘ng‘iroqlar dinamikasi</h2><p>Tanlangan davr bo‘yicha jami va javob berilgan qo‘ng‘iroqlar</p></div><div className="calls-legend"><span><i className="total"/>Jami</span><span><i className="answered"/>Javob berilgan</span></div></div><div className="calls-chart">{data.daily?.length?<ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.daily} margin={{top:12,right:10,left:-15,bottom:0}}><defs><linearGradient id="callsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity={.28}/><stop offset="1" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis dataKey="date" tickFormatter={value=>String(value).slice(5)} tick={{fill:"var(--muted)",fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:"var(--muted)",fontSize:11}}/><Tooltip content={<ChartTooltip/>}/><Area type="monotone" dataKey="total" stroke="none" fill="url(#callsArea)"/><Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} dot={{r:3}}/><Line type="monotone" dataKey="answered" stroke="#f59e0b" strokeWidth={3} dot={{r:3}}/></ComposedChart></ResponsiveContainer>:<div className="calls-empty">Tanlangan davrda qo‘ng‘iroq yo‘q.</div>}</div></section>
      <div className="calls-grids"><section className="panel calls-panel calls-employees"><div className="calls-panel-head"><div><h2>Xodimlar bo‘yicha</h2><p>Ichki raqamlar kesimida PBX statistikasi</p></div></div><div className="table-wrap"><table><thead><tr><th>Xodim</th><th>Ichki raqam</th><th>Jami</th><th>Kiruvchi</th><th>Chiquvchi</th><th>Javob</th><th>Suhbat vaqti</th></tr></thead><tbody>{(data.employees||[]).map(item=><tr key={`${item.extension}-${item.name}`}><td>{item.name||"Noma’lum xodim"}</td><td>{item.extension||"—"}</td><td className="calls-blue">{formatNumber(item.total)}</td><td className="calls-green">{formatNumber(item.inbound)}</td><td className="calls-blue">{formatNumber(item.outbound)}</td><td className="calls-gold">{formatNumber(item.answered)}</td><td>{formatDuration(item.talk)}</td></tr>)}</tbody></table>{!data.employees?.length&&<div className="calls-empty">Ichki raqamlar ma’lumoti yo‘q.</div>}</div></section><section className="panel calls-panel"><h2>Yakunlanish sabablari</h2><p>Qo‘ng‘iroq nima sababdan tugagani</p><div className="calls-causes">{(data.causes||[]).slice(0,5).map(item=><div className="calls-bar" key={item.label}><div><span>{item.label}</span><strong>{data.total?Math.round(item.count/data.total*100):0}%</strong></div><span><i style={{width:`${Math.min(100,item.count/maxCause*100)}%`}}/></span></div>)}{!data.causes?.length&&<div className="calls-empty">Ma’lumot yo‘q.</div>}</div></section><section className="panel calls-panel"><h2>Nazorat</h2><p>Javobsiz qo‘ng‘iroqlar bo‘yicha holat</p><div className={`calls-control ${data.missed?"":"good"}`}><h3>{data.missed?`${formatNumber(data.missed)} ta javobsiz qo‘ng‘iroq`:"Qo‘ng‘iroqlar nazoratda"}</h3><p>{data.missed?"Javobsiz qo‘ng‘iroqlar bo‘yicha qayta aloqa qilish tavsiya etiladi.":"Tanlangan davrda javobsiz qo‘ng‘iroqlar aniqlanmadi."}</p></div></section></div>
    </>}
  </div>;
}
