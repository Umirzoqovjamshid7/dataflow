import React, {lazy, Suspense, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {request, setToken, restoreSession} from "./api";
import "./styles.css";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Team = lazy(() => import("./pages/Team"));

function Login({onLogin}) {
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
      <h1>LeadFlow SaaS</h1>
      <p>Analytics • Leads • CRM • Telegram</p>
      <label htmlFor="login-email">Email</label>
      <input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required/>
      <label htmlFor="login-password">Password</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required/>
      <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      {error && <small className="error" role="alert">{error}</small>}
    </form>
  </div>
}

function pageFromPath(pathname) {
  if (pathname === "/admin") return "admin";
  if (pathname === "/team") return "team";
  return "dashboard";
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));

  function navigate(nextPage) {
    const path = nextPage === "admin" ? "/admin" : nextPage === "team" ? "/team" : "/dashboard";
    window.history.pushState({}, "", path);
    setPage(nextPage);
  }
  const role = user?.role;
  const visiblePage = page === "admin" && role !== "super_admin" ? "dashboard" : page === "team" && role !== "tenant_admin" ? "dashboard" : page;
  useEffect(() => {
    localStorage.removeItem("token"); localStorage.removeItem("role");
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

  if (loading) return <div className="login-wrap" role="status">Loading session…</div>;
  if (!user) return <Login onLogin={data => {setUser(data); navigate("dashboard");}} />;

  return <div className="shell">
    <aside>
      <div className="brand">LeadFlow</div>
      <a href="/dashboard" onClick={e => {e.preventDefault(); navigate("dashboard");}}>Dashboard</a>
      {role === "super_admin" && <a href="/admin" onClick={e => {e.preventDefault(); navigate("admin");}}>Super Admin</a>}
      {role === "tenant_admin" && <a href="/team" onClick={e => {e.preventDefault(); navigate("team");}}>Team</a>}
      <button onClick={async ()=>{
        try { await request("/api/auth/logout", {method: "POST"}); }
        finally { setToken(null); setUser(null); }
      }}>Logout</button>
    </aside>
    <main>
      <Suspense fallback={<section className="panel" role="status">Loading page…</section>}>
        {visiblePage === "dashboard" ? <Dashboard role={role}/> : visiblePage === "team" ? <Team tenantId={user.tenant_id}/> : <Admin/>}
      </Suspense>
    </main>
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
