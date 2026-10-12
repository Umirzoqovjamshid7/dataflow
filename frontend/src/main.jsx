import React, {lazy, Suspense, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {request, setToken, restoreSession} from "./api";
import BrandMark from "./components/BrandMark";
import {translations} from "./i18n";
import "./styles.css";
import AppLayout from "./components/AppLayout";
import {pageFromPath, routes} from "./navigation";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Team = lazy(() => import("./pages/Team"));
const Settings = lazy(() => import("./pages/Settings"));
const AIAdvisor = lazy(() => import("./pages/AIAdvisor"));
const Business = lazy(() => import("./pages/Business"));

function Login({onLogin, t}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({email, password})
      });
      setToken(data.access_token);
      onLogin(data);
    } catch {
      setError("Kirish amalga oshmadi. Email, parol va kompaniya holatini tekshiring.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="login-wrap">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><BrandMark className="login-logo" /><strong>DataFlow</strong></div>
      <h1>{t.signIn}</h1>
      <label htmlFor="login-email">{t.email}</label>
      <input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t.email} required/>
      <label htmlFor="login-password">{t.password}</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t.password} required/>
      <button type="submit" disabled={submitting}>{submitting ? t.loading : t.signIn}</button>
      {error && <small className="error" role="alert">{t.loginError}</small>}
    </form>
  </div>
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [navigationVersion,setNavigationVersion] = useState(0);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") !== "light");
  const [language, setLanguage] = useState(() => localStorage.getItem("language") || "uz");
  const t = translations[language] || translations.uz;

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  useEffect(() => localStorage.setItem("language", language), [language]);

  function navigate(nextPage, hash="") {
    const path = (routes[nextPage] || routes.dashboard).path + (hash ? `#${hash}` : "");
    window.history.pushState({}, "", path);
    setPage(nextPage);
    setNavigationVersion(value=>value+1);
    if (!hash) window.scrollTo({top:0});
  }
  useEffect(()=>{
    const hash=window.location.hash.slice(1);
    if(!hash) return;
    let attempts=0;
    const timer=setInterval(()=>{
      const element=document.getElementById(hash);
      if(element){element.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});clearInterval(timer);}
      else if(++attempts>=60)clearInterval(timer);
    },100);
    return ()=>clearInterval(timer);
  },[page,loading,navigationVersion]);
  const role = user?.role;
  const visiblePage = page === "admin" && role !== "super_admin" ? "dashboard" : page === "team" && role !== "tenant_admin" ? "dashboard" : page;
  useEffect(() => {
    restoreSession().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => setUser(null);
    const popstate = () => {setPage(pageFromPath(window.location.pathname));setNavigationVersion(value=>value+1);};
    window.addEventListener("session-expired", expired);
    window.addEventListener("popstate", popstate);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("popstate", popstate);
    };
  }, []);

  if (loading) return <div className="login-wrap" role="status">{t.loading}</div>;
  if (!user) return <Login t={t} onLogin={data => {setUser(data); navigate("dashboard");}} />;

  return <AppLayout page={visiblePage} user={user} onNavigate={navigate} logoutLabel={t.logout} onLogout={async ()=>{
    try { await request("/api/auth/logout", {method:"POST"}); }
    finally { setToken(null);setUser(null); }
  }}>
      <Suspense fallback={<section className="panel" role="status">Loading page…</section>}>
        {visiblePage === "dashboard"
          ? <Dashboard role={role} language={language} t={t}/>
          : visiblePage === "team"
            ? <Team tenantId={user.tenant_id} t={t}/>
            : visiblePage === "settings"
              ? <Settings role={role} darkMode={darkMode} setDarkMode={setDarkMode} language={language} setLanguage={setLanguage} t={t}/>
              : visiblePage === "ai"
                ? <AIAdvisor role={role} t={t}/>
                : ["crm","employees","calls","plans"].includes(visiblePage)
                  ? <Business section={visiblePage} role={role}/>
                  : <Admin t={t}/>}</Suspense>
  </AppLayout>
}

createRoot(document.getElementById("root")).render(<App/>);
