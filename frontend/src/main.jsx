import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {request, setToken, restoreSession} from "./api";
import "./styles.css";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Team from "./pages/Team";

function Login({onLogin}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({email, password})
      });
      setToken(data.access_token);
      onLogin(data);
    } catch {
      setError("Kirish amalga oshmadi. Email, parol va kompaniya holatini tekshiring.");
    }
  }

  return <div className="login-wrap">
    <form className="login-card" onSubmit={submit}>
      <h1>LeadFlow SaaS</h1>
      <p>Analytics • Leads • CRM • Telegram</p>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/>
      <button>Sign in</button>
      {error && <small className="error">{error}</small>}
    </form>
  </div>
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const role = user?.role;
  useEffect(() => {
    localStorage.removeItem("token"); localStorage.removeItem("role");
    restoreSession().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  if (loading) return <div className="login-wrap" role="status">Loading session…</div>;
  if (!user) return <Login onLogin={data => {setUser(data); setPage("dashboard");}} />;

  return <div className="shell">
    <aside>
      <div className="brand">LeadFlow</div>
      <button onClick={()=>setPage("dashboard")}>Dashboard</button>
      {role === "super_admin" && <button onClick={()=>setPage("admin")}>Super Admin</button>}
      {role === "tenant_admin" && <button onClick={()=>setPage("team")}>Team</button>}
      <button onClick={async ()=>{
        try { await request("/api/auth/logout", {method: "POST"}); }
        finally { setToken(null); setUser(null); }
      }}>Logout</button>
    </aside>
    <main>
      {page === "dashboard" ? <Dashboard role={role}/> : page === "team" ? <Team tenantId={user.tenant_id}/> : <Admin/>}
    </main>
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
