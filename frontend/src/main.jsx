import React, {lazy, Suspense, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {request, setToken, restoreSession} from "./api";
import BrandMark from "./components/BrandMark";
import {translations} from "./i18n";
import "./styles.css";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Team = lazy(() => import("./pages/Team"));
const Settings = lazy(() => import("./pages/Settings"));
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

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

function pageFromPath(pathname) {
  if (pathname === "/admin") return "admin";
  if (pathname === "/team") return "team";
  if (pathname === "/settings") return "settings";
  return "dashboard";
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
    const path = nextPage === "admin" ? "/admin" : nextPage === "team" ? "/team" : "/dashboard";
    window.history.pushState({}, "", path);
    setPage(nextPage);
  }
  const role = user?.role;
  const visiblePage = page === "admin" && role !== "super_admin" ? "dashboard" : page === "team" && role !== "tenant_admin" ? "dashboard" : page;
  useEffect(() => {
    if (DEMO_MODE) {
      setUser({role: "tenant_admin", tenant_id: 1, full_name: "Demo User"});
      setLoading(false);
      return;
    }
    restoreSession().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => setUser(null);
    const popstate = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("session-expired", expired);
    window.addEventListener("popstate", popstate);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("popstate", popstate);
    };
  }, []);

  if (loading) return <div className="login-wrap" role="status">{t.loading}</div>;
  if (!user) return <Login t={t} onLogin={data => {setUser(data); navigate("dashboard");}} />;

  return <div className={`shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
    <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? "‹" : "☰"}</button>
    {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside>
      <div className="brand"><BrandMark /><strong>DataFlow</strong></div>
      <a href="/dashboard" onClick={e => {e.preventDefault(); navigate("dashboard"); setSidebarOpen(false);}}>{t.dashboard}</a>
      {role === "super_admin" && <a href="/admin" onClick={e => {e.preventDefault(); navigate("admin"); setSidebarOpen(false);}}>{t.superAdmin}</a>}
      {role === "tenant_admin" && <a href="/team" onClick={e => {e.preventDefault(); navigate("team"); setSidebarOpen(false);}}>{t.team}</a>}
      <a href="/settings" onClick={e => {e.preventDefault(); navigate("settings"); setSidebarOpen(false);}}>{t.settings}</a>
      <button onClick={async ()=>{
        if (DEMO_MODE) return;
        try { await request("/api/auth/logout", {method: "POST"}); }
        finally { setToken(null); setUser(null); }
      }}>{t.logout}</button>
    </aside>
    <main>
      <Suspense fallback={<section className="panel" role="status">Loading page…</section>}>
        {visiblePage === "dashboard"
          ? <Dashboard role={role} language={language} t={t}/>
          : visiblePage === "team"
            ? <Team tenantId={user.tenant_id} t={t}/>
            : visiblePage === "settings"
              ? <Settings darkMode={darkMode} setDarkMode={setDarkMode} language={language} setLanguage={setLanguage} t={t}/>
              : <Admin t={t}/>}</Suspense>
    </main>
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
