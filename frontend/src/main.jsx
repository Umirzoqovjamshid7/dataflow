import React, {lazy, Suspense, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {request, setToken, restoreSession} from "./api";
import BrandMark from "./components/BrandMark";
import {translations} from "./i18n";
import "./styles.css";
const Settings = lazy(() => import("./pages/Settings"));
const AIAdvisor = lazy(() => import("./pages/AIAdvisor"));
const Bitrix = lazy(() => import("./pages/Bitrix"));
const Employees = lazy(() => import("./pages/Employees"));
const Calls = lazy(() => import("./pages/Calls"));
const PlanFact = lazy(() => import("./pages/PlanFact"));
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

function EyeIcon({hidden}) {
  return hidden
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.7 10.7 0 0112 4c5.2 0 8.7 4.7 8.7 4.7a12.7 12.7 0 01-2.2 2.5M6.6 6.6C4.5 8 3.3 9.7 3.3 9.7S6.8 16 12 16c1.2 0 2.3-.3 3.3-.7"/></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.3 12S6.8 6 12 6s8.7 6 8.7 6-3.5 6-8.7 6-8.7-6-8.7-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>;
}

function AnalyticsArtwork() {
  return <div className="analytics-artwork" aria-hidden="true">
    <div className="art-glow" />
    <svg viewBox="0 0 620 390" role="presentation">
      <defs>
        <linearGradient id="chart-gradient" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#8B5CF6"/><stop offset="1" stopColor="#E879F9"/></linearGradient>
        <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#A855F7" stopOpacity=".36"/><stop offset="1" stopColor="#A855F7" stopOpacity="0"/></linearGradient>
      </defs>
      <g className="art-grid"><path d="M58 80H562M58 145H562M58 210H562M58 275H562M130 45V325M240 45V325M350 45V325M460 45V325"/></g>
      <path className="art-area" d="M58 275C112 257 132 273 175 229s76-24 111-73 73 1 110-38 94-18 166-69v276H58Z"/>
      <path className="art-line-shadow" d="M58 275C112 257 132 273 175 229s76-24 111-73 73 1 110-38 94-18 166-69"/>
      <path className="art-line" d="M58 275C112 257 132 273 175 229s76-24 111-73 73 1 110-38 94-18 166-69"/>
      <g className="art-points"><circle cx="175" cy="229" r="7"/><circle cx="286" cy="156" r="7"/><circle cx="396" cy="118" r="7"/><circle cx="562" cy="49" r="8"/></g>
      <g className="art-bars"><rect x="87" y="292" width="28" height="33" rx="7"/><rect x="125" y="278" width="28" height="47" rx="7"/><rect x="163" y="299" width="28" height="26" rx="7"/></g>
    </svg>
    <div className="art-chip chip-one"><span />Oqim</div>
    <div className="art-chip chip-two"><span />Tahlil</div>
    <div className="art-orbit"><i /><i /><i /></div>
  </div>;
}

function Login({onLogin, sessionMessage}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = "Email manzilini kiriting.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Email formati noto‘g‘ri.";
    if (!password) nextErrors.password = "Parolni kiriting.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setError("");
    setSubmitting(true);
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({email: email.trim(), password, remember_me: rememberMe})
      });
      setToken(data.access_token);
      onLogin(data);
    } catch (loginError) {
      if (loginError.status === 401) setError("Email yoki parol noto‘g‘ri.");
      else if (loginError.status === 429) setError("Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.");
      else if (!loginError.status) setError("Server bilan bog‘lanib bo‘lmadi.");
      else setError("Kirishda xatolik yuz berdi. Qayta urinib ko‘ring.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="login-wrap">
    <div className="login-ambient ambient-one"/><div className="login-ambient ambient-two"/>
    <main className="login-layout">
      <section className="login-showcase" aria-label="DataFlow haqida">
        <div className="showcase-brand"><BrandMark className="login-logo"/><strong>DataFlow</strong></div>
        <div className="showcase-copy">
          <span className="showcase-eyebrow"><i/> Yagona biznes platformasi</span>
          <h1>Biznesingizni raqamlar orqali boshqaring</h1>
          <p>Marketing, CRM va AI analitika — yagona platformada</p>
        </div>
        <AnalyticsArtwork />
        <p className="showcase-foot">Aniq ma’lumot. Tezkor qaror. Barqaror o‘sish.</p>
      </section>
      <section className="login-panel">
        <div className="login-mobile-brand"><BrandMark className="login-logo"/><strong>DataFlow</strong></div>
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-heading"><span className="login-kicker">XAVFSIZ KIRISH</span><h2>Xush kelibsiz!</h2><p>Hisobingizga kiring</p></div>
          {sessionMessage && !error && <div className="login-alert" role="alert">{sessionMessage}</div>}
          {error && <div className="login-alert" role="alert">{error}</div>}
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <div className={`login-input ${fieldErrors.email ? "invalid" : ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6"/></svg>
              <input id="login-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" value={email} onChange={e=>{setEmail(e.target.value);setFieldErrors(current=>({...current,email:""}));}} placeholder="name@company.uz" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined}/>
            </div>
            {fieldErrors.email && <small id="email-error" className="field-error">{fieldErrors.email}</small>}
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Parol</label>
            <div className={`login-input ${fieldErrors.password ? "invalid" : ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0110 0v2M5 10h14v10H5z"/></svg>
              <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={e=>{setPassword(e.target.value);setFieldErrors(current=>({...current,password:""}));}} placeholder="Parolingizni kiriting" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined}/>
              <button className="password-toggle" type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"} aria-pressed={showPassword}><EyeIcon hidden={showPassword}/></button>
            </div>
            {fieldErrors.password && <small id="password-error" className="field-error">{fieldErrors.password}</small>}
          </div>
          <label className="remember-row"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/><span className="custom-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg></span><span>Meni 24 soat eslab qol</span></label>
          <button className="login-submit" type="submit" disabled={submitting}>{submitting && <span className="login-spinner" aria-hidden="true"/>}<span>{submitting ? "Kirilmoqda…" : "Kirish"}</span>{!submitting && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>}</button>
          <p className="login-security"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 4 5v4c0 4 2.5 7 6 9 3.5-2 6-5 6-9V5l-6-3Z"/></svg>Ma’lumotlaringiz xavfsiz himoyalangan</p>
        </form>
      </section>
    </main>
  </div>
}

function pageFromPath(pathname) {
  if (pathname === "/settings") return "settings";
  if (pathname === "/ai-advisor") return "ai";
  if (pathname === "/bitrix") return "bitrix";
  if (pathname === "/employees") return "employees";
  if (pathname === "/calls") return "calls";
  if (pathname === "/plan-fact") return "planFact";
  return "employees";
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 700);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [language, setLanguage] = useState(() => localStorage.getItem("language") || "uz");
  const t = translations[language] || translations.uz;

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  useEffect(() => localStorage.setItem("language", language), [language]);

  function navigate(nextPage) {
    const path = nextPage === "settings" ? "/settings" : nextPage === "ai" ? "/ai-advisor" : nextPage === "bitrix" ? "/bitrix" : nextPage === "calls" ? "/calls" : nextPage === "planFact" ? "/plan-fact" : "/employees";
    window.history.pushState({}, "", path);
    setPage(nextPage);
  }
  useEffect(() => {
    if (DEMO_MODE) {
      setUser({role: "tenant_admin", tenant_id: 1, full_name: "Demo User"});
      setLoading(false);
      return;
    }
    restoreSession().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => { setUser(null); setSessionMessage("Sessiya muddati tugadi. Qayta kiring."); };
    const popstate = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("session-expired", expired);
    window.addEventListener("popstate", popstate);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("popstate", popstate);
    };
  }, []);

  if (loading) return <div className="login-wrap auth-loading" role="status"><span className="login-spinner" aria-hidden="true"/>{t.loading}</div>;
  if (!user) return <Login sessionMessage={sessionMessage} onLogin={data => {setSessionMessage("");setUser(data); navigate("employees");}} />;

  return <div className={`shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
    <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? "‹" : "☰"}</button>
    {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside>
      <div className="brand"><BrandMark /><strong>DataFlow</strong></div>
      <a className={page==="employees"?"active":""} aria-current={page==="employees"?"page":undefined} href="/employees" onClick={e => {e.preventDefault(); navigate("employees"); setSidebarOpen(false);}}>Xodimlar natijalari</a>
      <a className={page==="bitrix"?"active":""} aria-current={page==="bitrix"?"page":undefined} href="/bitrix" onClick={e => {e.preventDefault(); navigate("bitrix"); setSidebarOpen(false);}}>Bitrix CRM</a>
      <a className={page==="calls"?"active":""} aria-current={page==="calls"?"page":undefined} href="/calls" onClick={e => {e.preventDefault(); navigate("calls"); setSidebarOpen(false);}}>Qo‘ng‘iroqlar</a>
      <a className={page==="planFact"?"active":""} aria-current={page==="planFact"?"page":undefined} href="/plan-fact" onClick={e => {e.preventDefault(); navigate("planFact"); setSidebarOpen(false);}}>Plan / Fakt</a>
      <a className={page==="ai"?"active":""} aria-current={page==="ai"?"page":undefined} href="/ai-advisor" onClick={e => {e.preventDefault(); navigate("ai"); setSidebarOpen(false);}}>{t.aiNav}</a>
      <a className={page==="settings"?"active":""} aria-current={page==="settings"?"page":undefined} href="/settings" onClick={e => {e.preventDefault(); navigate("settings"); setSidebarOpen(false);}}>{t.settings}</a>
      <button onClick={async ()=>{
        if (DEMO_MODE) return;
        try { await request("/api/auth/logout", {method: "POST"}); }
        finally { setToken(null); setUser(null); }
      }}>{t.logout}</button>
    </aside>
    <main>
      <Suspense fallback={<section className="panel" role="status">Loading page…</section>}>
        {page === "settings"
              ? <Settings user={user} onUserChange={setUser} darkMode={darkMode} setDarkMode={setDarkMode} language={language} setLanguage={setLanguage} t={t}/>
              : page === "ai"
                ? <AIAdvisor t={t}/>
                : page === "bitrix"
                  ? <Bitrix/>
                : page === "employees"
                  ? <Employees/>
                : page === "calls"
                  ? <Calls/>
                : page === "planFact"
                  ? <PlanFact user={user}/>
                : <Employees/>}</Suspense>
    </main>
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
