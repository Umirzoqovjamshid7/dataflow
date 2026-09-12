import React, {useEffect, useState} from "react";
import {request} from "../api";
import Team from "./Team";
import Kpi from "../components/Kpi";

export default function Admin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function load() {
    request("/api/admin/tenants").then(setTenants).catch(e => setError(e.message));
    request("/api/admin/summary").then(setSummary).catch(e => setError(e.message));
  }

  useEffect(load, []);

  async function createTenant(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
    await request("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({name, slug})
    });
    setName(""); setSlug(""); load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="page-head"><div><h1>Super Admin</h1><p>All SaaS customers in one place</p></div></div>
    {summary && <div className="kpis">{Object.entries(summary).filter(([key]) => key !== "metric_source").map(([key, value]) => <Kpi key={key} label={key.replaceAll("_", " ")} value={value}/>)}</div>}
    {selected && <><button onClick={() => setSelected(null)}>Close team</button><Team tenantId={selected}/></>}

    <section className="panel">
      <h2>Create client</h2>
      <form className="inline-form" onSubmit={createTenant}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Company name" required/>
        <input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="company-slug" required/>
        <button disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </section>

    <section className="panel">
      <h2>Clients</h2>
      <div className="tenant-grid">
        {tenants.map(t=><div className="tenant-card" key={t.id}>
          <div><strong>{t.name}</strong><small>/{t.slug}</small></div>
          <div className="tenant-stats">
            <span>Users <b>{t.users}</b></span>
            <span>Leads <b>{t.leads}</b></span>
          </div>
          <span className={t.active ? "status on" : "status"}>{t.active ? "Active" : "Disabled"}</span>
          <button onClick={() => setSelected(t.id)}>Manage team</button>
          <button onClick={async () => {
            if (!window.confirm(`${t.active ? "Disable" : "Activate"} ${t.name}?`)) return;
            try { await request(`/api/admin/tenants/${t.id}`, {method: "PATCH", body: JSON.stringify({active: !t.active})}); load(); }
            catch (e) { setError(e.message); }
          }}>{t.active ? "Disable" : "Activate"}</button>
        </div>)}
      </div>
    </section>
  </div>
}
