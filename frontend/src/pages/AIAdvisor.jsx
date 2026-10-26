import React, {useEffect, useMemo, useState} from "react";
import {request} from "../api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const demoSummary = {spend: 12480, impressions: 124800, clicks: 5980, leads: 384, qualified: 216, sales: 42, cpl: 32.5, ctr: 4.8, roas: 3.6};
const demoCampaigns = [
  {name: "Summer Launch", spend: 4200, leads: 142, cpl: 29.58, ctr: 5.2, roas: 4.1},
  {name: "Retargeting", spend: 3180, leads: 118, cpl: 26.95, ctr: 6.1, roas: 3.8},
  {name: "Brand Awareness", spend: 5100, leads: 124, cpl: 41.13, ctr: 3.4, roas: 2.9}
];

function money(value) { return `$${Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 2})}`; }
function severityClass(severity) { return severity === "good" ? "advisor-good" : severity === "warning" ? "advisor-warning" : "advisor-info"; }

export default function AIAdvisor({t}) {
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (DEMO_MODE) { setSummary(demoSummary); setCampaigns(demoCampaigns); setLoading(false); return; }
    Promise.all([request("/api/analytics/summary"), request("/api/analytics/campaigns")])
      .then(([nextSummary, nextCampaigns]) => { setSummary(nextSummary); setCampaigns(nextCampaigns); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const recommendations = useMemo(() => {
    if (!summary) return [];
    const spend = Number(summary.spend || 0), leads = Number(summary.leads || 0), cpl = Number(summary.cpl || 0);
    const ctr = Number(summary.ctr || 0), roas = Number(summary.roas || 0);
    if (!spend && !leads && !Number(summary.impressions || 0) && !campaigns.length) {
      return [{severity: "info", title: "Tahlil uchun ma’lumot yo‘q", text: "Real tavsiyalar olish uchun Meta yoki CRM ma’lumotlarini ulang.", action: "Sozlamalarda integratsiya holatini tekshiring"}];
    }
    const best = [...campaigns].sort((a, b) => Number(b.roas || 0) - Number(a.roas || 0))[0];
    const weakest = [...campaigns].sort((a, b) => Number(b.cpl || 0) - Number(a.cpl || 0))[0];
    const items = [];
    if (ctr < 1.5) items.push({severity: "warning", title: "Kreativlarni yangilang", text: `CTR ${ctr.toFixed(2)}% — reklama matni va vizuallarini A/B test qiling.`, action: "2 ta yangi kreativ tayyorlang"});
    else items.push({severity: "good", title: "CTR yaxshi ishlayapti", text: `CTR ${ctr.toFixed(2)}% darajasida. Eng yaxshi ishlagan kreativlarni ko‘paytiring.`, action: "G‘olib kreativni scale qiling"});
    if (cpl > 0 && cpl > 40) items.push({severity: "warning", title: "Lead narxi yuqori", text: `O‘rtacha CPL ${money(cpl)}. Auditoriya va landing sahifani tekshiring.`, action: "CPL yuqori kampaniyani optimallashtiring"});
    else items.push({severity: "good", title: "Lead acquisition samarali", text: `O‘rtacha CPL ${money(cpl)}. Natijani ushlab turish uchun budjetni bosqichma-bosqich oshiring.`, action: "Budjetni 10–15% oshiring"});
    if (best) items.push({severity: "info", title: `${best.name} — eng kuchli kampaniya`, text: `ROAS ${Number(best.roas || 0).toFixed(1)}x va ${Number(best.leads || 0).toLocaleString()} ta lead olib kelgan.`, action: "Budjetni shu kampaniyaga yo‘naltiring"});
    if (weakest && Number(weakest.cpl || 0) > cpl * 1.25) items.push({severity: "warning", title: `${weakest.name} qayta ko‘rib chiqilsin`, text: `Uning CPL ko‘rsatkichi ${money(weakest.cpl)}, umumiy o‘rtachadan ancha yuqori.`, action: "Kampaniyani pause yoki test rejimiga o‘tkazing"});
    if (!items.length) items.push({severity: "info", title: "Yetarli signal topilmadi", text: "Ko‘proq campaign data yig‘ilgach, aniqroq tavsiya beriladi.", action: "Meta sinxronizatsiyasini yoqing"});
    return items;
  }, [summary, campaigns]);

  if (loading) return <section className="panel" role="status">{t.loading}</section>;
  if (error) return <section className="panel error" role="alert">{error}</section>;
  if (!summary) return <section className="panel advisor-empty"><h1>{t.aiTitle}</h1><p>{t.aiNoData}</p></section>;

  return <div className="advisor-page">
    <div className="page-head"><div><h1>{t.aiTitle}</h1><p>Joriy real ko‘rsatkichlar asosidagi avtomatik tavsiyalar</p></div><span className="advisor-live">Qoidaviy tahlil</span></div>
    <section className="advisor-hero"><div><span className="advisor-eyebrow">AI ADVISOR</span><h2>{t.aiHeroTitle}</h2><p>{t.aiHeroText}</p></div><div className="advisor-score"><strong>{Number(summary.roas || 0).toFixed(1)}x</strong><span>ROAS</span></div></section>
    <div className="advisor-snapshot"><div><span>{t.spend}</span><strong>{money(summary.spend)}</strong></div><div><span>{t.leads}</span><strong>{Number(summary.leads || 0).toLocaleString()}</strong></div><div><span>{t.cpl}</span><strong>{money(summary.cpl)}</strong></div><div><span>{t.ctr}</span><strong>{Number(summary.ctr || 0).toFixed(2)}%</strong></div></div>
    <section className="advisor-section"><div className="section-title"><div><h2>{t.aiRecommendations}</h2><p>{t.aiRecommendationSub}</p></div></div><div className="advisor-grid">{recommendations.map((item, index) => <article className={`advisor-card ${severityClass(item.severity)}`} key={`${item.title}-${index}`}><div className="advisor-card-top"><span className="advisor-icon">{item.severity === "good" ? "✓" : item.severity === "warning" ? "!" : "→"}</span><span className="advisor-label">{item.severity === "good" ? t.aiPositive : item.severity === "warning" ? t.aiAttention : t.aiNext}</span></div><h3>{item.title}</h3><p>{item.text}</p><div className="advisor-action">{item.action} <span>→</span></div></article>)}</div></section>
    <section className="advisor-section advisor-steps"><div className="section-title"><div><h2>{t.aiSteps}</h2><p>{t.aiStepsSub}</p></div></div><ol><li><strong>1</strong><span><b>{t.aiStepOne}</b><small>{t.aiStepOneSub}</small></span></li><li><strong>2</strong><span><b>{t.aiStepTwo}</b><small>{t.aiStepTwoSub}</small></span></li><li><strong>3</strong><span><b>{t.aiStepThree}</b><small>{t.aiStepThreeSub}</small></span></li></ol></section>
  </div>;
}
