import React, {useEffect, useState} from "react";
import {request} from "../api";
import {formatMetric} from "../analytics";

const titles = {crm:"CRM va sotuvlar", employees:"Xodimlar", calls:"Qo'ng'iroqlar", plans:"Plan / Fakt"};
export default function Business({section, role}) {
  const [data, setData] = useState(null), [plans, setPlans] = useState(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [metric, setMetric] = useState("leads"), [target, setTarget] = useState("");
  const canUse = ["tenant_admin","marketer","analyst"].includes(role);
  useEffect(() => {
    if (!canUse) {setLoading(false);return;}
    const controller = new AbortController();
    setLoading(true);setError("");
    Promise.all([request("/api/business/summary",{signal:controller.signal}),request(`/api/business/plans?month=${month}`,{signal:controller.signal})])
      .then(([next,nextPlans]) => {setData(next);setPlans(nextPlans);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[canUse,month,retry]);
  async function save(event) {
    event.preventDefault();setBusy(true);setError("");
    try {setPlans(await request("/api/business/plans",{method:"POST",body:JSON.stringify({month,metric,target})}));setTarget("");}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  if (!canUse) return <section className="panel"><p>Bu sahifa uchun ruxsat yo'q.</p></section>;
  return <div className="business-page"><header className="page-head"><div><span className="eyebrow">DATAFLOW BUSINESS</span><h1>{titles[section]}</h1><p>Faqat kompaniyangizning sinxronlangan ma'lumotlari</p></div></header>
    {error && <section className="panel error" role="alert">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Qayta urinish</button></section>}
    {loading ? <section className="panel" role="status">Yuklanmoqda...</section> : data && <>
      {data.records === 0 && <section className="panel empty-state"><h2>Ma'lumot yo'q</h2><p>Sozlamalarda CRM yoki OnlinePBX ulanishini sozlab, sinxronlashni bajaring.</p></section>}
      {section === "crm" && <><div className="kpis">{[["CRM lidlari",data.crm.leads],["Bitimlar",data.crm.deals],["Yutilgan bitimlar",data.sales.won]].map(([label,value])=><article className="kpi" key={label}><span>{label}</span><strong>{formatMetric(value)}</strong></article>)}</div><section className="panel"><h2>Sotuv summalari</h2>{Object.entries(data.sales.revenue_by_currency).map(([currency,value])=><p key={currency}>{currency}: {formatMetric(value)}</p>)}<p>Valyutalar alohida ko'rsatiladi. CRM va reklama atributsiyasi tasdiqlanmagan.</p><h2>CRM bosqichlari</h2>{Object.entries(data.crm.stages).map(([stage,value])=><p key={stage}>{stage}: {formatMetric(value)}</p>)}</section></>}
      {section === "employees" && <section className="panel"><h2>Xodimlar: {formatMetric(data.employees.count)}</h2><p>CRM user ID bo'yicha biriktirilgan bitimlar. Qo'ng'iroq va CRM xodimlari bog'lanishi hali tasdiqlanmagan.</p><div className="table-wrap"><table><thead><tr><th>User ID</th><th>Bitimlar</th></tr></thead><tbody>{Object.entries(data.employees.assigned_deals_by_user_id).map(([id,value])=><tr key={id}><td>{id}</td><td>{formatMetric(value)}</td></tr>)}</tbody></table></div></section>}
      {section === "calls" && <div className="kpis">{[["Jami qo'ng'iroqlar",data.calls.total],["Javob berilgan",data.calls.answered],["Suhbatsiz",data.calls.unanswered],["Suhbat (sekund)",data.calls.talk_seconds]].map(([label,value])=><article className="kpi" key={label}><span>{label}</span><strong>{formatMetric(value)}</strong></article>)}</div>}
      {section === "plans" && <section className="panel"><h2>Oylik reja</h2><label>Oy <input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label><p>Fakt reklama kampaniyalari ko'rsatkichlariga asoslangan; CRM sotuv atributsiyasi qo'shilmagan.</p>{role === "tenant_admin" && <form className="inline-form" onSubmit={save}><select value={metric} onChange={e=>setMetric(e.target.value)}><option value="leads">Lidlar</option><option value="spend">Xarajat</option><option value="sales">Kampaniya sotuvlari</option></select><input type="number" min="0" max="9999999999999999.99" step="0.01" required value={target} onChange={e=>setTarget(e.target.value)} placeholder="Reja"/><button disabled={busy} type="submit">Saqlash</button></form>}<div className="table-wrap"><table><thead><tr><th>Ko'rsatkich</th><th>Plan</th><th>Fakt</th><th>Bajarilish</th></tr></thead><tbody>{plans?.plans.map(row=><tr key={row.metric}><td>{row.metric}</td><td>{formatMetric(row.target)}</td><td>{formatMetric(row.fact)}</td><td>{row.completion_percent == null ? "—" : formatMetric(row.completion_percent,"percent")}</td></tr>)}</tbody></table></div>{!plans?.plans.length && <p>Bu oy uchun reja kiritilmagan.</p>}</section>}
    </>}
  </div>;
}
