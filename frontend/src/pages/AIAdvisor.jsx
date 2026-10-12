import React, {useEffect, useState} from "react";
import {request} from "../api";

export default function AIAdvisor({role}) {
  const [configured, setConfigured] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canUse = ["tenant_admin","marketer","analyst"].includes(role);
  useEffect(() => {
    if (!canUse) return;
    const controller = new AbortController();
    request("/api/ai/status", {signal:controller.signal}).then(data=>setConfigured(data.configured)).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return ()=>controller.abort();
  },[canUse]);
  async function submit(event) {
    event.preventDefault();setBusy(true);setError("");setAnswer(null);
    try {setAnswer(await request("/api/ai/chat", {method:"POST",body:JSON.stringify({message:question})}));}
    catch(e) {setError(e.message);}
    finally {setBusy(false);}
  }
  return <div className="advisor-page"><header className="page-head"><div><span className="eyebrow">DATAFLOW AI</span><h1>Marketing va Business Agent</h1><p>Marketing, CRM, sotuv, xodimlar, qo'ng'iroqlar va plan / fakt tahlili</p></div><span className="data-note">Faqat o'qish</span></header>
    <section className="panel">{!canUse ? <p>Bu rol uchun AI tahlilga ruxsat yo'q.</p> : <>
      {!configured && <p>Kompaniya administratori sozlamalarda OpenAI kaliti va modelni ulashi kerak.</p>}
      <form className="settings-form" onSubmit={submit}><label>Savolingiz<textarea rows={4} maxLength={4000} required value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} placeholder="Joriy oy marketing natijalari va plan / faktni tahlil qil."/></label><button type="submit" disabled={busy || !configured || !question.trim()}>{busy ? "Tahlil qilinmoqda..." : "Tahlil qilish"}</button></form>
      <p>Faqat shu kompaniyaning ruxsat etilgan jamlanma ma'lumotlari AI provayderiga yuboriladi. Agent ma'lumotlarni o'zgartirmaydi.</p>
    </>}{error && <p role="alert" className="error">{error}</p>}</section>
    {answer && <section className="panel"><h2>Tahlil natijasi</h2><div className="ai-answer">{answer.answer}</div><p>Manbalar: {answer.tools_used.join(", ")}</p></section>}
  </div>;
}
