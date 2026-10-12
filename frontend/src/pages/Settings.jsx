import React, {useEffect, useState} from "react";
import {request} from "../api";
import {languageNames} from "../i18n";

const providers = [
  {id:"bitrix", name:"Bitrix24", fields:[["webhook_url","HTTPS REST webhook","password"]]},
  {id:"meta", name:"Meta Ads", fields:[["ad_account_id","Ad account (act_123)","text"],["access_token","Access token","password"]]},
  {id:"amocrm", name:"amoCRM", fields:[["account_url","Account URL","url"],["access_token","Access token","password"]]},
  {id:"onlinepbx", name:"OnlinePBX", fields:[["domain","Domain (<account>.onpbx.ru)","text"],["auth_key","Auth key","password"]]},
  {id:"openai", name:"AI / OpenAI", fields:[["model","Model ID (Chat Completions + tools)","text"],["api_key","API key","password"]]}
];
const labels = {configured:"Saqlangan, tekshirilmagan", connected:"Ulanish tekshirildi", queued:"Worker navbatida", synced:"Sinxronlangan", testing:"Tekshirilmoqda", syncing:"Sinxronlanmoqda", error:"Xato"};
const iso = date => date.toISOString().slice(0,10);

export default function Settings({role, darkMode, setDarkMode, language, setLanguage, t}) {
  const [active, setActive] = useState("bitrix");
  const [values, setValues] = useState({});
  const [connections, setConnections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => ({start:iso(new Date(Date.now()-6*86400000)), end:iso(new Date())}));
  const canManage = role === "tenant_admin";
  const provider = providers.find(item => item.id === active);
  const current = connections.find(item => item.provider === active);
  async function reload() { setConnections(await request("/api/integrations")); }
  useEffect(() => {
    if (!canManage) {setLoading(false);return;}
    const controller = new AbortController();
    request("/api/integrations", {signal:controller.signal}).then(setConnections).catch(e => {if (!controller.signal.aborted) setError(e.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [canManage]);
  useEffect(() => {
    if (!canManage || !connections.some(row => ["queued","syncing","testing"].includes(row.status))) return;
    const controller = new AbortController();
    const timer = setInterval(() => request("/api/integrations", {signal:controller.signal}).then(setConnections).catch(e => {if(!controller.signal.aborted)setError(e.message)}), 5000);
    return () => {clearInterval(timer);controller.abort();};
  }, [canManage, connections]);
  async function act(kind) {
    setBusy(true);setError("");setNotice("");
    try {
      const path = `/api/integrations/${active}${kind === "save" ? "" : `/${kind}`}`;
      await request(path, {method:"POST", ...(kind === "save" ? {body:JSON.stringify({credentials:values})} : kind === "sync" ? {body:JSON.stringify(range)} : {})});
      if (kind === "save") setValues({});
      setNotice(kind === "save" ? "Backendda shifrlab saqlandi. Endi ulanishni tekshiring." : kind === "test" ? "Ulanish tekshirildi. Bu hali ma'lumotlar sinxronlanganini bildirmaydi." : "Sync worker navbatiga qo'shildi. Yakuniy holat avtomatik yangilanadi.");
    } catch(e) {setError(e.message);}
    finally {try {await reload();} catch(e) {setError(e.message);}setBusy(false);}
  }
  return <div className="settings-page">
    <div className="page-head"><div><span className="eyebrow">DATAFLOW V5</span><h1>{t.settingsTitle}</h1><p>Har bir kompaniya o'z API hisoblarini mustaqil ulaydi.</p></div></div>
    <section className="panel integration-panel">
      <h2>Integratsiyalar</h2>
      {!canManage ? <p>API ulanishlarini kompaniya administratori boshqaradi.</p> : <>
        <p>Maxfiy kalitlar backendda shifrlanadi. Saqlangan kalitlar brauzerga qaytarilmaydi.</p>
        <div className="quick-filters">{providers.map(item => <button disabled={busy} type="button" key={item.id} aria-pressed={active===item.id} onClick={() => {setActive(item.id);setValues({});setError("");setNotice("");}}>{item.name}</button>)}</div>
        {loading ? <p role="status">Yuklanmoqda...</p> : <div className="provider-panel">
          <div className="settings-heading"><h2>{provider.name}</h2><span className="integration-status">{labels[current?.status] || "Ulanmagan"}</span></div>
          <form className="settings-form" onSubmit={e => {e.preventDefault();act("save");}}>
            {provider.fields.map(([name,label,type]) => <label key={`${active}:${name}`}>{label}<input type={type} autoComplete="off" maxLength={4096} value={values[name] || ""} onChange={e => setValues({...values,[name]:e.target.value})} required disabled={busy}/></label>)}
            <button type="submit" disabled={busy}>Shifrlab saqlash / kalitni yangilash</button>
          </form>
          {active === "amocrm" && <p>Account access token ishlatiladi. Token muddati tugasa yangisini kiriting; avtomatik OAuth refresh hali qo'shilmagan.</p>}
          {active === "openai" && <p>Agent faqat kompaniya analytics ma'lumotlarini o'qiydi. Gemini hozir qo'llab-quvvatlanmaydi.</p>}
          <div className="settings-actions"><button type="button" disabled={busy || !current} onClick={() => act("test")}>Ulanishni tekshirish</button></div>
          {active !== "openai" && <form className="settings-form" onSubmit={e => {e.preventDefault();act("sync");}}><div className="two-col"><label>Boshlanish sanasi<input type="date" required max={range.end} value={range.start} disabled={busy} onChange={e=>setRange({...range,start:e.target.value})}/></label><label>Tugash sanasi<input type="date" required min={range.start} max={iso(new Date())} value={range.end} disabled={busy} onChange={e=>setRange({...range,end:e.target.value})}/></label></div><p>Bir urinishda ko'pi bilan 31 kun. Katta davrni kichik qismlarga bo'ling.</p><button disabled={busy || !current} type="submit">{busy ? "Bajarilmoqda..." : "Sinxronlash"}</button></form>}
          <dl className="sync-status"><dt>Oxirgi muvaffaqiyatli sync</dt><dd>{current?.last_sync_at ? new Date(current.last_sync_at).toLocaleString() : "Hali bajarilmagan"}</dd><dt>Oxirgi sync yozuvlari</dt><dd>{current?.synced_records ?? 0}</dd></dl>
          {current?.last_error && <p className="error" role="alert">{current.last_error}</p>}
        </div>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
    <section className="panel settings-panel"><h2>{t.language}</h2><select value={language} onChange={e=>setLanguage(e.target.value)}>{Object.entries(languageNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><div className="theme-options"><button className={!darkMode?"theme-option active":"theme-option"} onClick={()=>setDarkMode(false)}>{t.light}</button><button className={darkMode?"theme-option active":"theme-option"} onClick={()=>setDarkMode(true)}>{t.dark}</button></div></section>
    <section className="panel"><h2>Telegram hisobotlari</h2><p>Telegram delivery va avtomatik hisobot jadvali hali ulanmagan.</p></section>
  </div>;
}
