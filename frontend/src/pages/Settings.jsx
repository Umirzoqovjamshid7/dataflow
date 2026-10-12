import React, {useState} from "react";
import {languageNames} from "../i18n";

const integrations = [
  {id:"bitrix", name:"Bitrix24", description:"CRM voronkasi va lid holatlari", color:"#16a6df", symbol:"B"},
  {id:"facebook", name:"Facebook / Meta", description:"Reklama va Lead Ads tahlili", color:"#1877f2", symbol:"f"},
  {id:"amocrm", name:"amoCRM", description:"Lidlar, bitimlar va sotuvlar", color:"#ef6a45", symbol:"a"}
];

function ProviderLogo({item}) { return <span className="provider-logo" style={{"--provider":item.color}}>{item.symbol}</span>; }

function IntegrationPanel({id, activeIntegration, children}) {
  const isActive = activeIntegration === id;
  return <div
    id={`integration-panel-${id}`}
    className={`integration-panel-wrap ${isActive ? "open" : ""}`}
    aria-hidden={!isActive}
    inert={isActive ? undefined : ""}
  >
    <div className="integration-panel-content">{children}</div>
  </div>;
}

export default function Settings({darkMode, setDarkMode, language, setLanguage, t}) {
  const [activeIntegration, setActiveIntegration] = useState(null), [saved, setSaved] = useState("");
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("ai_provider") || "openai");
  const [aiModel, setAiModel] = useState(() => localStorage.getItem("ai_model") || "gpt-4o-mini");
  const sessionOnly = language === "uz" ? "Faqat shu sessiya uchun saqlandi; server integratsiyasi ulanmagan." : language === "ru" ? "Сохранено только на время сессии; серверная интеграция не подключена." : "Saved for this session only; server integration is not connected.";
  const [bitrixUrl, setBitrixUrl] = useState(""), [funnels, setFunnels] = useState([]), [funnelId, setFunnelId] = useState("");
  const [telegram, setTelegram] = useState(false), [telegramToken, setTelegramToken] = useState(""), [telegramChat, setTelegramChat] = useState(""), [telegramTopic, setTelegramTopic] = useState(""), [reportTime, setReportTime] = useState("09:00"), [reportSaved, setReportSaved] = useState("");
  function loadFunnels() {
    setFunnels([]);
    setSaved(bitrixUrl.startsWith("https://") ? "Bitrix24 backend API hali ulanmagan." : "To'g'ri HTTPS webhook manzilini kiriting.");
    setTimeout(()=>setSaved(""),2500);
  }
  function save(message=t.saved) { setSaved(message); setTimeout(()=>setSaved(""),2500); }
  function saveAiSettings(e) { e.preventDefault(); localStorage.setItem("ai_provider", aiProvider); localStorage.setItem("ai_model", aiModel); save("AI sozlamalari saqlandi"); }
  return <div className="settings-page">
    <div className="page-head"><div><h1>{t.settingsTitle}</h1><p>{t.settingsSub}</p></div></div>
    <section className="panel integration-panel">
      <div className="section-title"><div><h2>Integratsiyalar</h2><p>Sozlash uchun xizmatni tanlang. API ulanmaguncha holat “Ulanmagan” bo'lib qoladi.</p></div><span className="settings-icon">↗</span></div>
      <div className="integration-list">{integrations.map(item => {
        const isActive = activeIntegration === item.id;
        return <button
          key={item.id}
          type="button"
          className={`integration-card ${isActive ? "selected" : ""}`}
          aria-expanded={isActive}
          aria-controls={`integration-panel-${item.id}`}
          onClick={() => setActiveIntegration(isActive ? null : item.id)}
        ><ProviderLogo item={item}/><span className="integration-copy"><strong>{item.name}</strong><small>{item.description}</small></span><span className="card-arrow" aria-hidden="true">›</span></button>;
      })}</div>

      <IntegrationPanel id="bitrix" activeIntegration={activeIntegration}>
        <div className="settings-panel provider-panel"><div className="settings-heading"><div><h2>Bitrix24</h2><p>{t.bitrixSub}</p></div><span className="integration-status">{t.notConnected}</span></div><form className="settings-form" onSubmit={e=>{e.preventDefault();save(sessionOnly)}}><label>{t.webhook}<input value={bitrixUrl} onChange={e=>setBitrixUrl(e.target.value)} placeholder={t.webhookPlaceholder} required/></label><div className="funnel-row"><label>{t.funnelId}<select value={funnelId} onChange={e=>setFunnelId(e.target.value)} disabled={!funnels.length}><option value="">{funnels.length?t.required:t.loadFunnels}</option>{funnels.map(f=><option key={f.id} value={f.id}>{f.name} (ID: {f.id})</option>)}</select></label><button type="button" onClick={loadFunnels}>{t.loadFunnels}</button></div><div className="settings-actions"><button type="submit">{t.confirmConnect}</button>{saved&&<span className="saved-message">{saved}</span>}</div></form></div>
      </IntegrationPanel>
      <IntegrationPanel id="facebook" activeIntegration={activeIntegration}>
        <div className="settings-panel provider-panel"><div className="settings-heading"><div><h2>Facebook / Meta</h2><p>{t.facebookSub}</p></div><span className="integration-status">{t.notConnected}</span></div><form className="settings-form" onSubmit={e=>{e.preventDefault();save(sessionOnly)}}><div className="two-col"><label>{t.appId}<input required placeholder={t.required}/></label><label>{t.appSecret}<input type="password" required autoComplete="off"/></label><label>{t.adAccount}<input placeholder="act_123456789"/></label><label>{t.pageId}<input placeholder={t.required}/></label></div><label>{t.verifyToken}<input type="password" autoComplete="off"/></label><div className="settings-actions"><button type="submit">{t.connectFacebook}</button>{saved&&<span className="saved-message">{saved}</span>}</div></form></div>
      </IntegrationPanel>
      <IntegrationPanel id="amocrm" activeIntegration={activeIntegration}>
        <div className="settings-panel provider-panel"><div className="settings-heading"><div><h2>amoCRM</h2><p>Lidlar va sotuvlarni sinxronlash uchun amoCRM sozlamalari.</p></div><span className="integration-status">{t.notConnected}</span></div><form className="settings-form" onSubmit={e=>{e.preventDefault();save(sessionOnly)}}><label>Account URL<input type="url" placeholder="https://your-company.amocrm.com" required/></label><label>Client ID<input required placeholder={t.required}/></label><label>Client maxfiy kaliti<input type="password" required autoComplete="off"/></label><div className="settings-actions"><button type="submit">{t.confirmConnect}</button>{saved&&<span className="saved-message">{saved}</span>}</div></form></div>
      </IntegrationPanel>
    </section>
    <section className="panel ai-settings-panel"><div className="section-title"><div><h2>AI tahlil</h2><p>Dashboard ma'lumotlarini tahlil qilish uchun AI provider tanlang.</p></div><span className="integration-status connected">Tayyor</span></div><form className="settings-form" onSubmit={saveAiSettings}><div className="ai-provider-grid"><button type="button" className={`ai-provider-card ${aiProvider==="openai"?"selected":""}`} onClick={()=>{setAiProvider("openai");setAiModel("gpt-4o-mini")}}><span className="ai-provider-logo openai-logo">◎</span><span><strong>OpenAI</strong><small>GPT modellari orqali tahlil</small></span></button><button type="button" className={`ai-provider-card ${aiProvider==="gemini"?"selected":""}`} onClick={()=>{setAiProvider("gemini");setAiModel("gemini-2.0-flash")}}><span className="ai-provider-logo gemini-logo">✦</span><span><strong>Google Gemini</strong><small>Gemini modellari orqali tahlil</small></span></button></div><label>Model<select value={aiModel} onChange={e=>setAiModel(e.target.value)}>{aiProvider==="openai"?<><option value="gpt-4o-mini">GPT-4o mini</option><option value="gpt-4.1-mini">GPT-4.1 mini</option></>:<><option value="gemini-2.0-flash">Gemini 2.0 Flash</option><option value="gemini-2.5-flash">Gemini 2.5 Flash</option></>}</select></label><div className="settings-actions"><button type="submit">AI tanlovini saqlash</button>{saved&&<span className="saved-message">{saved}</span>}</div></form></section>
    <section className="panel settings-panel compact-settings"><div className="settings-heading"><div><h2>{t.language}</h2><p>{t.languageSub}</p></div></div><select className="language-select" value={language} onChange={e=>setLanguage(e.target.value)}>{Object.entries(languageNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><div className="theme-options"><button className={!darkMode?"theme-option active":"theme-option"} onClick={()=>setDarkMode(false)}><span>☀️</span><strong>{t.light}</strong><small>{t.clean}</small></button><button className={darkMode?"theme-option active":"theme-option"} onClick={()=>setDarkMode(true)}><span>🌙</span><strong>{t.dark}</strong><small>{t.easy}</small></button></div></section>
    <section className="panel settings-panel compact-settings"><div className="settings-heading"><div><h2>{t.bot}</h2><p>{t.botSub}</p></div><span className="integration-status">{t.notConnected}</span></div><form className="settings-form" onSubmit={e=>{e.preventDefault();setReportSaved(sessionOnly);setTimeout(()=>setReportSaved(""),2500)}}><div className="two-col"><label>{t.botToken}<input type="password" value={telegramToken} onChange={e=>setTelegramToken(e.target.value)} placeholder={t.tokenPlaceholder} autoComplete="off"/></label><label>{t.chatId}<input value={telegramChat} onChange={e=>setTelegramChat(e.target.value)} placeholder={t.chatPlaceholder}/></label><label>Topic ID<small>Telegram forum topic/message thread ID (optional).</small><input inputMode="numeric" pattern="[0-9]*" value={telegramTopic} onChange={e=>setTelegramTopic(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1234"/></label></div><div className="two-col"><label>{t.dailyReport||"Daily Telegram report"}<small>{t.dailyReportSub||"Send a daily performance summary to Telegram."}</small></label><label>{t.reportTime||"Report time"}<input type="time" value={reportTime} onChange={e=>setReportTime(e.target.value)}/></label></div><label className="switch-row"><span><strong>{t.enableNotifications}</strong><small>{t.notificationSub}</small></span><input type="checkbox" checked={telegram} onChange={e=>setTelegram(e.target.checked)}/></label><div className="settings-actions"><button type="submit">{t.saveReport||t.save}</button>{reportSaved&&<span className="saved-message">{reportSaved}</span>}</div></form></section>
  </div>;
}
